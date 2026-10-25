/* ============================================================
   Algo Lab — shared chrome for the newer labs (DB Lab, Hypervisor Lab)
   Theme, sound, cheat sheet, toast, announcer, clipboard, storage,
   speed → delay, and service worker registration.

   Browser global: LabCommon. Pure helpers also load in Node (CJS)
   so they can be unit-tested; DOM helpers no-op without a document.

   localStorage keys (shared with the older labs):
     theme — "dark" | "light"
     sound — "true" | "false"
   ============================================================ */

(function (root) {
  const hasWindow = typeof window !== "undefined";

  function safeGet(key) {
    try {
      return hasWindow ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      if (hasWindow) window.localStorage.setItem(key, value);
    } catch {
      /* private mode / blocked storage — ignore */
    }
  }

  function loadJSON(key, fallback) {
    const raw = safeGet(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    safeSet(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function prefersReducedMotion() {
    return !!(hasWindow && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /** Same curve as the older labs: speed 1 → 200 ms, speed 100 → 2 ms. */
  function delayForSpeed(speed) {
    if (prefersReducedMotion()) return 0;
    const s = Math.min(100, Math.max(1, Number(speed) || 50));
    return 202 - s * 2;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el.isContentEditable;
  }

  function isCheatSheetKey(e) {
    return e.key === "?" || (e.shiftKey && (e.key === "/" || e.code === "Slash"));
  }

  // ---------- Theme ----------
  function currentTheme() {
    return safeGet("theme") || "dark";
  }

  function applyTheme(theme, toggleBtn) {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    if (toggleBtn) {
      toggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      toggleBtn.setAttribute("aria-pressed", String(theme === "dark"));
      toggleBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function initTheme(toggleBtn) {
    applyTheme(currentTheme(), toggleBtn);
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        safeSet("theme", next);
        applyTheme(next, toggleBtn);
      });
    }
  }

  // ---------- Sound ----------
  class AudioManager {
    constructor() {
      this.enabled = safeGet("sound") === "true";
      this.ctx = null;
    }

    init() {
      if (!hasWindow) return false;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
    }

    beep(frequency = 440, duration = 0.03, volume = 0.04, type = "sine") {
      if (!this.enabled || !this.init()) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }

    tick() {
      this.beep(520, 0.02, 0.03);
    }

    alert() {
      this.beep(300, 0.06, 0.05, "square");
    }

    success() {
      this.beep(880, 0.06, 0.05);
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      safeSet("sound", String(this.enabled));
    }
  }

  function initSound(checkbox, audio) {
    if (!checkbox || !audio) return;
    checkbox.checked = audio.enabled;
    checkbox.addEventListener("change", () => {
      audio.setEnabled(checkbox.checked);
      if (checkbox.checked) audio.beep(660, 0.05, 0.06);
    });
  }

  // ---------- Cheat sheet ----------
  function initCheatSheet({ dialog, openBtn, closeBtn }) {
    const toggle = () => {
      if (!dialog) return;
      if (typeof dialog.showModal === "function") {
        if (dialog.open) dialog.close();
        else dialog.showModal();
      } else {
        dialog.hidden = !dialog.hidden;
      }
    };
    if (openBtn) openBtn.addEventListener("click", toggle);
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (dialog && typeof dialog.close === "function") dialog.close();
      });
    }
    if (dialog) {
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog && typeof dialog.close === "function") dialog.close();
      });
    }
    return {
      toggle,
      isOpen: () => !!(dialog && dialog.open),
    };
  }

  // ---------- Toast / announcer ----------
  let toastTimer = null;

  function toast(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 1800);
  }

  function announce(el, message) {
    if (el) el.textContent = message;
  }

  function copyText(text) {
    if (hasWindow && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => {
        window.prompt("Copy this text", text);
      });
    }
    if (hasWindow) window.prompt("Copy this text", text);
    return Promise.resolve();
  }

  function registerServiceWorker() {
    if (hasWindow && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  const api = {
    loadJSON,
    saveJSON,
    escapeHtml,
    prefersReducedMotion,
    delayForSpeed,
    sleep,
    isTypingTarget,
    isCheatSheetKey,
    initTheme,
    applyTheme,
    AudioManager,
    initSound,
    initCheatSheet,
    toast,
    announce,
    copyText,
    registerServiceWorker,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LabCommon = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
