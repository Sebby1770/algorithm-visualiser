/* ============================================================
   DB Lab — a small relational database engine
   Works in the browser (global DbCore) and Node (CJS).

   Pipeline for every statement:
     SQL text → tokenize → parse (AST) → plan (cost-based) → execute
   Storage underneath:
     heap pages (slotted) ←→ buffer pool (LRU / Clock) ←→ "disk"
     B+ tree indexes (node pages also live in the buffer pool)
     write-ahead log (WAL) with ARIES-lite crash recovery

   Every layer appends plain-object events to a trace so the UI can
   replay exactly what happened, one step at a time. The engine
   itself is synchronous and deterministic.

   Deliberate simplifications (each one is called out where it lives):
     · single session — no concurrency control or locking
     · DDL (CREATE / DROP) is written straight through to the catalog
     · indexes are not logged; recovery rebuilds them from the heap
     · deleted heap slots become tombstones and are never reused
   ============================================================ */

(function (root) {
  // ---------- Errors & small helpers ----------

  class DbError extends Error {
    constructor(message, position = null) {
      super(message);
      this.name = "DbError";
      this.position = position;
    }
  }

  /** mulberry32 — tiny seeded PRNG so demos and tests are reproducible. */
  function createRng(seed = 1) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  /**
   * Total order used by ORDER BY, DISTINCT and B+ tree keys:
   * NULL < numbers < strings (the same ordering SQLite uses).
   */
  function compareValues(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const ta = typeof a;
    const tb = typeof b;
    if (ta !== tb) return ta === "number" ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function formatValue(v) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "string") return "'" + v.replace(/'/g, "''") + "'";
    return String(v);
  }

  // ---------- Tokenizer ----------

  const KEYWORDS = new Set([
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
    "CREATE", "TABLE", "INDEX", "UNIQUE", "ON", "DROP", "PRIMARY", "KEY", "NOT", "NULL",
    "AND", "OR", "IS", "IN", "BETWEEN", "LIKE", "AS", "JOIN", "INNER", "ORDER", "BY",
    "GROUP", "HAVING", "LIMIT", "OFFSET", "ASC", "DESC", "DISTINCT", "BEGIN", "TRANSACTION",
    "COMMIT", "ROLLBACK", "EXPLAIN", "ANALYZE", "TRUE", "FALSE", "IF", "EXISTS",
  ]);

  const TWO_CHAR_OPS = new Set(["<=", ">=", "<>", "!=", "||"]);
  const ONE_CHAR_OPS = new Set(["=", "<", ">", "+", "-", "*", "/", "%"]);
  const PUNCT = new Set(["(", ")", ",", ".", ";"]);

  /**
   * Splits SQL into tokens. Keywords are upper-cased, identifiers are
   * lower-cased (SQL names are case-insensitive), and every token keeps
   * the character offset it started at so errors can point at it.
   */
  function tokenize(sql) {
    const tokens = [];
    const src = String(sql);
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "-" && src[i + 1] === "-") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (ch === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) throw new DbError("unterminated /* comment", i);
        i = end + 2;
        continue;
      }
      const start = i;
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
        while (i < src.length && /[0-9]/.test(src[i])) i++;
        let isReal = false;
        if (src[i] === "." && /[0-9]/.test(src[i + 1] || "")) {
          isReal = true;
          i++;
          while (i < src.length && /[0-9]/.test(src[i])) i++;
        }
        if (/[A-Za-z_]/.test(src[i] || "")) throw new DbError("malformed number", start);
        tokens.push({ type: "number", value: Number(src.slice(start, i)), isReal, pos: start, end: i });
        continue;
      }
      if (ch === "'") {
        let value = "";
        i++;
        for (;;) {
          if (i >= src.length) throw new DbError("unterminated string literal", start);
          if (src[i] === "'") {
            if (src[i + 1] === "'") {
              value += "'";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          value += src[i++];
        }
        tokens.push({ type: "string", value, pos: start, end: i });
        continue;
      }
      if (ch === '"') {
        const end = src.indexOf('"', i + 1);
        if (end < 0) throw new DbError("unterminated quoted identifier", start);
        i = end + 1;
        tokens.push({ type: "ident", value: src.slice(start + 1, end).toLowerCase(), pos: start, end: i });
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
        const word = src.slice(start, i);
        const upper = word.toUpperCase();
        if (KEYWORDS.has(upper)) tokens.push({ type: "keyword", value: upper, pos: start, end: i });
        else tokens.push({ type: "ident", value: word.toLowerCase(), pos: start, end: i });
        continue;
      }
      const two = src.slice(i, i + 2);
      if (TWO_CHAR_OPS.has(two)) {
        i += 2;
        tokens.push({ type: "op", value: two === "!=" ? "<>" : two, pos: start, end: i });
        continue;
      }
      if (ONE_CHAR_OPS.has(ch)) {
        i++;
        tokens.push({ type: "op", value: ch, pos: start, end: i });
        continue;
      }
      if (PUNCT.has(ch)) {
        i++;
        tokens.push({ type: "punct", value: ch, pos: start, end: i });
        continue;
      }
      throw new DbError(`unexpected character '${ch}'`, start);
    }
    tokens.push({ type: "eof", value: null, pos: src.length, end: src.length });
    return tokens;
  }

  // ---------- Parser ----------
  /*
    Recursive descent, one function per grammar rule. AST shapes:

    Statements
      { type: "select", distinct, columns: [Item], from: Ref|null, joins: [Ref & { on }],
        where, groupBy: [Expr], having, orderBy: [{ expr, desc }], limit, offset }
        Item = { expr, alias, text } | { star: true, table|null }
        Ref  = { table, alias, pos }
      { type: "explain", analyze, select }
      { type: "insert", table, columns: [name]|null, rows: [[Expr]] }
      { type: "update", table, assignments: [{ column, expr, pos }], where }
      { type: "delete", table, where }
      { type: "create_table", table, ifNotExists, columns: [{ name, type, primaryKey, notNull, unique }] }
      { type: "create_index", name, table, column, unique }
      { type: "drop_table", table, ifExists }
      { type: "begin" } | { type: "commit" } | { type: "rollback" }

    Expressions
      { type: "literal", value, valueType: "INT"|"REAL"|"TEXT"|"NULL" }
      { type: "column", table|null, name, pos }
      { type: "unary", op: "-"|"NOT", expr }
      { type: "binary", op: "+ - * / % || = <> < <= > >= AND OR", left, right }
      { type: "isnull", expr, not } · { type: "between", expr, low, high, not }
      { type: "in", expr, list, not } · { type: "like", expr, pattern, not }
      { type: "agg", name: "count"|"sum"|"avg"|"min"|"max", arg|null (= *), distinct, pos }
      { type: "call", name, args, pos }   (lower, upper, length, abs, round, coalesce)
  */

  const AGGREGATES = new Set(["count", "sum", "avg", "min", "max"]);
  const SCALAR_FUNCTIONS = new Set(["lower", "upper", "length", "abs", "round", "coalesce"]);

  function describeToken(tok) {
    if (tok.type === "eof") return "end of input";
    if (tok.type === "string") return `'${tok.value}'`;
    return `"${tok.value}"`;
  }

  class Parser {
    constructor(sql) {
      this.sql = String(sql);
      this.tokens = tokenize(this.sql);
      this.i = 0;
    }

    peek(offset = 0) {
      return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
    }

    next() {
      return this.tokens[this.i++];
    }

    fail(message, tok = this.peek()) {
      throw new DbError(`${message} near ${describeToken(tok)}`, tok.pos);
    }

    isKw(value, offset = 0) {
      const t = this.peek(offset);
      return t.type === "keyword" && t.value === value;
    }

    acceptKw(value) {
      return this.isKw(value) ? this.next() : null;
    }

    expectKw(value) {
      if (!this.isKw(value)) this.fail(`expected ${value}`);
      return this.next();
    }

    isPunct(value, offset = 0) {
      const t = this.peek(offset);
      return t.type === "punct" && t.value === value;
    }

    acceptPunct(value) {
      return this.isPunct(value) ? this.next() : null;
    }

    expectPunct(value) {
      if (!this.isPunct(value)) this.fail(`expected "${value}"`);
      return this.next();
    }

    isOp(value) {
      const t = this.peek();
      return t.type === "op" && t.value === value;
    }

    ident(what) {
      const t = this.peek();
      if (t.type === "ident") {
        this.i++;
        return t.value;
      }
      if (t.type === "keyword") this.fail(`expected ${what} (${t.value} is a reserved word)`);
      return this.fail(`expected ${what}`);
    }

    /** Parses the next statement, or returns null at end of input. */
    nextStatement() {
      while (this.acceptPunct(";"));
      if (this.peek().type === "eof") return null;
      const first = this.peek();
      const ast = this.parseStatement();
      const last = this.tokens[this.i - 1];
      if (!this.isPunct(";") && this.peek().type !== "eof") this.fail('expected ";" between statements');
      return { ast, sql: this.sql.slice(first.pos, last.end).trim(), start: first.pos, end: last.end };
    }

    /** Where a failed statement starts, so its error can quote that statement. */
    statementSpan(fromIndex) {
      let k = fromIndex;
      while (k < this.tokens.length - 1 && this.tokens[k].type === "punct" && this.tokens[k].value === ";") k++;
      const first = this.tokens[Math.min(k, this.tokens.length - 1)];
      let j = k;
      while (j < this.tokens.length - 1 && !(this.tokens[j].type === "punct" && this.tokens[j].value === ";")) j++;
      const last = this.tokens[Math.max(k, j - 1)];
      return { start: first.pos, sql: this.sql.slice(first.pos, Math.max(first.pos, last.end)).trim() };
    }

    parseStatements() {
      const statements = [];
      for (let stmt = this.nextStatement(); stmt; stmt = this.nextStatement()) statements.push(stmt);
      return statements;
    }

    parseStatement() {
      if (this.acceptKw("EXPLAIN")) {
        const analyze = !!this.acceptKw("ANALYZE");
        if (!this.isKw("SELECT")) this.fail("EXPLAIN only supports SELECT");
        return { type: "explain", analyze, select: this.parseSelect() };
      }
      if (this.isKw("SELECT")) return this.parseSelect();
      if (this.isKw("INSERT")) return this.parseInsert();
      if (this.isKw("UPDATE")) return this.parseUpdate();
      if (this.isKw("DELETE")) return this.parseDelete();
      if (this.acceptKw("CREATE")) {
        if (this.acceptKw("TABLE")) return this.parseCreateTable();
        const unique = !!this.acceptKw("UNIQUE");
        if (this.acceptKw("INDEX")) return this.parseCreateIndex(unique);
        return this.fail("expected TABLE or INDEX after CREATE");
      }
      if (this.acceptKw("DROP")) {
        this.expectKw("TABLE");
        let ifExists = false;
        if (this.acceptKw("IF")) {
          this.expectKw("EXISTS");
          ifExists = true;
        }
        return { type: "drop_table", table: this.ident("table name"), ifExists };
      }
      if (this.acceptKw("BEGIN")) {
        this.acceptKw("TRANSACTION");
        return { type: "begin" };
      }
      if (this.acceptKw("COMMIT")) {
        this.acceptKw("TRANSACTION");
        return { type: "commit" };
      }
      if (this.acceptKw("ROLLBACK")) {
        this.acceptKw("TRANSACTION");
        return { type: "rollback" };
      }
      return this.fail("expected a statement (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, BEGIN, COMMIT, ROLLBACK or EXPLAIN)");
    }

    parseCreateTable() {
      let ifNotExists = false;
      if (this.acceptKw("IF")) {
        this.expectKw("NOT");
        this.expectKw("EXISTS");
        ifNotExists = true;
      }
      const table = this.ident("table name");
      this.expectPunct("(");
      const columns = [];
      do {
        const name = this.ident("column name");
        const typeTok = this.peek();
        if (typeTok.type !== "ident") this.fail("expected a column type (INT, REAL or TEXT)");
        this.next();
        const type = normalizeType(typeTok.value);
        if (!type) this.fail(`unknown column type ${typeTok.value.toUpperCase()}`, typeTok);
        if (this.acceptPunct("(")) {
          if (this.peek().type !== "number") this.fail("expected a length");
          this.next();
          this.expectPunct(")");
        }
        const col = { name, type, primaryKey: false, notNull: false, unique: false };
        for (;;) {
          if (this.acceptKw("PRIMARY")) {
            this.expectKw("KEY");
            col.primaryKey = true;
            col.notNull = true;
          } else if (this.isKw("NOT")) {
            this.next();
            this.expectKw("NULL");
            col.notNull = true;
          } else if (this.acceptKw("UNIQUE")) {
            col.unique = true;
          } else if (this.acceptKw("NULL")) {
            /* explicitly nullable — the default */
          } else {
            break;
          }
        }
        columns.push(col);
      } while (this.acceptPunct(","));
      this.expectPunct(")");
      return { type: "create_table", table, ifNotExists, columns };
    }

    parseCreateIndex(unique) {
      const name = this.ident("index name");
      this.expectKw("ON");
      const table = this.ident("table name");
      this.expectPunct("(");
      const column = this.ident("column name");
      if (this.isPunct(",")) this.fail("only single-column indexes are supported");
      this.expectPunct(")");
      return { type: "create_index", name, table, column, unique };
    }

    parseInsert() {
      this.expectKw("INSERT");
      this.expectKw("INTO");
      const table = this.ident("table name");
      let columns = null;
      if (this.acceptPunct("(")) {
        columns = [];
        do columns.push(this.ident("column name"));
        while (this.acceptPunct(","));
        this.expectPunct(")");
      }
      this.expectKw("VALUES");
      const rows = [];
      do {
        this.expectPunct("(");
        const row = [];
        do row.push(this.parseExpr());
        while (this.acceptPunct(","));
        this.expectPunct(")");
        rows.push(row);
      } while (this.acceptPunct(","));
      return { type: "insert", table, columns, rows };
    }

    parseUpdate() {
      this.expectKw("UPDATE");
      const table = this.ident("table name");
      this.expectKw("SET");
      const assignments = [];
      do {
        const pos = this.peek().pos;
        const column = this.ident("column name");
        if (!this.isOp("=")) this.fail('expected "="');
        this.next();
        assignments.push({ column, expr: this.parseExpr(), pos });
      } while (this.acceptPunct(","));
      const where = this.acceptKw("WHERE") ? this.parseExpr() : null;
      return { type: "update", table, assignments, where };
    }

    parseDelete() {
      this.expectKw("DELETE");
      this.expectKw("FROM");
      const table = this.ident("table name");
      const where = this.acceptKw("WHERE") ? this.parseExpr() : null;
      return { type: "delete", table, where };
    }

    parseSelect() {
      this.expectKw("SELECT");
      const distinct = !!this.acceptKw("DISTINCT");
      const columns = [];
      do columns.push(this.parseSelectItem());
      while (this.acceptPunct(","));
      let from = null;
      const joins = [];
      if (this.acceptKw("FROM")) {
        from = this.parseTableRef();
        for (;;) {
          if (this.isKw("JOIN") || (this.isKw("INNER") && this.isKw("JOIN", 1))) {
            this.acceptKw("INNER");
            this.expectKw("JOIN");
            const ref = this.parseTableRef();
            this.expectKw("ON");
            joins.push({ ...ref, on: this.parseExpr() });
          } else if (this.acceptPunct(",")) {
            joins.push({ ...this.parseTableRef(), on: null });
          } else {
            break;
          }
        }
      }
      const where = this.acceptKw("WHERE") ? this.parseExpr() : null;
      const groupBy = [];
      if (this.acceptKw("GROUP")) {
        this.expectKw("BY");
        do groupBy.push(this.parseExpr());
        while (this.acceptPunct(","));
      }
      const having = this.acceptKw("HAVING") ? this.parseExpr() : null;
      const orderBy = [];
      if (this.acceptKw("ORDER")) {
        this.expectKw("BY");
        do {
          const expr = this.parseExpr();
          let desc = false;
          if (this.acceptKw("DESC")) desc = true;
          else this.acceptKw("ASC");
          orderBy.push({ expr, desc });
        } while (this.acceptPunct(","));
      }
      let limit = null;
      let offset = null;
      if (this.acceptKw("LIMIT")) {
        limit = this.parseCount("LIMIT");
        if (this.acceptKw("OFFSET")) offset = this.parseCount("OFFSET");
      }
      return { type: "select", distinct, columns, from, joins, where, groupBy, having, orderBy, limit, offset };
    }

    parseCount(what) {
      const t = this.peek();
      if (t.type !== "number" || t.isReal) this.fail(`${what} needs a whole number`);
      this.next();
      return t.value;
    }

    parseSelectItem() {
      if (this.isOp("*")) {
        this.next();
        return { star: true, table: null };
      }
      if (this.peek().type === "ident" && this.isPunct(".", 1) && this.peek(2).type === "op" && this.peek(2).value === "*") {
        const table = this.next().value;
        this.next();
        this.next();
        return { star: true, table };
      }
      const first = this.peek();
      const expr = this.parseExpr();
      const last = this.tokens[this.i - 1];
      let alias = null;
      if (this.acceptKw("AS")) alias = this.ident("alias");
      else if (this.peek().type === "ident") alias = this.next().value;
      return { expr, alias, text: this.sql.slice(first.pos, last.end).trim() };
    }

    parseTableRef() {
      const pos = this.peek().pos;
      const table = this.ident("table name");
      let alias = null;
      if (this.acceptKw("AS")) alias = this.ident("alias");
      else if (this.peek().type === "ident") alias = this.next().value;
      return { table, alias: alias || table, pos };
    }

    parseExprList() {
      const list = [];
      do list.push(this.parseExpr());
      while (this.acceptPunct(","));
      return list;
    }

    parseExpr() {
      return this.parseOr();
    }

    parseOr() {
      let left = this.parseAnd();
      while (this.acceptKw("OR")) left = { type: "binary", op: "OR", left, right: this.parseAnd() };
      return left;
    }

    parseAnd() {
      let left = this.parseNot();
      while (this.acceptKw("AND")) left = { type: "binary", op: "AND", left, right: this.parseNot() };
      return left;
    }

    parseNot() {
      if (this.acceptKw("NOT")) return { type: "unary", op: "NOT", expr: this.parseNot() };
      return this.parseComparison();
    }

    parseComparison() {
      let left = this.parseAdditive();
      for (;;) {
        const t = this.peek();
        if (t.type === "op" && ["=", "<>", "<", "<=", ">", ">="].includes(t.value)) {
          this.next();
          left = { type: "binary", op: t.value, left, right: this.parseAdditive() };
          continue;
        }
        if (this.acceptKw("IS")) {
          const not = !!this.acceptKw("NOT");
          this.expectKw("NULL");
          left = { type: "isnull", expr: left, not };
          continue;
        }
        let not = false;
        if (this.isKw("NOT") && (this.isKw("BETWEEN", 1) || this.isKw("IN", 1) || this.isKw("LIKE", 1))) {
          this.next();
          not = true;
        }
        if (this.acceptKw("BETWEEN")) {
          // Parse the bounds one level below AND so "BETWEEN 1 AND 5" keeps its AND.
          const low = this.parseAdditive();
          this.expectKw("AND");
          left = { type: "between", expr: left, low, high: this.parseAdditive(), not };
          continue;
        }
        if (this.acceptKw("IN")) {
          this.expectPunct("(");
          if (this.isKw("SELECT")) this.fail("subqueries are not supported");
          const list = this.parseExprList();
          this.expectPunct(")");
          left = { type: "in", expr: left, list, not };
          continue;
        }
        if (this.acceptKw("LIKE")) {
          left = { type: "like", expr: left, pattern: this.parseAdditive(), not };
          continue;
        }
        if (not) this.fail("expected BETWEEN, IN or LIKE after NOT");
        return left;
      }
    }

    parseAdditive() {
      let left = this.parseMultiplicative();
      for (;;) {
        const t = this.peek();
        if (t.type === "op" && (t.value === "+" || t.value === "-" || t.value === "||")) {
          this.next();
          left = { type: "binary", op: t.value, left, right: this.parseMultiplicative() };
        } else {
          return left;
        }
      }
    }

    parseMultiplicative() {
      let left = this.parseUnary();
      for (;;) {
        const t = this.peek();
        if (t.type === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) {
          this.next();
          left = { type: "binary", op: t.value, left, right: this.parseUnary() };
        } else {
          return left;
        }
      }
    }

    parseUnary() {
      if (this.isOp("-")) {
        this.next();
        const expr = this.parseUnary();
        if (expr.type === "literal" && typeof expr.value === "number") return { ...expr, value: -expr.value };
        return { type: "unary", op: "-", expr };
      }
      if (this.isOp("+")) {
        this.next();
        return this.parseUnary();
      }
      return this.parsePrimary();
    }

    parsePrimary() {
      const t = this.peek();
      if (t.type === "number") {
        this.next();
        return { type: "literal", value: t.value, valueType: t.isReal ? "REAL" : "INT" };
      }
      if (t.type === "string") {
        this.next();
        return { type: "literal", value: t.value, valueType: "TEXT" };
      }
      if (this.acceptKw("NULL")) return { type: "literal", value: null, valueType: "NULL" };
      if (this.acceptKw("TRUE")) return { type: "literal", value: 1, valueType: "INT" };
      if (this.acceptKw("FALSE")) return { type: "literal", value: 0, valueType: "INT" };
      if (this.acceptPunct("(")) {
        if (this.isKw("SELECT")) this.fail("subqueries are not supported");
        const expr = this.parseExpr();
        this.expectPunct(")");
        return expr;
      }
      if (t.type === "ident") {
        if (this.isPunct("(", 1)) return this.parseCall();
        this.next();
        if (this.acceptPunct(".")) return { type: "column", table: t.value, name: this.ident("column name"), pos: t.pos };
        return { type: "column", table: null, name: t.value, pos: t.pos };
      }
      return this.fail("expected an expression");
    }

    parseCall() {
      const t = this.next();
      const name = t.value;
      this.expectPunct("(");
      if (AGGREGATES.has(name)) {
        const distinct = !!this.acceptKw("DISTINCT");
        let arg = null;
        if (name === "count" && this.isOp("*")) {
          if (distinct) this.fail("COUNT(DISTINCT *) is not valid");
          this.next();
        } else {
          arg = this.parseExpr();
        }
        this.expectPunct(")");
        return { type: "agg", name, arg, distinct, pos: t.pos };
      }
      if (!SCALAR_FUNCTIONS.has(name)) this.fail(`unknown function ${name.toUpperCase()}()`, t);
      const args = this.isPunct(")") ? [] : this.parseExprList();
      this.expectPunct(")");
      return { type: "call", name, args, pos: t.pos };
    }
  }

  function normalizeType(word) {
    const w = word.toLowerCase();
    if (w === "int" || w === "integer" || w === "bigint" || w === "smallint") return "INT";
    if (w === "real" || w === "float" || w === "double" || w === "numeric" || w === "decimal") return "REAL";
    if (w === "text" || w === "varchar" || w === "char" || w === "string") return "TEXT";
    return null;
  }

  function parse(sql) {
    return { statements: new Parser(sql).parseStatements() };
  }

  /**
   * Splits a script into statements without running anything. Statements
   * before a syntax error are still returned, mirroring how execute() runs
   * everything up to the first failure.
   */
  function splitStatements(sql) {
    const statements = [];
    let parser;
    try {
      parser = new Parser(sql);
    } catch (err) {
      if (!(err instanceof DbError)) throw err;
      return { statements, error: { message: err.message, position: err.position, sql: String(sql).trim(), start: 0 } };
    }
    for (;;) {
      const startIndex = parser.i;
      try {
        const stmt = parser.nextStatement();
        if (!stmt) return { statements, error: null };
        statements.push({ sql: stmt.sql, start: stmt.start, end: stmt.end, kind: stmt.ast.type });
      } catch (err) {
        if (!(err instanceof DbError)) throw err;
        const span = parser.statementSpan(startIndex);
        return { statements, error: { message: err.message, position: err.position, sql: span.sql, start: span.start } };
      }
    }
  }

  // ---------- B+ tree ----------

  /**
   * B+ tree index. Internal nodes hold separator keys; every entry lives
   * in a leaf, and leaves are chained left → right for range scans.
   *   order m  = max children of an internal node
   *   max keys = m − 1 per node
   *   min keys = ⌈m/2⌉ − 1 per non-root node
   * Separator rule: for keys[i] of an internal node, every key in
   * children[i] is < keys[i] ≤ every key in children[i + 1]. Deleting a
   * leaf's smallest key can leave a stale separator above it; that's fine,
   * because the rule above still holds.
   * Leaf entries are (key, [rid, …]) so a non-unique index stores each
   * distinct key once.
   *
   * Hooks set by the database: touch(nodeId, dirty) charges node accesses
   * to the buffer pool; onFree(nodeId) drops a merged-away node's page.
   */
  class BPlusTree {
    constructor({ order = 4, unique = false } = {}) {
      this.order = clamp(Math.floor(order), 3, 8);
      this.unique = unique;
      this.maxKeys = this.order - 1;
      this.minKeys = Math.ceil(this.order / 2) - 1;
      this.nodes = new Map();
      this.nextId = 0;
      this.touch = null;
      this.onFree = null;
      this.size = 0;
      this.root = this.newNode(true).id;
    }

    newNode(leaf) {
      const node = { id: "n" + this.nextId++, leaf, keys: [], children: leaf ? null : [], rids: leaf ? [] : null, next: null };
      this.nodes.set(node.id, node);
      if (this.touch) this.touch(node.id, true, true);
      return node;
    }

    visit(id, sink) {
      if (this.touch) this.touch(id, false, false);
      if (sink) sink.push({ type: "visit", node: id });
      return this.nodes.get(id);
    }

    modified(...nodes) {
      if (this.touch) nodes.forEach((n) => this.touch(n.id, true, false));
    }

    freeNode(node) {
      this.nodes.delete(node.id);
      if (this.onFree) this.onFree(node.id);
    }

    /** Index of the child subtree that may hold `key` (undefined → leftmost). */
    childIndex(node, key) {
      if (key === undefined) return 0;
      let i = 0;
      while (i < node.keys.length && compareValues(key, node.keys[i]) >= 0) i++;
      return i;
    }

    /** First position in a sorted key array whose key is ≥ `key`. */
    lowerBound(keys, key) {
      let lo = 0;
      let hi = keys.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (compareValues(keys[mid], key) < 0) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    /** Walks root → leaf; returns the leaf and the (node, childIndex) path above it. */
    descend(key, sink) {
      const path = [];
      let node = this.visit(this.root, sink);
      while (!node.leaf) {
        const idx = this.childIndex(node, key);
        path.push({ node, idx });
        node = this.visit(node.children[idx], sink);
      }
      return { leaf: node, path };
    }

    search(key, sink) {
      if (key === null || key === undefined) return [];
      const { leaf } = this.descend(key, sink);
      const pos = this.lowerBound(leaf.keys, key);
      if (pos < leaf.keys.length && compareValues(leaf.keys[pos], key) === 0) return leaf.rids[pos].slice();
      return [];
    }

    insert(key, rid, sink) {
      if (key === null || key === undefined) return false;
      const { leaf, path } = this.descend(key, sink);
      const pos = this.lowerBound(leaf.keys, key);
      if (pos < leaf.keys.length && compareValues(leaf.keys[pos], key) === 0) {
        if (this.unique) throw new DbError(`duplicate key ${formatValue(key)} in a unique index`);
        leaf.rids[pos].push(rid);
        this.modified(leaf);
        if (sink) sink.push({ type: "insert-key", node: leaf.id, key, duplicate: true });
        return true;
      }
      leaf.keys.splice(pos, 0, key);
      leaf.rids.splice(pos, 0, [rid]);
      this.size++;
      this.modified(leaf);
      if (sink) sink.push({ type: "insert-key", node: leaf.id, key });
      if (leaf.keys.length > this.maxKeys) this.splitLeaf(leaf, path, sink);
      return true;
    }

    splitLeaf(leaf, path, sink) {
      const right = this.newNode(true);
      const cut = Math.ceil(leaf.keys.length / 2);
      right.keys = leaf.keys.splice(cut);
      right.rids = leaf.rids.splice(cut);
      right.next = leaf.next;
      leaf.next = right.id;
      this.modified(leaf, right);
      // Leaf splits COPY the first right-hand key up; the entry stays in the leaf.
      const promoted = right.keys[0];
      if (sink) sink.push({ type: "split", node: leaf.id, newNode: right.id, promoted, leaf: true });
      this.insertIntoParent(leaf, promoted, right, path, sink);
    }

    splitInternal(node, path, sink) {
      const right = this.newNode(false);
      const mid = Math.floor(node.keys.length / 2);
      const promoted = node.keys[mid];
      right.keys = node.keys.splice(mid + 1);
      node.keys.pop(); // internal splits MOVE the middle key up
      right.children = node.children.splice(mid + 1);
      this.modified(node, right);
      if (sink) sink.push({ type: "split", node: node.id, newNode: right.id, promoted, leaf: false });
      this.insertIntoParent(node, promoted, right, path, sink);
    }

    insertIntoParent(left, key, right, path, sink) {
      if (!path.length) {
        const root = this.newNode(false);
        root.keys = [key];
        root.children = [left.id, right.id];
        this.root = root.id;
        this.modified(root);
        if (sink) sink.push({ type: "new-root", node: root.id, key });
        return;
      }
      const { node: parent, idx } = path.pop();
      parent.keys.splice(idx, 0, key);
      parent.children.splice(idx + 1, 0, right.id);
      this.modified(parent);
      if (sink) sink.push({ type: "insert-key", node: parent.id, key, separator: true });
      if (parent.keys.length > this.maxKeys) this.splitInternal(parent, path, sink);
    }

    /** Removes `rid` from `key` (or the whole key when rid is omitted). */
    delete(key, rid, sink) {
      if (key === null || key === undefined) return false;
      const { leaf, path } = this.descend(key, sink);
      const pos = this.lowerBound(leaf.keys, key);
      if (pos >= leaf.keys.length || compareValues(leaf.keys[pos], key) !== 0) return false;
      const rids = leaf.rids[pos];
      if (rid !== undefined && rid !== null) {
        const at = rids.indexOf(rid);
        if (at < 0) return false;
        if (rids.length > 1) {
          rids.splice(at, 1);
          this.modified(leaf);
          if (sink) sink.push({ type: "remove-key", node: leaf.id, key, duplicate: true });
          return true;
        }
      }
      leaf.keys.splice(pos, 1);
      leaf.rids.splice(pos, 1);
      this.size--;
      this.modified(leaf);
      if (sink) sink.push({ type: "remove-key", node: leaf.id, key });
      this.rebalance(leaf, path, sink);
      return true;
    }

    /** Restores minimum fill after a removal by borrowing or merging, walking up. */
    rebalance(node, path, sink) {
      if (!path.length) {
        // The root may hold any number of keys; an internal root left with a
        // single child is removed so the tree gets one level shorter.
        if (!node.leaf && node.keys.length === 0) {
          this.root = node.children[0];
          this.freeNode(node);
          if (sink) sink.push({ type: "collapse-root", node: this.root, removed: node.id });
        }
        return;
      }
      if (node.keys.length >= this.minKeys) return;
      const { node: parent, idx } = path[path.length - 1];
      const left = idx > 0 ? this.visit(parent.children[idx - 1], sink) : null;
      const right = idx < parent.children.length - 1 ? this.visit(parent.children[idx + 1], sink) : null;
      if (left && left.keys.length > this.minKeys) {
        this.borrowFromLeft(node, left, parent, idx, sink);
        return;
      }
      if (right && right.keys.length > this.minKeys) {
        this.borrowFromRight(node, right, parent, idx, sink);
        return;
      }
      if (left) this.merge(left, node, parent, idx - 1, sink);
      else this.merge(node, right, parent, idx, sink);
      path.pop();
      this.rebalance(parent, path, sink);
    }

    borrowFromLeft(node, left, parent, idx, sink) {
      if (node.leaf) {
        node.keys.unshift(left.keys.pop());
        node.rids.unshift(left.rids.pop());
        parent.keys[idx - 1] = node.keys[0];
      } else {
        // Rotate through the parent: separator down, sibling's last key up.
        node.keys.unshift(parent.keys[idx - 1]);
        node.children.unshift(left.children.pop());
        parent.keys[idx - 1] = left.keys.pop();
      }
      this.modified(node, left, parent);
      if (sink) sink.push({ type: "borrow", from: left.id, to: node.id, key: parent.keys[idx - 1] });
    }

    borrowFromRight(node, right, parent, idx, sink) {
      if (node.leaf) {
        node.keys.push(right.keys.shift());
        node.rids.push(right.rids.shift());
        parent.keys[idx] = right.keys[0];
      } else {
        node.keys.push(parent.keys[idx]);
        node.children.push(right.children.shift());
        parent.keys[idx] = right.keys.shift();
      }
      this.modified(node, right, parent);
      if (sink) sink.push({ type: "borrow", from: right.id, to: node.id, key: parent.keys[idx] });
    }

    /** Folds `right` into `left`; sepIdx is the parent separator between them. */
    merge(left, right, parent, sepIdx, sink) {
      if (left.leaf) {
        left.keys.push(...right.keys);
        left.rids.push(...right.rids);
        left.next = right.next;
      } else {
        left.keys.push(parent.keys[sepIdx], ...right.keys);
        left.children.push(...right.children);
      }
      parent.keys.splice(sepIdx, 1);
      parent.children.splice(sepIdx + 1, 1);
      this.modified(left, parent);
      if (sink) sink.push({ type: "merge", left: left.id, right: right.id });
      this.freeNode(right);
    }

    /** rids whose keys fall in [lo, hi]; null bounds are open. Key order. */
    range(lo, hi, { loInclusive = true, hiInclusive = true } = {}, sink) {
      const out = [];
      const open = lo === null || lo === undefined;
      let { leaf } = this.descend(open ? undefined : lo, sink);
      let pos = open ? 0 : this.lowerBound(leaf.keys, lo);
      for (;;) {
        for (; pos < leaf.keys.length; pos++) {
          const k = leaf.keys[pos];
          if (!open) {
            const c = compareValues(k, lo);
            if (c < 0 || (c === 0 && !loInclusive)) continue;
          }
          if (hi !== null && hi !== undefined) {
            const c = compareValues(k, hi);
            if (c > 0 || (c === 0 && !hiInclusive)) return out;
          }
          out.push(...leaf.rids[pos]);
        }
        if (!leaf.next) return out;
        if (sink) sink.push({ type: "leaf-next", node: leaf.next });
        leaf = this.visit(leaf.next, sink);
        pos = 0;
      }
    }

    leftmostLeaf() {
      let node = this.nodes.get(this.root);
      while (!node.leaf) node = this.nodes.get(node.children[0]);
      return node;
    }

    /** All (key, rids) pairs in key order, read without charging the pool. */
    entries() {
      const out = [];
      let leaf = this.leftmostLeaf();
      while (leaf) {
        leaf.keys.forEach((k, i) => out.push([k, leaf.rids[i].slice()]));
        leaf = leaf.next ? this.nodes.get(leaf.next) : null;
      }
      return out;
    }

    height() {
      let h = 1;
      let node = this.nodes.get(this.root);
      while (!node.leaf) {
        node = this.nodes.get(node.children[0]);
        h++;
      }
      return h;
    }

    /** Invariant violations as human-readable strings (empty = valid tree). */
    check() {
      const errors = [];
      const leaves = [];
      let reachable = 0;
      const walk = (id, depth, lo, hi, isRoot) => {
        const node = this.nodes.get(id);
        if (!node) {
          errors.push(`missing node ${id}`);
          return;
        }
        reachable++;
        const n = node.keys.length;
        if (n > this.maxKeys) errors.push(`${id} has ${n} keys (max ${this.maxKeys})`);
        if (!isRoot && n < this.minKeys) errors.push(`${id} has ${n} keys (min ${this.minKeys})`);
        for (let i = 1; i < n; i++) {
          if (compareValues(node.keys[i - 1], node.keys[i]) >= 0) errors.push(`${id} keys out of order`);
        }
        for (const k of node.keys) {
          if (lo !== undefined && compareValues(k, lo) < 0) errors.push(`${id} key ${formatValue(k)} is below separator ${formatValue(lo)}`);
          if (hi !== undefined && compareValues(k, hi) >= 0) errors.push(`${id} key ${formatValue(k)} is not below separator ${formatValue(hi)}`);
        }
        if (node.leaf) {
          leaves.push({ id, depth });
          if (node.rids.length !== n) errors.push(`${id} rid lists misaligned with keys`);
          node.rids.forEach((list, i) => {
            if (!Array.isArray(list) || !list.length) errors.push(`${id} key ${formatValue(node.keys[i])} has no rids`);
            else if (this.unique && list.length > 1) errors.push(`${id} unique key ${formatValue(node.keys[i])} has ${list.length} rids`);
          });
          return;
        }
        if (isRoot && n === 0) errors.push(`internal root ${id} has no keys`);
        if (node.children.length !== n + 1) errors.push(`${id} has ${node.children.length} children for ${n} keys`);
        node.children.forEach((child, i) =>
          walk(child, depth + 1, i === 0 ? lo : node.keys[i - 1], i === n ? hi : node.keys[i], false)
        );
      };
      walk(this.root, 0, undefined, undefined, true);
      if (new Set(leaves.map((l) => l.depth)).size > 1) errors.push("leaves sit at different depths");
      const chain = [];
      let id = leaves.length ? leaves[0].id : null;
      while (id && chain.length <= this.nodes.size) {
        chain.push(id);
        id = this.nodes.has(id) ? this.nodes.get(id).next : null;
      }
      if (chain.join() !== leaves.map((l) => l.id).join()) errors.push("leaf chain does not follow left-to-right leaf order");
      if (reachable !== this.nodes.size) errors.push(`${this.nodes.size - reachable} unreachable node(s)`);
      return errors;
    }

    snapshot() {
      const nodes = {};
      for (const node of this.nodes.values()) {
        const out = { id: node.id, leaf: node.leaf, keys: node.keys.slice() };
        if (node.leaf) {
          out.next = node.next;
          out.rids = node.rids.map((r) => r.slice());
        } else {
          out.children = node.children.slice();
        }
        nodes[node.id] = out;
      }
      return { root: this.root, height: this.height(), order: this.order, size: this.size, nodes };
    }
  }

  // ---------- Buffer pool ----------

  function emptyFrame() {
    return { pageId: null, page: null, dirty: false, pinCount: 0, refBit: 0, lastUsed: 0 };
  }

  /**
   * A fixed set of frames caching pages between the executor and disk.
   *   LRU   — evict the unpinned frame used longest ago.
   *   Clock — one reference bit per frame and a sweeping hand: a set bit
   *           buys the page a second chance (bit cleared, hand moves on).
   * The executor is synchronous, so a page stays pinned only while rows
   * are copied out of it; pins exist to show the protocol and to stop a
   * page in use from being evicted.
   *
   * load(pageId, sink) reads a page from disk; store(pageId, page, sink)
   * writes one back (the database enforces the WAL rule inside store).
   */
  class BufferPool {
    constructor({ frames = 6, policy = "lru", load, store }) {
      this.size = clamp(Math.floor(frames) || 6, 1, 64);
      this.policy = policy === "clock" ? "clock" : "lru";
      this.load = load;
      this.store = store;
      this.frames = Array.from({ length: this.size }, emptyFrame);
      this.table = new Map();
      this.hand = 0;
      this.clock = 0;
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.diskReads = 0;
      this.diskWrites = 0;
    }

    /** Pins and returns the page; `create` builds a brand-new page instead of reading disk. */
    fetch(pageId, sink, create = null) {
      const at = this.table.get(pageId);
      if (at !== undefined) {
        const f = this.frames[at];
        f.pinCount++;
        f.refBit = 1;
        f.lastUsed = ++this.clock;
        this.hits++;
        if (sink) sink.push({ type: "hit", pageId, frame: at });
        return f.page;
      }
      const idx = this.findVictim(pageId, sink);
      const page = create ? create() : this.load(pageId, sink);
      if (!create) this.diskReads++;
      this.misses++;
      Object.assign(this.frames[idx], { pageId, page, dirty: !!create, pinCount: 1, refBit: 1, lastUsed: ++this.clock });
      this.table.set(pageId, idx);
      if (sink) sink.push({ type: "miss", pageId, frame: idx, created: !!create });
      return page;
    }

    unpin(pageId, dirty, sink) {
      const at = this.table.get(pageId);
      if (at === undefined) return;
      const f = this.frames[at];
      if (f.pinCount > 0) f.pinCount--;
      if (dirty && !f.dirty) {
        f.dirty = true;
        if (sink) sink.push({ type: "dirty", pageId, frame: at });
      }
    }

    findVictim(forPage, sink) {
      const empty = this.frames.findIndex((f) => f.pageId === null);
      if (empty >= 0) return empty;
      let idx = -1;
      if (this.policy === "lru") {
        let oldest = Infinity;
        this.frames.forEach((f, i) => {
          if (f.pinCount === 0 && f.lastUsed < oldest) {
            oldest = f.lastUsed;
            idx = i;
          }
        });
      } else {
        // Two full sweeps always find a victim unless every frame is pinned.
        for (let step = 0; step < this.size * 2 + 1 && idx < 0; step++) {
          const at = this.hand;
          const f = this.frames[at];
          this.hand = (this.hand + 1) % this.size;
          if (f.pinCount > 0) continue;
          if (f.refBit) {
            f.refBit = 0;
            if (sink) sink.push({ type: "clock-sweep", pageId: f.pageId, frame: at });
            continue;
          }
          idx = at;
        }
      }
      if (idx < 0) throw new DbError("buffer pool exhausted: every frame is pinned");
      this.evict(idx, forPage, sink);
      return idx;
    }

    evict(idx, forPage, sink) {
      const f = this.frames[idx];
      if (sink) sink.push({ type: "evict", pageId: f.pageId, frame: idx, dirty: f.dirty, for: forPage, policy: this.policy });
      if (f.dirty) this.writeBack(idx, sink);
      this.table.delete(f.pageId);
      this.evictions++;
      Object.assign(f, emptyFrame());
    }

    writeBack(idx, sink) {
      const f = this.frames[idx];
      this.store(f.pageId, f.page, sink);
      this.diskWrites++;
      f.dirty = false;
      if (sink) sink.push({ type: "write", pageId: f.pageId, frame: idx });
    }

    peek(pageId) {
      const at = this.table.get(pageId);
      return at === undefined ? null : this.frames[at].page;
    }

    isDirty(pageId) {
      const at = this.table.get(pageId);
      return at !== undefined && this.frames[at].dirty;
    }

    flushAll(sink) {
      this.frames.forEach((f, i) => {
        if (f.pageId !== null && f.dirty) this.writeBack(i, sink);
      });
    }

    /** Power loss: every frame vanishes, dirty or not. Returns the lost dirty page ids. */
    dropAll() {
      const lost = this.frames.filter((f) => f.pageId !== null && f.dirty).map((f) => f.pageId);
      this.frames = Array.from({ length: this.size }, emptyFrame);
      this.table.clear();
      this.hand = 0;
      return lost;
    }

    /** Forgets a page without writing it (dropped table, merged-away index node). */
    discard(pageId) {
      const at = this.table.get(pageId);
      if (at === undefined) return;
      Object.assign(this.frames[at], emptyFrame());
      this.table.delete(pageId);
    }

    resize(frames, policy, sink) {
      this.flushAll(sink);
      this.size = clamp(Math.floor(frames) || this.size, 1, 64);
      this.policy = policy === "clock" ? "clock" : "lru";
      this.frames = Array.from({ length: this.size }, emptyFrame);
      this.table.clear();
      this.hand = 0;
    }

    snapshot() {
      return {
        policy: this.policy,
        frames: this.frames.map((f, index) => ({
          index,
          pageId: f.pageId,
          dirty: f.dirty,
          pinCount: f.pinCount,
          refBit: f.refBit,
          lastUsed: f.lastUsed,
        })),
        hand: this.hand,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        diskReads: this.diskReads,
        diskWrites: this.diskWrites,
      };
    }
  }

  // ---------- Expressions ----------
  /*
    Expressions compile once per statement into closures over a scope.
    A scope lists the columns of the rows flowing through an operator:
      { columns: [{ table: alias, name, type }] }
    After GROUP BY the scope is "grouped": rows hold group keys then
    aggregate results, and `slots` maps a normalised expression to its
    position in that row.
    SQL three-valued logic: NULL means "unknown"; comparisons involving
    NULL yield NULL, and WHERE keeps a row only when the predicate is TRUE.
  */

  function truthy(v) {
    return v !== null && v !== undefined && v !== 0 && v !== "";
  }

  function and3(a, b) {
    if (a !== null && !truthy(a)) return 0;
    if (b !== null && !truthy(b)) return 0;
    if (a === null || b === null) return null;
    return 1;
  }

  function or3(a, b) {
    if (a !== null && truthy(a)) return 1;
    if (b !== null && truthy(b)) return 1;
    if (a === null || b === null) return null;
    return 0;
  }

  function not3(v) {
    return v === null ? null : truthy(v) ? 0 : 1;
  }

  /** Comparison for predicates: NULL if either side is NULL. */
  function cmp3(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return null;
    return compareValues(a, b);
  }

  function sameValue(a, b) {
    return typeof a === typeof b && a === b;
  }

  function resolveColumn(scope, ref) {
    const matches = [];
    scope.columns.forEach((c, i) => {
      if (c.name === ref.name && (!ref.table || c.table === ref.table)) matches.push(i);
    });
    if (!matches.length) {
      if (ref.table && !scope.columns.some((c) => c.table === ref.table)) {
        throw new DbError(`no such table or alias: ${ref.table}`, ref.pos);
      }
      throw new DbError(`no such column: ${ref.table ? ref.table + "." : ""}${ref.name}`, ref.pos);
    }
    if (matches.length > 1) throw new DbError(`ambiguous column name: ${ref.name}`, ref.pos);
    return matches[0];
  }

  function walkExpr(expr, visit) {
    if (!expr || typeof expr !== "object") return;
    visit(expr);
    for (const key of ["expr", "left", "right", "low", "high", "pattern", "arg"]) {
      if (expr[key]) walkExpr(expr[key], visit);
    }
    for (const key of ["list", "args"]) {
      if (Array.isArray(expr[key])) expr[key].forEach((e) => walkExpr(e, visit));
    }
  }

  function containsAgg(expr) {
    let found = false;
    walkExpr(expr, (e) => {
      if (e.type === "agg") found = true;
    });
    return found;
  }

  function isConstant(expr) {
    let constant = true;
    walkExpr(expr, (e) => {
      if (e.type === "column" || e.type === "agg") constant = false;
    });
    return constant;
  }

  /**
   * A key that is equal for two expressions meaning the same thing, so
   * "SELECT u.country … GROUP BY country" matches. Columns are replaced by
   * their resolved position in the base scope; source positions are dropped.
   */
  function exprKey(expr, baseScope) {
    return JSON.stringify(expr, function (k, v) {
      if (k === "pos" || k === "text") return undefined;
      if (v && typeof v === "object" && v.type === "column" && baseScope) return { colref: resolveColumn(baseScope, v) };
      return v;
    });
  }

  /** Splits a predicate on top-level AND. */
  function conjuncts(expr) {
    if (!expr) return [];
    if (expr.type === "binary" && expr.op === "AND") return conjuncts(expr.left).concat(conjuncts(expr.right));
    return [expr];
  }

  function likeToRegex(pattern) {
    let src = "";
    for (const ch of String(pattern)) {
      if (ch === "%") src += "[\\s\\S]*";
      else if (ch === "_") src += "[\\s\\S]";
      else src += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    // LIKE is case-insensitive for ASCII letters, as in SQLite.
    return new RegExp("^" + src + "$", "i");
  }

  const COMPARISONS = new Set(["=", "<>", "<", "<=", ">", ">="]);

  function compareResult(op, c) {
    switch (op) {
      case "=":
        return c === 0;
      case "<>":
        return c !== 0;
      case "<":
        return c < 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      default:
        return c >= 0;
    }
  }

  function numericOperands(op, a, b) {
    if (typeof a !== "number" || typeof b !== "number") {
      throw new DbError(`cannot apply ${op} to ${typeof a === "number" ? "TEXT" : formatValue(a)}${typeof b === "number" ? "" : " and " + formatValue(b)}`);
    }
  }

  function compileExpr(expr, scope) {
    if (scope.slots) {
      const slot = scope.slots.get(exprKey(expr, scope.base));
      if (slot) return { fn: (row) => row[slot.index], type: slot.type };
    }
    switch (expr.type) {
      case "literal": {
        const v = expr.value;
        return { fn: () => v, type: expr.valueType };
      }
      case "column": {
        if (scope.grouped) {
          throw new DbError(`column "${expr.name}" must appear in GROUP BY or be used in an aggregate function`, expr.pos);
        }
        const idx = resolveColumn(scope, expr);
        return { fn: (row) => row[idx], type: scope.columns[idx].type };
      }
      case "agg":
        throw new DbError(`aggregate ${expr.name.toUpperCase()}() is not allowed here`, expr.pos);
      case "unary": {
        const inner = compileExpr(expr.expr, scope);
        if (expr.op === "NOT") return { fn: (row) => not3(inner.fn(row)), type: "INT" };
        return {
          fn: (row) => {
            const v = inner.fn(row);
            if (v === null) return null;
            if (typeof v !== "number") throw new DbError(`cannot negate ${formatValue(v)}`);
            return -v;
          },
          type: inner.type,
        };
      }
      case "binary":
        return compileBinary(expr, scope);
      case "isnull": {
        const inner = compileExpr(expr.expr, scope);
        return { fn: (row) => ((inner.fn(row) === null) !== expr.not ? 1 : 0), type: "INT" };
      }
      case "between": {
        const v = compileExpr(expr.expr, scope);
        const lo = compileExpr(expr.low, scope);
        const hi = compileExpr(expr.high, scope);
        return {
          fn: (row) => {
            const x = v.fn(row);
            const a = cmp3(x, lo.fn(row));
            const b = cmp3(x, hi.fn(row));
            const r = and3(a === null ? null : a >= 0 ? 1 : 0, b === null ? null : b <= 0 ? 1 : 0);
            return expr.not ? not3(r) : r;
          },
          type: "INT",
        };
      }
      case "in": {
        const v = compileExpr(expr.expr, scope);
        const list = expr.list.map((e) => compileExpr(e, scope));
        return {
          fn: (row) => {
            const x = v.fn(row);
            if (x === null) return null;
            let sawNull = false;
            for (const item of list) {
              const y = item.fn(row);
              if (y === null) sawNull = true;
              else if (sameValue(x, y)) return expr.not ? 0 : 1;
            }
            if (sawNull) return null;
            return expr.not ? 1 : 0;
          },
          type: "INT",
        };
      }
      case "like": {
        const v = compileExpr(expr.expr, scope);
        const p = compileExpr(expr.pattern, scope);
        const cached = expr.pattern.type === "literal" && expr.pattern.value !== null ? likeToRegex(expr.pattern.value) : null;
        return {
          fn: (row) => {
            const x = v.fn(row);
            const pat = p.fn(row);
            if (x === null || pat === null) return null;
            const r = (cached || likeToRegex(pat)).test(String(x)) ? 1 : 0;
            return expr.not ? not3(r) : r;
          },
          type: "INT",
        };
      }
      case "call":
        return compileCall(expr, scope);
      default:
        throw new DbError(`unsupported expression ${expr.type}`);
    }
  }

  function compileBinary(expr, scope) {
    const l = compileExpr(expr.left, scope);
    const r = compileExpr(expr.right, scope);
    const op = expr.op;
    if (op === "AND") return { fn: (row) => and3(l.fn(row), r.fn(row)), type: "INT" };
    if (op === "OR") return { fn: (row) => or3(l.fn(row), r.fn(row)), type: "INT" };
    if (COMPARISONS.has(op)) {
      return {
        fn: (row) => {
          const a = l.fn(row);
          const b = r.fn(row);
          if (a === null || b === null) return null;
          // Values of different types are never equal; NULL < numbers < text.
          if (op === "=" || op === "<>") return (sameValue(a, b) === (op === "=")) ? 1 : 0;
          return compareResult(op, compareValues(a, b)) ? 1 : 0;
        },
        type: "INT",
      };
    }
    if (op === "||") {
      return {
        fn: (row) => {
          const a = l.fn(row);
          const b = r.fn(row);
          return a === null || b === null ? null : String(a) + String(b);
        },
        type: "TEXT",
      };
    }
    // Arithmetic. Static types decide integer division: INT / INT truncates
    // toward zero, anything involving REAL keeps the fraction.
    const intMath = l.type === "INT" && r.type === "INT";
    return {
      fn: (row) => {
        const a = l.fn(row);
        const b = r.fn(row);
        if (a === null || b === null) return null;
        numericOperands(op, a, b);
        switch (op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            if (b === 0) return null; // division by zero yields NULL (as in SQLite)
            return intMath ? Math.trunc(a / b) : a / b;
          default:
            if (b === 0) return null;
            return a % b;
        }
      },
      type: intMath ? "INT" : "REAL",
    };
  }

  function compileCall(expr, scope) {
    const args = expr.args.map((a) => compileExpr(a, scope));
    const arity = { lower: 1, upper: 1, length: 1, abs: 1 };
    if (arity[expr.name] !== undefined && args.length !== arity[expr.name]) {
      throw new DbError(`${expr.name.toUpperCase()}() takes ${arity[expr.name]} argument`, expr.pos);
    }
    if (expr.name === "round" && (args.length < 1 || args.length > 2)) throw new DbError("ROUND() takes 1 or 2 arguments", expr.pos);
    if (expr.name === "coalesce" && !args.length) throw new DbError("COALESCE() needs at least one argument", expr.pos);
    switch (expr.name) {
      case "lower":
      case "upper":
        return {
          fn: (row) => {
            const v = args[0].fn(row);
            if (v === null) return null;
            return expr.name === "lower" ? String(v).toLowerCase() : String(v).toUpperCase();
          },
          type: "TEXT",
        };
      case "length":
        return {
          fn: (row) => {
            const v = args[0].fn(row);
            return v === null ? null : String(v).length;
          },
          type: "INT",
        };
      case "abs":
        return {
          fn: (row) => {
            const v = args[0].fn(row);
            if (v === null) return null;
            numericOperands("ABS()", v, 0);
            return Math.abs(v);
          },
          type: args[0].type,
        };
      case "round":
        return {
          fn: (row) => {
            const v = args[0].fn(row);
            const digits = args[1] ? args[1].fn(row) : 0;
            if (v === null || digits === null) return null;
            numericOperands("ROUND()", v, digits);
            const f = Math.pow(10, digits);
            return Math.round(v * f) / f;
          },
          type: "REAL",
        };
      default:
        return {
          fn: (row) => {
            for (const a of args) {
              const v = a.fn(row);
              if (v !== null) return v;
            }
            return null;
          },
          type: args[0].type,
        };
    }
  }

  /** Turns an expression back into SQL text for plan details. */
  function exprToSql(expr) {
    const wrap = (child, parentOp) => {
      const text = exprToSql(child);
      if (child.type === "binary" && child.op !== parentOp) return `(${text})`;
      return text;
    };
    switch (expr.type) {
      case "literal":
        return formatValue(expr.value);
      case "column":
        return expr.table ? `${expr.table}.${expr.name}` : expr.name;
      case "unary":
        return expr.op === "NOT" ? `NOT ${wrap(expr.expr)}` : `-${wrap(expr.expr)}`;
      case "binary":
        return `${wrap(expr.left, expr.op)} ${expr.op} ${wrap(expr.right, expr.op)}`;
      case "isnull":
        return `${wrap(expr.expr)} IS ${expr.not ? "NOT " : ""}NULL`;
      case "between":
        return `${wrap(expr.expr)} ${expr.not ? "NOT " : ""}BETWEEN ${wrap(expr.low)} AND ${wrap(expr.high)}`;
      case "in":
        return `${wrap(expr.expr)} ${expr.not ? "NOT " : ""}IN (${expr.list.map(exprToSql).join(", ")})`;
      case "like":
        return `${wrap(expr.expr)} ${expr.not ? "NOT " : ""}LIKE ${exprToSql(expr.pattern)}`;
      case "agg":
        return `${expr.name.toUpperCase()}(${expr.distinct ? "DISTINCT " : ""}${expr.arg ? exprToSql(expr.arg) : "*"})`;
      case "call":
        return `${expr.name.toUpperCase()}(${expr.args.map(exprToSql).join(", ")})`;
      default:
        return "?";
    }
  }

  // ---------- Database: storage, log, transactions ----------
  /*
    Heap pages: { id: "users#0", table, pageLSN, slots: [{ values } | null] }
    A null slot is a tombstone; slots are never reused, so undo can always
    put a row back exactly where it was. rid = "<pageId>:<slot>".

    Index node pages are named "<index>@<nodeId>". Their contents are the
    in-memory tree; they pass through the buffer pool so index I/O shows up
    in the hit/miss counters like heap I/O does.

    Log records: { lsn, txn, type, table?, uid?, rid?, before?, after?, undoOf?, active? }
      before/after are the slot's row values (null = empty slot).
    The engine is STEAL / NO-FORCE:
      steal    — a dirty page may be written before its transaction commits
                 (an eviction), so recovery must be able to UNDO;
      no-force — commit only forces the LOG, not the data pages, so
                 recovery must be able to REDO.
  */

  const DEFAULT_OPTIONS = { bufferFrames: 6, policy: "lru", rowsPerPage: 4, btreeOrder: 4 };
  const ROW_EVENT_CAP = 500;
  const DATA_RECORDS = new Set(["insert", "update", "delete"]);

  function normalizeOptions(opts = {}) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    return {
      bufferFrames: clamp(Math.floor(Number(o.bufferFrames) || DEFAULT_OPTIONS.bufferFrames), 3, 32),
      policy: o.policy === "clock" ? "clock" : "lru",
      rowsPerPage: clamp(Math.floor(Number(o.rowsPerPage) || DEFAULT_OPTIONS.rowsPerPage), 2, 16),
      btreeOrder: clamp(Math.floor(Number(o.btreeOrder) || DEFAULT_OPTIONS.btreeOrder), 3, 8),
    };
  }

  function splitRid(rid) {
    const at = rid.lastIndexOf(":");
    return [rid.slice(0, at), Number(rid.slice(at + 1))];
  }

  function applySlot(page, slot, values) {
    while (page.slots.length < slot) page.slots.push(null);
    page.slots[slot] = values ? { values: values.slice() } : null;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  }

  class Database {
    constructor(options = {}) {
      this.options = normalizeOptions(options);
      this.init();
    }

    init() {
      this.tables = new Map();
      this.indexOwner = new Map(); // index name → table name
      this.disk = new Map(); // pageId → durable page image
      this.log = [];
      this.nextLsn = 1;
      this.flushedLsn = 0;
      this.nextTxnId = 1;
      this.nextTableUid = 1;
      this.txn = null;
      this.crashed = false;
      this.indexesLive = true;
      this.sink = null;
      this.rowEvents = 0;
      this.planSeq = 0;
      this.pool = this.makePool(this.options.bufferFrames, this.options.policy);
    }

    makePool(frames, policy) {
      return new BufferPool({
        frames,
        policy,
        load: (pageId) => this.readFromDisk(pageId),
        store: (pageId, page, sink) => this.writeToDisk(pageId, page, sink),
      });
    }

    // ----- events -----

    emit(event) {
      if (this.sink) this.sink.push(event);
    }

    emitRow(event) {
      if (this.rowEvents < ROW_EVENT_CAP) this.emit(event);
      else if (this.rowEvents === ROW_EVENT_CAP) this.emit({ type: "truncated", detail: `row events capped at ${ROW_EVENT_CAP}` });
      this.rowEvents++;
    }

    btreeSink(idx) {
      return { push: (event) => this.emit({ type: "btree", index: idx.name, event }) };
    }

    /**
     * The tree's shape after one complete index operation, so a viewer can
     * show every intermediate state (skipped for big trees to keep traces small).
     */
    emitTreeState(idx) {
      if (this.sink && idx.tree && idx.tree.size <= 200) this.emit({ type: "btree-state", index: idx.name, tree: idx.tree.snapshot() });
    }

    // ----- disk -----

    isIndexPage(pageId) {
      return pageId.includes("@");
    }

    readFromDisk(pageId) {
      if (this.isIndexPage(pageId)) return { indexPage: pageId };
      const image = this.disk.get(pageId);
      if (image) return clone(image);
      // Allocated (the catalog knows it) but never written before a crash:
      // it starts empty and redo refills it from the log.
      return { id: pageId, table: pageId.split("#")[0], pageLSN: 0, slots: [] };
    }

    writeToDisk(pageId, page, sink) {
      if (this.isIndexPage(pageId)) return; // index contents live in the tree; indexes are not logged
      // The WAL rule: log records describing a change reach disk before the page
      // does. Like a real log manager this writes out the whole log buffer, which
      // also makes newer records durable while their pages are still in memory.
      if (page.pageLSN > this.flushedLsn) this.flushLog(this.nextLsn - 1, sink, `WAL rule before writing ${pageId}`);
      this.disk.set(pageId, clone(page));
    }

    withPage(pageId, fn, dirty = false) {
      const page = this.pool.fetch(pageId, this.sink);
      try {
        return fn(page);
      } finally {
        this.pool.unpin(pageId, dirty, this.sink);
      }
    }

    // ----- write-ahead log -----

    appendLog(record) {
      const rec = { lsn: this.nextLsn++, ...record };
      this.log.push(rec);
      this.emit({ type: "wal", record: clone(rec) });
      return rec;
    }

    flushLog(upTo = this.nextLsn - 1, sink = this.sink, reason = "commit") {
      const target = Math.min(upTo, this.nextLsn - 1);
      if (target <= this.flushedLsn) return;
      this.flushedLsn = target;
      if (sink) sink.push({ type: "log-flush", lsn: target, reason });
    }

    // ----- catalog -----

    requireTable(name, pos = null) {
      const table = this.tables.get(name);
      if (!table) throw new DbError(`no such table: ${name}`, pos);
      return table;
    }

    attachTree(idx) {
      idx.tree.touch = (nodeId, dirty, created) => {
        const pageId = `${idx.name}@${nodeId}`;
        if (dirty && !created && this.pool.peek(pageId)) {
          this.pool.unpin(pageId, true, this.sink); // already cached: just mark it dirty
          return;
        }
        this.pool.fetch(pageId, this.sink, created ? () => ({ indexPage: pageId }) : null);
        this.pool.unpin(pageId, dirty, this.sink);
      };
      idx.tree.onFree = (nodeId) => this.pool.discard(`${idx.name}@${nodeId}`);
    }

    discardTree(idx) {
      for (const nodeId of idx.tree.nodes.keys()) this.pool.discard(`${idx.name}@${nodeId}`);
    }

    /** Visits every live row of a table through the buffer pool. */
    scanHeap(table, visit) {
      for (const pageId of table.pageIds) {
        this.withPage(pageId, (page) => {
          page.slots.forEach((s, slot) => {
            if (s) visit(`${pageId}:${slot}`, s.values);
          });
        });
      }
    }

    readRow(rid) {
      const [pageId, slot] = splitRid(rid);
      return this.withPage(pageId, (page) => (page.slots[slot] ? page.slots[slot].values.slice() : null));
    }

    buildIndex(table, idx) {
      idx.tree = new BPlusTree({ order: this.options.btreeOrder, unique: idx.unique });
      this.attachTree(idx);
      const sink = this.btreeSink(idx);
      this.scanHeap(table, (rid, values) => {
        const key = values[idx.colIndex];
        if (key === null) return;
        try {
          idx.tree.insert(key, rid, sink);
          this.emitTreeState(idx);
        } catch (err) {
          if (err instanceof DbError) throw new DbError(`UNIQUE constraint failed: ${table.name}.${idx.column} (duplicate ${formatValue(key)})`);
          throw err;
        }
      });
    }

    addIndex(table, name, column, unique) {
      if (this.indexOwner.has(name)) throw new DbError(`index ${name} already exists`);
      const colIndex = table.columns.findIndex((c) => c.name === column);
      if (colIndex < 0) throw new DbError(`no such column: ${table.name}.${column}`);
      const idx = { name, column, colIndex, unique, tree: null };
      try {
        this.buildIndex(table, idx);
      } catch (err) {
        if (idx.tree) this.discardTree(idx);
        throw err;
      }
      table.indexes.push(idx);
      this.indexOwner.set(name, table.name);
      return idx;
    }

    // ----- rows -----

    coerce(table, col, value) {
      if (value === null || value === undefined) {
        if (col.notNull) throw new DbError(`NOT NULL constraint failed: ${table.name}.${col.name}`);
        return null;
      }
      const ok =
        (col.type === "INT" && typeof value === "number" && Number.isInteger(value)) ||
        (col.type === "REAL" && typeof value === "number" && Number.isFinite(value)) ||
        (col.type === "TEXT" && typeof value === "string");
      if (!ok) throw new DbError(`type mismatch: ${table.name}.${col.name} is ${col.type}, got ${formatValue(value)}`);
      return value;
    }

    checkUnique(table, values, ignoreRid, onlyCols = null) {
      for (const idx of table.indexes) {
        if (!idx.unique) continue;
        if (onlyCols && !onlyCols.has(idx.colIndex)) continue;
        const key = values[idx.colIndex];
        if (key === null) continue;
        const clash = idx.tree.search(key, this.btreeSink(idx)).filter((r) => r !== ignoreRid);
        if (clash.length) throw new DbError(`UNIQUE constraint failed: ${table.name}.${idx.column}`);
      }
    }

    indexInsert(table, rid, values) {
      if (!this.indexesLive) return;
      for (const idx of table.indexes) {
        const key = values[idx.colIndex];
        if (key === null) continue;
        idx.tree.insert(key, rid, this.btreeSink(idx));
        this.emitTreeState(idx);
      }
    }

    indexDelete(table, rid, values) {
      if (!this.indexesLive) return;
      for (const idx of table.indexes) {
        const key = values[idx.colIndex];
        if (key === null) continue;
        idx.tree.delete(key, rid, this.btreeSink(idx));
        this.emitTreeState(idx);
      }
    }

    indexUpdate(table, rid, before, after) {
      if (!this.indexesLive) return;
      for (const idx of table.indexes) {
        const a = before ? before[idx.colIndex] : null;
        const b = after ? after[idx.colIndex] : null;
        if (before && after && sameValue(a, b)) continue;
        const sink = this.btreeSink(idx);
        if (a !== null) idx.tree.delete(a, rid, sink);
        if (b !== null) idx.tree.insert(b, rid, sink);
        if (a !== null || b !== null) this.emitTreeState(idx);
      }
    }

    allocatePage(table) {
      const id = `${table.name}#${table.pageIds.length}`;
      // The catalog is write-through in this toy, so the page list is durable at once.
      table.pageIds.push(id);
      this.emit({ type: "alloc", pageId: id, table: table.name });
      return this.pool.fetch(id, this.sink, () => ({ id, table: table.name, pageLSN: 0, slots: [] }));
    }

    heapInsert(table, values) {
      const lastId = table.pageIds[table.pageIds.length - 1];
      let page = null;
      if (lastId) {
        page = this.pool.fetch(lastId, this.sink);
        if (page.slots.length >= this.options.rowsPerPage) {
          this.pool.unpin(lastId, false, this.sink);
          page = null;
        }
      }
      if (!page) page = this.allocatePage(table);
      const rid = `${page.id}:${page.slots.length}`;
      // Log first, then change the page and stamp it with the record's LSN.
      const rec = this.appendLog({ txn: this.txn.id, type: "insert", table: table.name, uid: table.uid, rid, before: null, after: values.slice() });
      page.slots.push({ values: values.slice() });
      page.pageLSN = rec.lsn;
      this.pool.unpin(page.id, true, this.sink);
      table.stats = null;
      return rid;
    }

    heapWrite(table, rid, after, type) {
      const [pageId, slot] = splitRid(rid);
      return this.withPage(
        pageId,
        (page) => {
          const before = page.slots[slot] ? page.slots[slot].values.slice() : null;
          const rec = this.appendLog({ txn: this.txn.id, type, table: table.name, uid: table.uid, rid, before, after: after && after.slice() });
          applySlot(page, slot, after);
          page.pageLSN = rec.lsn;
          table.stats = null;
          return before;
        },
        true
      );
    }

    // ----- transactions -----

    beginTxn(explicit) {
      this.txn = { id: this.nextTxnId++, explicit };
      this.appendLog({ txn: this.txn.id, type: "begin" });
      this.emit({ type: "txn", action: "begin", txn: this.txn.id, explicit });
      return this.txn;
    }

    commitTxn() {
      const id = this.txn.id;
      this.appendLog({ txn: id, type: "commit" });
      // No-force: only the log is forced at commit; data pages stay dirty in the pool.
      this.flushLog(this.nextLsn - 1, this.sink, `commit of txn ${id}`);
      this.emit({ type: "txn", action: "commit", txn: id });
      this.txn = null;
    }

    abortTxn() {
      const id = this.txn.id;
      const undone = this.undoTxn(id, 0);
      this.appendLog({ txn: id, type: "abort" });
      this.emit({ type: "txn", action: "rollback", txn: id, undone });
      this.txn = null;
      return undone;
    }

    /**
     * Undoes txnId's changes with lsn ≥ fromLsn, newest first. Each undo
     * writes a compensation log record (CLR) so a crash in the middle of a
     * rollback never undoes the same change twice.
     */
    undoTxn(txnId, fromLsn) {
      const compensated = new Set(this.log.filter((r) => r.txn === txnId && r.type === "clr").map((r) => r.undoOf));
      const todo = this.log
        .filter((r) => r.txn === txnId && r.lsn >= fromLsn && DATA_RECORDS.has(r.type) && !compensated.has(r.lsn))
        .reverse();
      todo.forEach((rec) => this.undoRecord(rec));
      return todo.length;
    }

    undoRecord(rec) {
      const table = this.tables.get(rec.table);
      if (!table || table.uid !== rec.uid) return;
      const [pageId, slot] = splitRid(rec.rid);
      const current = this.withPage(
        pageId,
        (page) => {
          const now = page.slots[slot] ? page.slots[slot].values.slice() : null;
          const clr = this.appendLog({
            txn: rec.txn,
            type: "clr",
            table: rec.table,
            uid: rec.uid,
            rid: rec.rid,
            undoOf: rec.lsn,
            before: now,
            after: rec.before && rec.before.slice(),
          });
          applySlot(page, slot, rec.before);
          page.pageLSN = clr.lsn;
          return now;
        },
        true
      );
      table.stats = null;
      this.indexUpdate(table, rec.rid, current, rec.before);
      this.emitRow({ type: "row", op: "undo", table: rec.table, rid: rec.rid, values: rec.before && rec.before.slice(), undoOf: rec.lsn });
    }

    /**
     * Runs a data change inside a transaction. Outside BEGIN … COMMIT the
     * statement gets its own transaction (autocommit). Either way a failure
     * undoes exactly this statement's changes: statement-level atomicity.
     */
    runWrite(fn) {
      const implicit = !this.txn;
      if (implicit) this.beginTxn(false);
      const start = this.nextLsn;
      try {
        const out = fn();
        if (implicit) this.commitTxn();
        return out;
      } catch (err) {
        if (implicit) this.abortTxn();
        else this.undoTxn(this.txn.id, start);
        throw err;
      }
    }

    // ----- statements -----

    failedResult(sql, kind, err) {
      return {
        sql,
        kind,
        columns: [],
        rows: [],
        rowsAffected: 0,
        message: err.message,
        plan: null,
        events: [],
        error: { message: err.message, position: err.position === undefined ? null : err.position },
      };
    }

    /** Runs ;-separated statements in order, stopping at the first error. */
    execute(sql) {
      const text = String(sql === null || sql === undefined ? "" : sql);
      if (this.crashed) {
        return [this.failedResult(text.trim(), null, new DbError("the database has crashed — run recovery before executing statements"))];
      }
      let parser;
      try {
        parser = new Parser(text);
      } catch (err) {
        if (!(err instanceof DbError)) throw err;
        return [this.failedResult(text.trim(), null, err)];
      }
      const results = [];
      for (;;) {
        const startIndex = parser.i;
        let stmt;
        try {
          stmt = parser.nextStatement();
        } catch (err) {
          if (!(err instanceof DbError)) throw err;
          results.push(this.failedResult(parser.statementSpan(startIndex).sql, null, err));
          break;
        }
        if (!stmt) break;
        const result = this.runStatement(stmt);
        results.push(result);
        if (result.error) break;
      }
      return results;
    }

    runStatement(stmt) {
      const events = [];
      this.sink = events;
      this.rowEvents = 0;
      this.planSeq = 0;
      const result = {
        sql: stmt.sql,
        kind: stmt.ast.type,
        columns: [],
        rows: [],
        rowsAffected: 0,
        message: "",
        plan: null,
        events,
        error: null,
      };
      try {
        Object.assign(result, this.dispatch(stmt.ast));
      } catch (err) {
        if (!(err instanceof DbError)) {
          this.sink = null;
          throw err;
        }
        result.error = { message: err.message, position: err.position === undefined ? null : err.position };
        result.message = err.message;
        result.columns = [];
        result.rows = [];
      } finally {
        this.sink = null;
      }
      return result;
    }

    dispatch(ast) {
      switch (ast.type) {
        case "create_table":
          return this.createTable(ast);
        case "create_index":
          return this.createIndex(ast);
        case "drop_table":
          return this.dropTable(ast);
        case "insert":
          return this.insert(ast);
        case "update":
          return this.update(ast);
        case "delete":
          return this.deleteRows(ast);
        case "select":
          return this.select(ast);
        case "explain":
          return this.explain(ast);
        case "begin":
          if (this.txn) throw new DbError("a transaction is already active");
          this.beginTxn(true);
          return { message: `transaction ${this.txn.id} started` };
        case "commit": {
          if (!this.txn) throw new DbError("no transaction is active");
          const id = this.txn.id;
          this.commitTxn();
          return { message: `transaction ${id} committed — log flushed to LSN ${this.flushedLsn}` };
        }
        case "rollback": {
          if (!this.txn) throw new DbError("no transaction is active");
          const id = this.txn.id;
          const undone = this.abortTxn();
          return { message: `transaction ${id} rolled back — ${plural(undone, "change")} undone` };
        }
        default:
          throw new DbError(`unsupported statement ${ast.type}`);
      }
    }

    guardDdl() {
      if (this.txn) throw new DbError("DDL inside a transaction is not supported — COMMIT or ROLLBACK first");
    }

    createTable(ast) {
      this.guardDdl();
      if (this.tables.has(ast.table)) {
        if (ast.ifNotExists) return { message: `table ${ast.table} already exists — skipped` };
        throw new DbError(`table ${ast.table} already exists`);
      }
      const seen = new Set();
      for (const c of ast.columns) {
        if (seen.has(c.name)) throw new DbError(`duplicate column name: ${c.name}`);
        seen.add(c.name);
      }
      if (ast.columns.filter((c) => c.primaryKey).length > 1) throw new DbError("a table can have only one PRIMARY KEY column");
      const table = {
        name: ast.table,
        uid: this.nextTableUid++,
        columns: ast.columns.map((c) => ({ ...c })),
        pageIds: [],
        indexes: [],
        stats: null,
      };
      this.tables.set(table.name, table);
      try {
        for (const c of table.columns) {
          if (c.primaryKey) this.addIndex(table, `pk_${table.name}`, c.name, true);
          else if (c.unique) this.addIndex(table, `uq_${table.name}_${c.name}`, c.name, true);
        }
      } catch (err) {
        this.tables.delete(table.name);
        table.indexes.forEach((idx) => {
          this.indexOwner.delete(idx.name);
          this.discardTree(idx);
        });
        throw err;
      }
      this.emit({ type: "ddl", action: "create-table", table: table.name });
      const note = table.indexes.length ? ` + ${table.indexes.map((i) => i.name).join(", ")}` : "";
      return { message: `created table ${table.name} (${plural(table.columns.length, "column")})${note}` };
    }

    createIndex(ast) {
      this.guardDdl();
      const table = this.requireTable(ast.table);
      const idx = this.addIndex(table, ast.name, ast.column, ast.unique);
      this.emit({ type: "ddl", action: "create-index", index: idx.name, table: table.name });
      return {
        message: `created ${ast.unique ? "unique " : ""}index ${idx.name} on ${table.name}(${idx.column}) — ${plural(idx.tree.size, "key")}, height ${idx.tree.height()}`,
      };
    }

    dropTable(ast) {
      this.guardDdl();
      const table = this.tables.get(ast.table);
      if (!table) {
        if (ast.ifExists) return { message: `table ${ast.table} does not exist — skipped` };
        throw new DbError(`no such table: ${ast.table}`);
      }
      for (const pageId of table.pageIds) {
        this.pool.discard(pageId);
        this.disk.delete(pageId);
      }
      for (const idx of table.indexes) {
        this.discardTree(idx);
        this.indexOwner.delete(idx.name);
      }
      this.tables.delete(table.name);
      this.emit({ type: "ddl", action: "drop-table", table: table.name });
      return { message: `dropped table ${table.name}` };
    }

    insert(ast) {
      const table = this.requireTable(ast.table);
      let target;
      if (ast.columns) {
        target = ast.columns.map((name) => {
          const i = table.columns.findIndex((c) => c.name === name);
          if (i < 0) throw new DbError(`no such column: ${table.name}.${name}`);
          return i;
        });
        if (new Set(target).size !== target.length) throw new DbError("a column is listed twice in INSERT");
      } else {
        target = table.columns.map((_, i) => i);
      }
      const noColumns = { columns: [] };
      const rows = ast.rows.map((row) => {
        if (row.length !== target.length) {
          throw new DbError(`${plural(row.length, "value")} supplied for ${plural(target.length, "column")} of ${table.name}`);
        }
        return row.map((e) => compileExpr(e, noColumns));
      });
      return this.runWrite(() => {
        rows.forEach((compiled) => {
          const values = new Array(table.columns.length).fill(null);
          compiled.forEach((c, i) => {
            values[target[i]] = c.fn([]);
          });
          const row = table.columns.map((col, i) => this.coerce(table, col, values[i]));
          this.checkUnique(table, row, null);
          const rid = this.heapInsert(table, row);
          this.indexInsert(table, rid, row);
          this.emitRow({ type: "row", op: "insert", table: table.name, rid, values: row.slice() });
        });
        return { rowsAffected: rows.length, message: `${plural(rows.length, "row")} inserted into ${table.name}` };
      });
    }

    update(ast) {
      const table = this.requireTable(ast.table);
      const scope = this.tableScope(table, table.name);
      const sets = ast.assignments.map((a) => {
        const colIndex = table.columns.findIndex((c) => c.name === a.column);
        if (colIndex < 0) throw new DbError(`no such column: ${table.name}.${a.column}`, a.pos);
        return { colIndex, value: compileExpr(a.expr, scope) };
      });
      const changed = new Set(sets.map((s) => s.colIndex));
      const access = this.planTableAccess(table, table.name, scope, conjuncts(ast.where));
      const detail = `${table.name} SET ${ast.assignments.map((a) => `${a.column} = ${exprToSql(a.expr)}`).join(", ")}`;
      const node = this.makeNode("Update", detail, [access], { estRows: access.estRows, estCost: access.estCost + access.estRows }, null);
      return this.runWrite(() => {
        this.emit({ type: "operator", node: node.id, op: node.op, action: "open" });
        // Collect every target row before changing any. Otherwise an index
        // scan could meet rows it has just moved (the "Halloween problem").
        const targets = this.exec(access);
        for (const row of targets) {
          const after = row.slice();
          sets.forEach((s) => {
            after[s.colIndex] = this.coerce(table, table.columns[s.colIndex], s.value.fn(row));
          });
          this.checkUnique(table, after, row.rid, changed);
          const before = this.heapWrite(table, row.rid, after, "update");
          this.indexUpdate(table, row.rid, before, after);
          this.emitRow({ type: "row", op: "update", table: table.name, rid: row.rid, values: after.slice(), before });
        }
        node.loops = 1;
        node.actualRows = targets.length;
        this.emit({ type: "operator", node: node.id, op: node.op, action: "close", rows: targets.length });
        return { rowsAffected: targets.length, plan: node, message: `${plural(targets.length, "row")} updated in ${table.name}` };
      });
    }

    deleteRows(ast) {
      const table = this.requireTable(ast.table);
      const scope = this.tableScope(table, table.name);
      const access = this.planTableAccess(table, table.name, scope, conjuncts(ast.where));
      const node = this.makeNode("Delete", table.name, [access], { estRows: access.estRows, estCost: access.estCost + access.estRows }, null);
      return this.runWrite(() => {
        this.emit({ type: "operator", node: node.id, op: node.op, action: "open" });
        const targets = this.exec(access);
        for (const row of targets) {
          const before = this.heapWrite(table, row.rid, null, "delete");
          this.indexDelete(table, row.rid, before);
          this.emitRow({ type: "row", op: "delete", table: table.name, rid: row.rid, values: before });
        }
        node.loops = 1;
        node.actualRows = targets.length;
        this.emit({ type: "operator", node: node.id, op: node.op, action: "close", rows: targets.length });
        return { rowsAffected: targets.length, plan: node, message: `${plural(targets.length, "row")} deleted from ${table.name}` };
      });
    }

    select(ast) {
      const { node, columns } = this.planSelect(ast);
      const rows = this.exec(node);
      return { columns, rows, plan: node, message: plural(rows.length, "row") };
    }

    explain(ast) {
      const { node } = this.planSelect(ast.select);
      if (ast.analyze) this.exec(node);
      const lines = formatPlan(node, { analyze: ast.analyze }).split("\n");
      return {
        columns: ["plan"],
        rows: lines.map((l) => [l]),
        plan: node,
        message: ast.analyze ? `plan executed — ${plural(node.actualRows || 0, "row")}` : "plan only — not executed",
      };
    }

    // ----- planner -----

    makeNode(op, detail, children, est, run, reason = null) {
      const node = {
        id: "p" + ++this.planSeq,
        op,
        detail,
        children,
        estRows: round1(Math.max(0, est.estRows)),
        estCost: round1(Math.max(0, est.estCost)),
        actualRows: null,
        loops: 0,
        reason,
      };
      // The executor closure stays off the JSON-visible plan.
      Object.defineProperty(node, "run", { value: run, enumerable: false });
      return node;
    }

    /** Runs a plan node. Rows are materialised per operator (fine at toy scale). */
    exec(node) {
      this.emit({ type: "operator", node: node.id, op: node.op, action: "open" });
      const rows = node.run();
      node.loops++;
      node.actualRows = (node.actualRows || 0) + rows.length;
      this.emit({ type: "operator", node: node.id, op: node.op, action: "close", rows: rows.length });
      return rows;
    }

    tableScope(table, alias) {
      return {
        columns: table.columns.map((c, i) => ({ table: alias, name: c.name, type: c.type, source: table.name, colIndex: i })),
      };
    }

    /**
     * Row count and distinct values per column. Read straight from cached or
     * on-disk page images without touching the pool — real systems keep
     * these numbers in the catalog (ANALYZE) for the same reason.
     */
    tableStats(table) {
      if (table.stats) return table.stats;
      let rows = 0;
      const distinct = table.columns.map(() => new Set());
      const minmax = table.columns.map(() => ({ min: null, max: null }));
      for (const pageId of table.pageIds) {
        const page = this.pool.peek(pageId) || this.disk.get(pageId);
        if (!page) continue;
        for (const s of page.slots) {
          if (!s) continue;
          rows++;
          s.values.forEach((v, i) => {
            if (v === null) return;
            distinct[i].add(typeof v + ":" + v);
            if (typeof v === "number") {
              if (minmax[i].min === null || v < minmax[i].min) minmax[i].min = v;
              if (minmax[i].max === null || v > minmax[i].max) minmax[i].max = v;
            }
          });
        }
      }
      table.stats = { rows, pages: table.pageIds.length, distinct: distinct.map((s) => s.size), minmax };
      return table.stats;
    }

    /**
     * Fraction of rows a sargable predicate keeps. Equality uses the number
     * of distinct values; numeric ranges assume values are spread evenly
     * between the column's min and max (real planners refine this with
     * histograms).
     */
    sargableSelectivity(stats, colIndex, s) {
      const d = Math.max(1, stats.distinct[colIndex]);
      if (s.eq) return 1 / d;
      const { min, max } = stats.minmax[colIndex];
      const numeric = (v) => v === null || typeof v === "number";
      if (min === null || max === min || !numeric(s.lo) || !numeric(s.hi)) return 1 / 3;
      const lo = s.lo === null ? min : Math.max(min, s.lo);
      const hi = s.hi === null ? max : Math.min(max, s.hi);
      if (hi < lo) return 0;
      return clamp((hi - lo) / (max - min) + 1 / d, 0, 1);
    }

    selectivity(conj, scope) {
      const distinctOf = (e) => {
        if (!e || e.type !== "column") return 0;
        try {
          const col = scope.columns[resolveColumn(scope, e)];
          const t = col.source && this.tables.get(col.source);
          return t ? this.tableStats(t).distinct[col.colIndex] : 0;
        } catch {
          return 0;
        }
      };
      if (conj.type === "binary" && conj.op === "=") {
        const d = Math.max(distinctOf(conj.left), distinctOf(conj.right));
        return d ? 1 / d : 0.1;
      }
      if ((conj.type === "binary" && ["<", "<=", ">", ">="].includes(conj.op)) || conj.type === "between") {
        try {
          const s = this.sargable(conj, scope);
          const col = s && scope.columns[s.colIndex];
          const t = col && col.source && this.tables.get(col.source);
          if (t) return this.sargableSelectivity(this.tableStats(t), col.colIndex, s);
        } catch {
          /* not a simple column-vs-constant range: fall through */
        }
        return conj.type === "between" ? 0.25 : 1 / 3;
      }
      if (conj.type === "isnull") return conj.not ? 0.9 : 0.1;
      if (conj.type === "in") return Math.min(1, conj.list.length * 0.1);
      if (conj.type === "like") return 0.25;
      return 0.5;
    }

    /** Recognises "col op constant" (either way round) or "col BETWEEN c1 AND c2". */
    sargable(conj, scope) {
      const FLIP = { "=": "=", "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
      const constant = (e) => compileExpr(e, { columns: [] }).fn([]);
      if (conj.type === "binary" && FLIP[conj.op]) {
        let colExpr = conj.left;
        let other = conj.right;
        let op = conj.op;
        if (colExpr.type !== "column" || !isConstant(other)) {
          colExpr = conj.right;
          other = conj.left;
          op = FLIP[conj.op];
          if (colExpr.type !== "column" || !isConstant(other)) return null;
        }
        const v = constant(other);
        if (v === null) return null;
        const r = { colIndex: resolveColumn(scope, colExpr), eq: op === "=", lo: null, hi: null, loInclusive: true, hiInclusive: true };
        if (op === "=") r.lo = r.hi = v;
        else if (op === "<" || op === "<=") {
          r.hi = v;
          r.hiInclusive = op === "<=";
        } else {
          r.lo = v;
          r.loInclusive = op === ">=";
        }
        return r;
      }
      if (conj.type === "between" && !conj.not && conj.expr.type === "column" && isConstant(conj.low) && isConstant(conj.high)) {
        const lo = constant(conj.low);
        const hi = constant(conj.high);
        if (lo === null || hi === null) return null;
        return { colIndex: resolveColumn(scope, conj.expr), eq: false, lo, hi, loInclusive: true, hiInclusive: true };
      }
      return null;
    }

    /** Picks SeqScan vs IndexScan for one table and wraps leftover predicates in a Filter. */
    planTableAccess(table, alias, scope, conjs) {
      const stats = this.tableStats(table);
      const seqCost = Math.max(1, stats.pages);
      let best = null;
      conjs.forEach((conj, i) => {
        const s = this.sargable(conj, scope);
        if (!s) return;
        const idx = table.indexes.find((ix) => ix.colIndex === scope.columns[s.colIndex].colIndex);
        if (!idx) return;
        const rows = stats.rows * this.sargableSelectivity(stats, idx.colIndex, s);
        // Cost in page reads: walk the tree, then (worst case) one heap page per match.
        const cost = idx.tree.height() + rows;
        if (!best || cost < best.cost) best = { s, idx, rows, cost, conjIndex: i };
      });
      let node;
      if (best && best.cost < seqCost) {
        node = this.indexScanNode(table, alias, best, `${best.idx.name}: est cost ${round1(best.cost)} < seq scan ${seqCost}`);
      } else {
        let reason;
        if (best) reason = `seq scan cost ${seqCost} ≤ ${best.idx.name} est cost ${round1(best.cost)} — the predicate isn't selective enough`;
        else if (!conjs.length) reason = "no predicate — every row is needed";
        else reason = table.indexes.length ? "no index matches the predicate" : `no index on ${table.name}`;
        node = this.seqScanNode(table, alias, { estRows: stats.rows, estCost: seqCost }, reason);
        best = null;
      }
      return this.filterNode(node, conjs.filter((_, i) => !best || i !== best.conjIndex), scope);
    }

    tableLabel(table, alias) {
      return alias !== table.name ? `${table.name} AS ${alias}` : table.name;
    }

    seqScanNode(table, alias, est, reason) {
      return this.makeNode(
        "SeqScan",
        this.tableLabel(table, alias),
        [],
        est,
        () => {
          const rows = [];
          for (const pageId of table.pageIds) {
            this.withPage(pageId, (page) => {
              page.slots.forEach((s, slot) => {
                if (!s) return;
                const rid = `${pageId}:${slot}`;
                const row = s.values.slice();
                row.rid = rid;
                this.emitRow({ type: "row", op: "scan", table: table.name, rid, values: s.values.slice() });
                rows.push(row);
              });
            });
          }
          return rows;
        },
        reason
      );
    }

    indexScanNode(table, alias, best, reason) {
      const { s, idx } = best;
      const col = idx.column;
      let cond;
      if (s.eq) cond = `${col} = ${formatValue(s.lo)}`;
      else {
        const parts = [];
        if (s.lo !== null) parts.push(`${col} ${s.loInclusive ? ">=" : ">"} ${formatValue(s.lo)}`);
        if (s.hi !== null) parts.push(`${col} ${s.hiInclusive ? "<=" : "<"} ${formatValue(s.hi)}`);
        cond = parts.join(" AND ");
      }
      return this.makeNode(
        "IndexScan",
        `${this.tableLabel(table, alias)} USING ${idx.name} (${cond})`,
        [],
        { estRows: best.rows, estCost: best.cost },
        () => {
          const sink = this.btreeSink(idx);
          const rids = s.eq
            ? idx.tree.search(s.lo, sink)
            : idx.tree.range(s.lo, s.hi, { loInclusive: s.loInclusive, hiInclusive: s.hiInclusive }, sink);
          const rows = [];
          for (const rid of rids) {
            const values = this.readRow(rid);
            if (!values) continue;
            const row = values.slice();
            row.rid = rid;
            this.emitRow({ type: "row", op: "match", table: table.name, rid, values });
            rows.push(row);
          }
          return rows;
        },
        reason
      );
    }

    filterNode(child, conjs, scope, label = null) {
      if (!conjs.length) return child;
      const pred = andAll(conjs);
      const compiled = compileExpr(pred, scope);
      const sel = conjs.reduce((p, c) => p * this.selectivity(c, scope), 1);
      const text = exprToSql(pred);
      return this.makeNode(
        "Filter",
        label ? `${label} ${text}` : text,
        [child],
        { estRows: child.estRows * sel, estCost: child.estCost + child.estRows * 0.01 },
        () => this.exec(child).filter((row) => truthy(compiled.fn(row)))
      );
    }

    planFrom(ast, whereConjs) {
      const refs = [ast.from, ...ast.joins];
      const seen = new Set();
      const parts = refs.map((ref) => {
        const table = this.requireTable(ref.table, ref.pos);
        if (seen.has(ref.alias)) throw new DbError(`table name or alias used twice: ${ref.alias}`, ref.pos);
        seen.add(ref.alias);
        return { ref, table, scope: this.tableScope(table, ref.alias) };
      });
      const fullScope = { columns: parts.flatMap((p) => p.scope.columns) };
      const aliasesOf = (expr) => {
        const s = new Set();
        walkExpr(expr, (e) => {
          if (e.type === "column") s.add(fullScope.columns[resolveColumn(fullScope, e)].table);
        });
        return s;
      };
      // Predicate pushdown: a WHERE conjunct naming one table filters that
      // table's scan (and may pick its index) instead of waiting for the join.
      const pushed = new Map(parts.map((p) => [p.ref.alias, []]));
      const above = [];
      for (const conj of whereConjs) {
        const aliases = containsAgg(conj) ? new Set() : aliasesOf(conj);
        if (aliases.size === 1) pushed.get([...aliases][0]).push(conj);
        else above.push(conj);
      }
      const first = parts[0];
      let node = this.planTableAccess(first.table, first.ref.alias, first.scope, pushed.get(first.ref.alias));
      let leftScope = first.scope;
      const leftAliases = new Set([first.ref.alias]);
      for (const { ref, table, scope: rightScope } of parts.slice(1)) {
        const joinScope = { columns: leftScope.columns.concat(rightScope.columns) };
        const rightOnly = [];
        const rest = [];
        let equi = null;
        for (const conj of conjuncts(ref.on)) {
          const aliases = aliasesOf(conj);
          for (const a of aliases) {
            if (a !== ref.alias && !leftAliases.has(a)) throw new DbError(`ON clause uses ${a} before it is joined`, ref.pos);
          }
          if (aliases.size === 1 && aliases.has(ref.alias)) {
            rightOnly.push(conj);
            continue;
          }
          if (!equi && conj.type === "binary" && conj.op === "=") {
            const la = aliasesOf(conj.left);
            const ra = aliasesOf(conj.right);
            const onlyLeft = (set) => set.size > 0 && [...set].every((a) => leftAliases.has(a));
            const onlyRight = (set) => set.size === 1 && set.has(ref.alias);
            if (onlyRight(ra) && onlyLeft(la)) equi = { leftExpr: conj.left, rightExpr: conj.right, conj };
            else if (onlyRight(la) && onlyLeft(ra)) equi = { leftExpr: conj.right, rightExpr: conj.left, conj };
            if (equi) continue;
          }
          rest.push(conj);
        }
        const rightFilters = pushed.get(ref.alias).concat(rightOnly);
        const residual = rest.length ? { compiled: compileExpr(andAll(rest), joinScope), text: exprToSql(andAll(rest)) } : null;
        const innerIdx =
          equi && equi.rightExpr.type === "column"
            ? table.indexes.find((ix) => ix.colIndex === rightScope.columns[resolveColumn(rightScope, equi.rightExpr)].colIndex)
            : null;
        if (equi && innerIdx) {
          node = this.indexNestedLoopNode(node, leftScope, table, ref.alias, rightScope, innerIdx, equi, rightFilters, residual);
        } else if (equi) {
          const right = this.planTableAccess(table, ref.alias, rightScope, rightFilters);
          node = this.hashJoinNode(node, leftScope, right, rightScope, joinScope, equi, residual);
        } else {
          const right = this.planTableAccess(table, ref.alias, rightScope, rightFilters);
          node = this.nestedLoopNode(node, right, residual);
        }
        leftScope = joinScope;
        leftAliases.add(ref.alias);
      }
      return { node: this.filterNode(node, above, leftScope), scope: leftScope };
    }

    indexNestedLoopNode(left, leftScope, table, alias, rightScope, idx, equi, rightFilters, residual) {
      const leftKey = compileExpr(equi.leftExpr, leftScope);
      const inner = rightFilters.length ? compileExpr(andAll(rightFilters), rightScope) : null;
      const stats = this.tableStats(table);
      const perProbe = stats.rows / Math.max(1, stats.distinct[idx.colIndex]);
      const extra = [rightFilters.length ? exprToSql(andAll(rightFilters)) : null, residual ? residual.text : null].filter(Boolean);
      return this.makeNode(
        "IndexNestedLoopJoin",
        `${this.tableLabel(table, alias)} USING ${idx.name} ON ${exprToSql(equi.conj)}${extra.length ? " AND " + extra.join(" AND ") : ""}`,
        [left],
        {
          estRows: left.estRows * perProbe * (inner ? 0.5 : 1),
          estCost: left.estCost + left.estRows * (idx.tree.height() + perProbe),
        },
        () => {
          const out = [];
          const sink = this.btreeSink(idx);
          for (const l of this.exec(left)) {
            const key = leftKey.fn(l);
            if (key === null) continue;
            for (const rid of idx.tree.search(key, sink)) {
              const values = this.readRow(rid);
              if (!values || (inner && !truthy(inner.fn(values)))) continue;
              const row = l.concat(values);
              if (residual && !truthy(residual.compiled.fn(row))) continue;
              this.emitRow({ type: "row", op: "match", table: table.name, rid, values });
              out.push(row);
            }
          }
          return out;
        },
        `index ${idx.name} covers the inner join column — one B+ tree probe per outer row`
      );
    }

    hashJoinNode(left, leftScope, right, rightScope, joinScope, equi, residual) {
      const leftKey = compileExpr(equi.leftExpr, leftScope);
      const rightKey = compileExpr(equi.rightExpr, rightScope);
      // Build the hash table on the smaller (estimated) input; probe with the other.
      const buildLeft = left.estRows < right.estRows;
      const side = buildLeft ? "left" : "right";
      const est = left.estRows * right.estRows * this.selectivity(equi.conj, joinScope);
      const node = this.makeNode(
        "HashJoin",
        `ON ${exprToSql(equi.conj)}${residual ? " AND " + residual.text : ""} (build ${side})`,
        [left, right],
        { estRows: est, estCost: left.estCost + right.estCost + (left.estRows + right.estRows) * 0.05 },
        () => {
          const leftRows = this.exec(left);
          const rightRows = this.exec(right);
          const build = buildLeft ? leftRows : rightRows;
          const probe = buildLeft ? rightRows : leftRows;
          const buildKey = buildLeft ? leftKey : rightKey;
          const probeKey = buildLeft ? rightKey : leftKey;
          const buckets = new Map();
          for (const row of build) {
            const k = buildKey.fn(row);
            if (k === null) continue; // NULL never equals anything, so it can't join
            const h = typeof k + ":" + k;
            if (!buckets.has(h)) buckets.set(h, []);
            buckets.get(h).push(row);
          }
          this.emit({ type: "hash-build", node: node.id, side, rows: build.length, buckets: buckets.size });
          const out = [];
          for (const row of probe) {
            const k = probeKey.fn(row);
            if (k === null) continue;
            for (const match of buckets.get(typeof k + ":" + k) || []) {
              const combined = buildLeft ? match.concat(row) : row.concat(match);
              if (residual && !truthy(residual.compiled.fn(combined))) continue;
              out.push(combined);
            }
          }
          return out;
        },
        `equality join without an index on the inner column — hash the smaller input (${side}, est ${round1(Math.min(left.estRows, right.estRows))} rows) and probe with the other`
      );
      return node;
    }

    nestedLoopNode(left, right, residual) {
      return this.makeNode(
        "NestedLoopJoin",
        residual ? `ON ${residual.text}` : "cross product",
        [left, right],
        {
          estRows: left.estRows * right.estRows * (residual ? 0.5 : 1),
          estCost: left.estCost + left.estRows * right.estCost,
        },
        () => {
          const out = [];
          // A true nested loop re-runs the inner input for every outer row —
          // watch the buffer pool churn when the inner table doesn't fit.
          for (const l of this.exec(left)) {
            for (const r of this.exec(right)) {
              const row = l.concat(r);
              if (residual && !truthy(residual.compiled.fn(row))) continue;
              out.push(row);
            }
          }
          return out;
        },
        residual ? "no equality between the inputs — every pair is compared" : "no join condition — cross product"
      );
    }

    planAggregate(child, baseScope, groupBy, ast) {
      const groupCompiled = groupBy.map((e) => compileExpr(e, baseScope));
      const slots = new Map();
      groupBy.forEach((e, i) => {
        const k = exprKey(e, baseScope);
        if (!slots.has(k)) slots.set(k, { index: i, type: groupCompiled[i].type });
      });
      const aggs = [];
      const collect = (expr) =>
        walkExpr(expr, (e) => {
          if (e.type !== "agg") return;
          if (e.arg && containsAgg(e.arg)) throw new DbError("aggregate functions cannot be nested", e.pos);
          const k = exprKey(e, baseScope);
          if (slots.has(k)) return;
          const arg = e.arg ? compileExpr(e.arg, baseScope) : null;
          const type = e.name === "count" ? "INT" : e.name === "avg" ? "REAL" : arg ? arg.type : "INT";
          slots.set(k, { index: groupBy.length + aggs.length, type });
          aggs.push({ name: e.name, distinct: e.distinct, arg, text: exprToSql(e) });
        });
      ast.columns.forEach((c) => {
        if (!c.star) collect(c.expr);
      });
      if (ast.having) collect(ast.having);
      ast.orderBy.forEach((o) => collect(o.expr));
      const detail =
        (groupBy.length ? `GROUP BY ${groupBy.map(exprToSql).join(", ")}` : "whole input as one group") +
        (aggs.length ? ` → ${aggs.map((a) => a.text).join(", ")}` : "");
      const node = this.makeNode(
        "HashAggregate",
        detail,
        [child],
        { estRows: groupBy.length ? Math.max(1, child.estRows * 0.3) : 1, estCost: child.estCost + child.estRows * 0.02 },
        () => {
          const groups = new Map();
          for (const row of this.exec(child)) {
            const keyVals = groupCompiled.map((g) => g.fn(row));
            const key = JSON.stringify(keyVals);
            let g = groups.get(key);
            if (!g) {
              g = { keyVals, states: aggs.map(newAggState) };
              groups.set(key, g);
            }
            aggs.forEach((a, i) => stepAgg(a, g.states[i], a.arg ? a.arg.fn(row) : 1));
          }
          // Aggregates without GROUP BY always produce one row, even over no input.
          if (!groups.size && !groupBy.length) groups.set("", { keyVals: [], states: aggs.map(newAggState) });
          this.emit({ type: "aggregate", node: node.id, groups: groups.size });
          return [...groups.values()].map((g) => g.keyVals.concat(aggs.map((a, i) => finishAgg(a, g.states[i]))));
        }
      );
      return { node, scope: { columns: [], grouped: true, slots, base: baseScope } };
    }

    sortNode(child, keys) {
      const n = Math.max(1, child.estRows);
      return this.makeNode(
        "Sort",
        keys.map((k) => k.text).join(", "),
        [child],
        { estRows: child.estRows, estCost: child.estCost + n * Math.log2(n + 1) * 0.01 },
        () => {
          const decorated = this.exec(child).map((row, i) => ({ row, i, k: keys.map((key) => key.fn(row)) }));
          decorated.sort((a, b) => {
            for (let j = 0; j < keys.length; j++) {
              const c = compareValues(a.k[j], b.k[j]);
              if (c) return keys[j].desc ? -c : c;
            }
            return a.i - b.i; // stable
          });
          return decorated.map((d) => d.row);
        }
      );
    }

    planSelect(ast) {
      const whereConjs = conjuncts(ast.where);
      let node;
      let scope;
      if (ast.from) {
        ({ node, scope } = this.planFrom(ast, whereConjs));
      } else {
        scope = { columns: [] };
        node = this.makeNode("Values", "one empty row (no FROM)", [], { estRows: 1, estCost: 0 }, () => [[]]);
        node = this.filterNode(node, whereConjs, scope);
      }
      const baseScope = scope;
      const selectExprAt = (n, clause) => {
        const item = ast.columns[n - 1];
        if (!item || item.star) throw new DbError(`${clause} position ${n} is not a selected expression`);
        return item.expr;
      };
      const aliasItem = (e) => (e.type === "column" && !e.table ? ast.columns.find((c) => !c.star && c.alias === e.name) : null);
      // GROUP BY 1 / GROUP BY alias resolve to select expressions (real column names win).
      const groupBy = ast.groupBy.map((e) => {
        if (e.type === "literal" && e.valueType === "INT") return selectExprAt(e.value, "GROUP BY");
        if (e.type === "column" && !e.table && !baseScope.columns.some((c) => c.name === e.name)) {
          const item = aliasItem(e);
          if (item) return item.expr;
        }
        return e;
      });
      const grouped =
        groupBy.length > 0 ||
        ast.columns.some((c) => !c.star && containsAgg(c.expr)) ||
        (ast.having && containsAgg(ast.having)) ||
        ast.orderBy.some((o) => containsAgg(o.expr));
      if (grouped) {
        if (ast.columns.some((c) => c.star)) throw new DbError("SELECT * cannot be combined with GROUP BY or aggregate functions");
        ({ node, scope } = this.planAggregate(node, baseScope, groupBy, ast));
        if (ast.having) node = this.filterNode(node, [ast.having], scope, "HAVING");
      } else if (ast.having) {
        throw new DbError("HAVING needs GROUP BY or an aggregate function");
      }
      // ORDER BY runs before projection so it can use columns that aren't selected;
      // positions and output aliases are swapped for the select expression.
      if (ast.orderBy.length) {
        const keys = ast.orderBy.map((o) => {
          let e = o.expr;
          if (e.type === "literal" && e.valueType === "INT") e = selectExprAt(e.value, "ORDER BY");
          else {
            const item = aliasItem(e);
            if (item) e = item.expr;
          }
          return { fn: compileExpr(e, scope).fn, desc: o.desc, text: exprToSql(o.expr) + (o.desc ? " DESC" : "") };
        });
        node = this.sortNode(node, keys);
      }
      const outputs = [];
      for (const item of ast.columns) {
        if (item.star) {
          const cols = scope.columns.map((c, i) => ({ c, i })).filter(({ c }) => !item.table || c.table === item.table);
          if (item.table && !cols.length) throw new DbError(`no such table or alias: ${item.table}`);
          cols.forEach(({ c, i }) => outputs.push({ name: c.name, qualified: `${c.table}.${c.name}`, fn: (row) => row[i] }));
        } else {
          const compiled = compileExpr(item.expr, scope);
          outputs.push({ name: item.alias || (item.expr.type === "column" ? item.expr.name : item.text), qualified: null, fn: compiled.fn });
        }
      }
      const counts = new Map();
      outputs.forEach((o) => counts.set(o.name, (counts.get(o.name) || 0) + 1));
      const columns = outputs.map((o) => (counts.get(o.name) > 1 && o.qualified ? o.qualified : o.name));
      const projected = node;
      node = this.makeNode("Project", columns.join(", "), [projected], { estRows: projected.estRows, estCost: projected.estCost }, () =>
        this.exec(projected).map((row) => outputs.map((o) => {
          const v = o.fn(row);
          return v === undefined ? null : v;
        }))
      );
      if (ast.distinct) {
        const child = node;
        node = this.makeNode("Distinct", "remove duplicate rows", [child], { estRows: child.estRows * 0.8, estCost: child.estCost + child.estRows * 0.01 }, () => {
          const seen = new Set();
          return this.exec(child).filter((r) => {
            const k = JSON.stringify(r);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        });
      }
      if (ast.limit !== null || ast.offset !== null) {
        const child = node;
        const offset = ast.offset || 0;
        const limit = ast.limit;
        const est = Math.max(0, Math.min(child.estRows - offset, limit === null ? Infinity : limit));
        node = this.makeNode("Limit", `LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ""}`, [child], { estRows: est, estCost: child.estCost }, () =>
          this.exec(child).slice(offset, limit === null ? undefined : offset + limit)
        );
      }
      return { node, columns };
    }

    // ----- crash, recovery, checkpoint -----

    /**
     * Power loss. Everything volatile disappears: buffer pool frames (dirty
     * pages included), log records that were never flushed, the in-memory
     * indexes and the open transaction (which becomes a "loser").
     */
    crash() {
      const events = [];
      if (this.crashed) return { events, lost: { logRecords: 0, records: [], dirtyPages: [], openTxn: null } };
      const lostRecords = this.log.filter((r) => r.lsn > this.flushedLsn);
      this.log = this.log.filter((r) => r.lsn <= this.flushedLsn);
      // Disk pages never carry a pageLSN beyond flushedLsn (the WAL rule), so
      // the lost tail's LSNs can safely be handed out again.
      this.nextLsn = this.flushedLsn + 1;
      const dirtyPages = this.pool.dropAll();
      for (const t of this.tables.values()) {
        t.stats = null;
        for (const idx of t.indexes) idx.tree = null;
      }
      this.indexesLive = false;
      const openTxn = this.txn ? this.txn.id : null;
      this.txn = null;
      this.crashed = true;
      events.push({
        type: "crash",
        lostLogRecords: lostRecords.length,
        lostLsns: lostRecords.map((r) => r.lsn),
        dirtyPages,
        openTxn,
        flushedLsn: this.flushedLsn,
      });
      return { events, lost: { logRecords: lostRecords.length, records: clone(lostRecords), dirtyPages, openTxn } };
    }

    /**
     * ARIES-style restart in three passes, then index rebuild:
     *   analysis — from the last checkpoint, find winners (committed or
     *              aborted) and losers (still active at the crash);
     *   redo     — repeat history: replay every logged change (losers' and
     *              CLRs included) whose page is older than the record;
     *   undo     — roll losers back newest-first, writing CLRs, then abort.
     */
    recover() {
      const events = [];
      const summary = { winners: [], losers: [], redone: 0, skipped: 0, undone: 0, redoFrom: 1 };
      if (!this.crashed) {
        events.push({ type: "recovery", phase: "done", detail: "nothing to recover — the database is running" });
        return { events, summary };
      }
      this.sink = events;
      this.rowEvents = 0;
      try {
        const checkpoint = [...this.log].reverse().find((r) => r.type === "checkpoint");
        const start = checkpoint ? checkpoint.lsn : 1;
        summary.redoFrom = start;
        const status = new Map();
        (checkpoint ? checkpoint.active : []).forEach((id) => status.set(id, "active"));
        for (const r of this.log) {
          if (r.lsn < start || r.type === "checkpoint") continue;
          if (!status.has(r.txn)) status.set(r.txn, "active");
          if (r.type === "commit") status.set(r.txn, "committed");
          if (r.type === "abort") status.set(r.txn, "aborted");
        }
        summary.winners = [...status].filter(([, s]) => s !== "active").map(([id]) => id);
        summary.losers = [...status].filter(([, s]) => s === "active").map(([id]) => id);
        this.emit({
          type: "recovery",
          phase: "analysis",
          lsn: start,
          detail: `${checkpoint ? `scan from checkpoint LSN ${start}` : "no checkpoint — scan the whole log"}: winners [${summary.winners.join(", ")}], losers [${summary.losers.join(", ")}]`,
          winners: summary.winners.slice(),
          losers: summary.losers.slice(),
        });

        for (const r of this.log) {
          if (r.lsn < start || !(DATA_RECORDS.has(r.type) || r.type === "clr")) continue;
          const table = this.tables.get(r.table);
          if (!table || table.uid !== r.uid) {
            summary.skipped++;
            continue;
          }
          const [pageId, slot] = splitRid(r.rid);
          const page = this.pool.fetch(pageId, this.sink);
          const pageLSN = page.pageLSN;
          const apply = pageLSN < r.lsn;
          if (apply) {
            applySlot(page, slot, r.after);
            page.pageLSN = r.lsn;
            summary.redone++;
          } else {
            summary.skipped++;
          }
          this.pool.unpin(pageId, apply, this.sink);
          this.emit({
            type: "recovery",
            phase: "redo",
            lsn: r.lsn,
            txn: r.txn,
            rid: r.rid,
            applied: apply,
            detail: apply
              ? `redo LSN ${r.lsn} (${r.type}) on ${pageId}: pageLSN ${pageLSN} < ${r.lsn}`
              : `skip LSN ${r.lsn}: ${pageId} already has pageLSN ${pageLSN}`,
          });
        }

        const losers = new Set(summary.losers);
        const compensated = new Set(this.log.filter((r) => r.type === "clr" && losers.has(r.txn)).map((r) => r.undoOf));
        const todo = this.log.filter((r) => losers.has(r.txn) && DATA_RECORDS.has(r.type) && !compensated.has(r.lsn)).reverse();
        for (const rec of todo) {
          this.emit({ type: "recovery", phase: "undo", lsn: rec.lsn, txn: rec.txn, rid: rec.rid, detail: `undo LSN ${rec.lsn} (${rec.type} by txn ${rec.txn})` });
          this.undoRecord(rec);
          summary.undone++;
        }
        for (const id of summary.losers) this.appendLog({ txn: id, type: "abort" });

        this.indexesLive = true;
        for (const t of this.tables.values()) {
          t.stats = null;
          for (const idx of t.indexes) {
            this.buildIndex(t, idx);
            this.emit({ type: "recovery", phase: "rebuild", detail: `rebuilt ${idx.name} from the heap: ${plural(idx.tree.size, "key")}` });
          }
        }
        this.flushLog(this.nextLsn - 1, this.sink, "end of recovery");
        this.crashed = false;
        this.emit({
          type: "recovery",
          phase: "done",
          detail: `recovered: redid ${summary.redone}, skipped ${summary.skipped}, undid ${summary.undone}`,
          summary: clone(summary),
        });
      } finally {
        this.sink = null;
      }
      return { events, summary };
    }

    /** Flush the log and every dirty page, then record which transactions are active. */
    checkpoint() {
      const events = [];
      if (this.crashed) {
        events.push({ type: "error", detail: "cannot checkpoint a crashed database — recover first" });
        return { events };
      }
      this.sink = events;
      try {
        this.flushLog(this.nextLsn - 1, events, "checkpoint");
        this.pool.flushAll(events);
        this.appendLog({ txn: null, type: "checkpoint", active: this.txn ? [this.txn.id] : [] });
        this.flushLog(this.nextLsn - 1, events, "checkpoint");
      } finally {
        this.sink = null;
      }
      return { events };
    }

    /** Changes the pool size or policy (dirty pages are flushed first). */
    setOptions(opts = {}) {
      const events = [];
      const next = normalizeOptions({ ...this.options, ...opts });
      if (next.bufferFrames !== this.options.bufferFrames || next.policy !== this.options.policy) {
        this.sink = events;
        try {
          this.pool.resize(next.bufferFrames, next.policy, events);
        } finally {
          this.sink = null;
        }
        events.push({ type: "pool-resized", frames: next.bufferFrames, policy: next.policy });
      }
      this.options.bufferFrames = next.bufferFrames;
      this.options.policy = next.policy;
      return { events };
    }

    /** Empty database; rowsPerPage / btreeOrder may change here. */
    reset(options = {}) {
      this.options = normalizeOptions({ ...this.options, ...options });
      this.init();
    }

    snapshot() {
      const tables = [...this.tables.values()].map((t) => ({
        name: t.name,
        columns: t.columns.map((c) => ({ name: c.name, type: c.type, primaryKey: !!c.primaryKey, notNull: !!c.notNull, unique: !!(c.unique || c.primaryKey) })),
        rowCount: this.tableStats(t).rows,
        pages: t.pageIds.map((id) => {
          const cached = this.pool.peek(id);
          const onDisk = this.disk.get(id);
          const page = cached || onDisk || { pageLSN: 0, slots: [] };
          return {
            id,
            pageLSN: page.pageLSN,
            diskLSN: onDisk ? onDisk.pageLSN : null,
            slots: page.slots.map((s, slot) => ({ slot, rid: `${id}:${slot}`, values: s ? s.values.slice() : null, deleted: !s })),
            inPool: !!cached,
            dirty: this.pool.isDirty(id),
            onDisk: !!onDisk,
          };
        }),
        indexes: t.indexes.map((idx) => ({ name: idx.name, column: idx.column, unique: idx.unique, tree: idx.tree ? idx.tree.snapshot() : null })),
      }));
      return {
        options: { ...this.options },
        crashed: this.crashed,
        txn: this.txn ? { id: this.txn.id, explicit: this.txn.explicit } : null,
        tables,
        bufferPool: this.pool.snapshot(),
        wal: { records: clone(this.log), flushedLsn: this.flushedLsn, nextLsn: this.nextLsn },
      };
    }
  }

  function andAll(list) {
    return list.reduce((acc, c) => (acc ? { type: "binary", op: "AND", left: acc, right: c } : c), null);
  }

  function newAggState(a) {
    return { count: 0, sum: 0, any: false, best: null, seen: a.distinct ? new Set() : null };
  }

  function stepAgg(a, st, v) {
    if (v === null) return; // aggregates skip NULLs; COUNT(*) passes 1 per row
    if (st.seen) {
      const k = typeof v + ":" + v;
      if (st.seen.has(k)) return;
      st.seen.add(k);
    }
    st.count++;
    if (a.name === "sum" || a.name === "avg") {
      if (typeof v !== "number") throw new DbError(`${a.name.toUpperCase()}() needs numbers, got ${formatValue(v)}`);
      st.sum += v;
      st.any = true;
    } else if (a.name === "min") {
      if (st.best === null || compareValues(v, st.best) < 0) st.best = v;
    } else if (a.name === "max") {
      if (st.best === null || compareValues(v, st.best) > 0) st.best = v;
    }
  }

  function finishAgg(a, st) {
    switch (a.name) {
      case "count":
        return st.count;
      case "sum":
        return st.any ? st.sum : null;
      case "avg":
        return st.count ? st.sum / st.count : null;
      default:
        return st.best;
    }
  }

  /** EXPLAIN text: one line per operator, children indented under parents. */
  function formatPlan(plan, { analyze = false } = {}) {
    const lines = [];
    const walk = (node, depth) => {
      const prefix = depth ? "  ".repeat(depth - 1) + "→ " : "";
      let stats = `est rows=${node.estRows} cost=${node.estCost}`;
      if (analyze && node.actualRows !== null) {
        stats += `; actual rows=${node.actualRows}${node.loops > 1 ? ` loops=${node.loops}` : ""}`;
      }
      lines.push(`${prefix}${node.op}${node.detail ? " " + node.detail : ""}  (${stats})`);
      node.children.forEach((c) => walk(c, depth + 1));
    };
    walk(plan, 0);
    return lines.join("\n");
  }

  // ---------- Sample scripts ----------

  function valuesList(rows) {
    return rows.map((r) => "(" + r.map(formatValue).join(", ") + ")").join(",\n  ");
  }

  const READINGS = Array.from({ length: 24 }, (_, i) => [i + 1, ((i * 5) % 12) + 1, 18 + ((i * 7) % 90) / 10]);
  const EVENT_IDS = [50, 20, 80, 10, 30, 60, 90, 5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 40, 70, 12, 18, 22, 28, 33, 38, 42, 47, 52, 58, 63];
  const LEDGER = Array.from({ length: 24 }, (_, i) => [i + 1, i % 3 === 0 ? "payroll" : "ops", 50 + ((i * 37) % 400)]);

  const SAMPLE_SCRIPTS = {
    starter: {
      title: "Starter shop",
      description: "Three small tables (users, products, orders), a filtered SELECT and a three-way join.",
      sql: `-- A tiny shop: customers, products and their orders.
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL, city TEXT, age INT);
CREATE TABLE products (id INT PRIMARY KEY, title TEXT NOT NULL, price REAL);
CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, product_id INT, qty INT);
INSERT INTO users VALUES
  (1, 'Ada', 'London', 36), (2, 'Grace', 'New York', 45), (3, 'Linus', 'Helsinki', 28),
  (4, 'Barbara', 'Boston', 52), (5, 'Edsger', 'Austin', 61), (6, 'Margaret', 'Boston', 33),
  (7, 'Alan', 'London', 41), (8, 'Radia', 'Seattle', 29);
INSERT INTO products VALUES (1, 'Keyboard', 49.5), (2, 'Monitor', 189.0), (3, 'Mouse', 19.99), (4, 'Laptop', 1299.0);
INSERT INTO orders VALUES
  (1, 1, 4, 1), (2, 1, 3, 2), (3, 2, 2, 1), (4, 3, 1, 1),
  (5, 4, 4, 1), (6, 6, 3, 3), (7, 7, 2, 2), (8, 2, 1, 1);
SELECT name, city, age FROM users WHERE age > 40 ORDER BY age DESC;
SELECT u.name, p.title, o.qty, p.price * o.qty AS total
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN products p ON p.id = o.product_id
ORDER BY total DESC;`,
    },
    "index-vs-scan": {
      title: "Index vs full scan",
      description: "The same query planned before and after CREATE INDEX — and a range the planner still scans.",
      sql: `-- The planner compares a full scan with an index lookup using a small cost model.
DROP TABLE IF EXISTS readings;
CREATE TABLE readings (id INT PRIMARY KEY, sensor INT, celsius REAL);
INSERT INTO readings VALUES
  ${valuesList(READINGS)};
EXPLAIN SELECT * FROM readings WHERE sensor = 7;   -- no index on sensor yet: SeqScan
CREATE INDEX idx_readings_sensor ON readings (sensor);
EXPLAIN SELECT * FROM readings WHERE sensor = 7;   -- selective equality: IndexScan
EXPLAIN SELECT * FROM readings WHERE sensor > 2;   -- matches most rows: SeqScan is cheaper
EXPLAIN ANALYZE SELECT * FROM readings WHERE id = 20;   -- runs it: actual rows appear`,
    },
    joins: {
      title: "Three join algorithms",
      description: "Index nested loop, hash join and nested loop — chosen by indexes and the join condition.",
      sql: `DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS courses;
CREATE TABLE students (id INT PRIMARY KEY, name TEXT NOT NULL, year INT);
CREATE TABLE courses (code TEXT, title TEXT, credits INT);
CREATE TABLE enrollments (student_id INT, course_code TEXT, grade INT);
INSERT INTO students VALUES (1, 'Ana', 1), (2, 'Ben', 2), (3, 'Chloe', 3), (4, 'Dev', 1), (5, 'Ema', 2), (6, 'Femi', 3);
INSERT INTO courses VALUES ('DB101', 'Databases', 2), ('OS201', 'Operating Systems', 3), ('NET150', 'Networks', 1), ('ML300', 'Machine Learning', 4);
INSERT INTO enrollments VALUES
  (1, 'DB101', 91), (1, 'OS201', 78), (2, 'DB101', 66), (3, 'ML300', 88), (3, 'NET150', 72),
  (4, 'OS201', 95), (5, 'DB101', 81), (5, 'ML300', 59), (6, 'NET150', 84), (2, 'OS201', 70);
-- students.id has a primary-key index → Index Nested Loop Join
SELECT s.name, e.course_code, e.grade FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.grade >= 80;
-- courses.code has no index, but the condition is an equality → Hash Join
SELECT e.student_id, c.title FROM enrollments e JOIN courses c ON c.code = e.course_code;
-- no equality at all → every pair is compared in a Nested Loop Join
SELECT s.name, c.title FROM students s JOIN courses c ON c.credits > s.year + 1;`,
    },
    aggregates: {
      title: "GROUP BY & aggregates",
      description: "COUNT(*) vs COUNT(col) with NULLs, SUM, AVG, HAVING and ORDER BY on an alias.",
      sql: `DROP TABLE IF EXISTS sales;
CREATE TABLE sales (id INT PRIMARY KEY, region TEXT, rep TEXT, amount REAL, units INT);
INSERT INTO sales VALUES
  (1, 'north', 'kim', 120.0, 3), (2, 'north', 'lee', NULL, 1), (3, 'south', 'kim', 80.5, 2),
  (4, 'south', 'sam', 210.0, 5), (5, 'east', 'lee', 99.9, 1), (6, 'north', 'sam', 45.0, 1),
  (7, 'east', 'kim', NULL, 2), (8, 'south', 'lee', 150.0, 4), (9, 'west', 'sam', 60.0, 2);
SELECT region, COUNT(*) AS orders, COUNT(amount) AS priced, SUM(units) AS units, ROUND(AVG(amount), 2) AS avg_amount
FROM sales GROUP BY region ORDER BY units DESC;
SELECT rep, MAX(amount) AS best FROM sales GROUP BY rep HAVING COUNT(*) >= 3 ORDER BY best DESC;
SELECT COUNT(DISTINCT region) AS regions, MIN(amount) AS smallest, SUM(amount) AS revenue FROM sales;`,
    },
    transactions: {
      title: "Transactions & rollback",
      description: "A transfer rolled back with compensation records, then the same transfer committed.",
      sql: `DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (id INT PRIMARY KEY, owner TEXT NOT NULL, balance INT);
INSERT INTO accounts VALUES (1, 'alice', 100), (2, 'bob', 50), (3, 'carol', 75);
-- A transfer we change our mind about: ROLLBACK writes a CLR per undone change.
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
UPDATE accounts SET balance = balance + 30 WHERE id = 2;
SELECT owner, balance FROM accounts;
ROLLBACK;
SELECT owner, balance FROM accounts;
-- The same transfer, committed: COMMIT forces the log to disk.
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
UPDATE accounts SET balance = balance + 30 WHERE id = 2;
COMMIT;
SELECT owner, balance FROM accounts;`,
    },
    "btree-splits": {
      title: "B+ tree splits & merges",
      description: "Thirty inserts into an order-4 tree split leaves, then internal nodes, then grow a new root; deletes borrow and merge.",
      sql: `-- Order 4: a node holds at most 3 keys, so inserts soon split nodes.
DROP TABLE IF EXISTS events;
CREATE TABLE events (id INT PRIMARY KEY, kind TEXT);
INSERT INTO events VALUES
  ${valuesList(EVENT_IDS.map((id, i) => [id, ["click", "view", "buy"][i % 3]]))};
-- Deleting a run of keys makes nodes underflow: they borrow from siblings or merge.
DELETE FROM events WHERE id BETWEEN 20 AND 45;
SELECT COUNT(*) AS remaining, MIN(id) AS lowest, MAX(id) AS highest FROM events;`,
    },
    "crash-recovery": {
      title: "Crash & recovery",
      description: "Committed rows plus an open transaction big enough to force steal. Then press Crash and Recover.",
      sql: `-- Commit some rows, then leave a transaction open with enough changes that the
-- 6-frame buffer pool must write ("steal") its dirty pages to disk early.
-- Next: press ⚡ Crash, then Recover. Committed rows survive; uncommitted ones vanish.
DROP TABLE IF EXISTS ledger;
CREATE TABLE ledger (id INT PRIMARY KEY, account TEXT NOT NULL, amount INT);
INSERT INTO ledger VALUES
  ${valuesList(LEDGER)};
BEGIN;
UPDATE ledger SET amount = amount * 2 WHERE account = 'ops';
INSERT INTO ledger VALUES (101, 'refund', -40), (102, 'refund', -15);
UPDATE ledger SET amount = 0 WHERE id <= 12;
SELECT account, SUM(amount) AS total FROM ledger GROUP BY account ORDER BY account;`,
    },
  };

  const api = {
    createDatabase: (options) => new Database(options),
    Database,
    BPlusTree,
    BufferPool,
    DbError,
    DEFAULT_OPTIONS: { ...DEFAULT_OPTIONS },
    SAMPLE_SCRIPTS,
    tokenize,
    parse,
    splitStatements,
    formatPlan,
    compareValues,
    createRng,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DbCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
