// lm-ui.js: the Live Media banner + shared light/dark switch for every tool.
// Usage: <script src="/lm-ui.js" data-suffix="Schedule Builder" defer></script>
// Adds the banner at the top of <body> unless the page already has .identity-bar,
// and wires any .theme-switch on the page. Theme changes save to the shared preference via lm-sync.js.
(function () {
  var me = document.currentScript, suffix = (me && me.getAttribute("data-suffix")) || "";
  var LOGO = '<svg class="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 181.40 20" role="img" aria-label="Live Media"><g transform="translate(7,5)" fill="none" stroke-width="1.45" stroke-linecap="square" stroke-linejoin="round"><path d="M0,0 V7.4 Q0,10 2.6,10 H17" transform="translate(0.00,0)" stroke="#ffffff"/><path d="M0,0 V10" transform="translate(21.60,0)" stroke="#ffffff"/><path d="M0,0 L8.5,10 L17,0" transform="translate(26.20,0)" stroke="#ffffff"/><path d="M17,0 H2.6 Q0,0 0,2.6 V7.4 Q0,10 2.6,10 H17" transform="translate(47.80,0)" stroke="#ffffff"/><path d="M0,5.0 H14" transform="translate(47.80,0)" stroke="#ffffff"/><path d="M0,5.0 H7" transform="translate(69.40,0)" stroke="#3d8bea"/><path d="M0,10 V2.6 Q0,0 2.6,0 H14.4 Q17,0 17,2.6 V10" transform="translate(81.00,0)" stroke="#3d8bea"/><path d="M8.5,0 V10" transform="translate(81.00,0)" stroke="#3d8bea"/><path d="M17,0 H2.6 Q0,0 0,2.6 V7.4 Q0,10 2.6,10 H17" transform="translate(102.60,0)" stroke="#3d8bea"/><path d="M0,5.0 H14" transform="translate(102.60,0)" stroke="#3d8bea"/><path d="M0,0 H14.4 Q17,0 17,2.6 V7.4 Q17,10 14.4,10 H0 Z" transform="translate(124.20,0)" stroke="#3d8bea"/><path d="M0,0 V10" transform="translate(145.80,0)" stroke="#3d8bea"/><path d="M0,10 V2.6 Q0,0 2.6,0 H14.4 Q17,0 17,2.6 V10" transform="translate(150.40,0)" stroke="#3d8bea"/><path d="M0,5.8 H17" transform="translate(150.40,0)" stroke="#3d8bea"/></g></svg>';
  var SWITCH = '<button class="theme-switch" type="button" role="switch" aria-checked="false" aria-label="Dark mode">' +
    '<span class="ts-light"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span class="ts-word">Light</span></span>' +
    '<span class="ts-track"><span class="ts-knob"></span></span>' +
    '<span class="ts-dark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><span class="ts-word">Dark</span></span></button>';
  // Apply the last theme used in this browser before first paint (the shared preference from lm-sync.js wins).
  try { var saved = localStorage.getItem("lmmon-theme");
    if (!document.documentElement.getAttribute("data-theme") && (saved === "light" || saved === "dark")) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}
  var dq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function isDark() { var t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : !!(dq && dq.matches); }
  function render() { document.querySelectorAll(".theme-switch").forEach(function (b) { b.setAttribute("aria-checked", isDark() ? "true" : "false"); }); }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("lmmon-theme", t); } catch (e) {}
    render();
  }
  function init() {
    if (!document.querySelector(".identity-bar")) {
      var bar = document.createElement("header");
      bar.className = "identity-bar"; bar.id = "identityBar";
      bar.innerHTML = '<div class="identity-brand">' + LOGO +
        (suffix ? '<span class="brand-suffix">' + suffix.replace(/[&<>]/g, "") + "</span>" : "") + "</div>" + SWITCH;
      document.body.insertBefore(bar, document.body.firstChild);
    } else if (!document.querySelector(".theme-switch")) {
      document.querySelector(".identity-bar").insertAdjacentHTML("beforeend", SWITCH);
    }
    document.querySelectorAll(".theme-switch").forEach(function (b) {
      if (b.__lm) return; b.__lm = 1;
      b.addEventListener("click", function () { setTheme(isDark() ? "light" : "dark"); });
    });
    if (dq && dq.addEventListener) dq.addEventListener("change", render);
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.LMUI = { setTheme: setTheme, isDark: isDark };
})();

// Clicking the Live Media logo in any banner goes back to the Tool Library home.
(function () {
  function portalUrl() {
    var h = location.hostname, parts = h.split(".");
    if (/\.workers\.dev$/.test(h)) return location.protocol + "//lm-portal." + parts.slice(1).join(".") + "/";
    if (parts.length > 2) return location.protocol + "//" + parts.slice(1).join(".") + "/";
    return "/";
  }
  function link() {
    document.querySelectorAll(".identity-bar .brand-logo").forEach(function (logo) {
      if (logo.closest("a")) return;
      var a = document.createElement("a");
      a.href = portalUrl(); a.className = "brand-home"; a.title = "Live-Media Tool Library";
      a.setAttribute("aria-label", "Live-Media Tool Library home");
      a.style.cssText = "display:flex;align-items:center;color:inherit;text-decoration:none";
      logo.parentNode.insertBefore(a, logo); a.appendChild(logo);
    });
  }
  if (!/^https?:$/.test(location.protocol) || document.documentElement.hasAttribute("data-lm-public")) return;   /* public pages (RMA form) keep a plain logo */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(link, 0); }); else setTimeout(link, 0);
})();
