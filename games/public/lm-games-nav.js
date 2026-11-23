// lm-games-nav.js: adds a small "LM Games" pill (bottom-left) on each game page that leads back to the games menu.
(function () {
  if (window.self !== window.top) return;
  function add() {
    if (document.getElementById("lm-games-home")) return;
    var a = document.createElement("a");
    a.id = "lm-games-home"; a.href = "./"; a.title = "Back to the LM Arcade menu";
    a.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span>LM Arcade</span>';
    a.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:5px;" +
      "padding:6px 11px 6px 8px;border-radius:999px;background:#1a2231;color:#e8ecf3;border:1px solid #33405a;" +
      "font:600 12px/1 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;opacity:.72;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .15s";
    a.onmouseenter = function () { a.style.opacity = "1"; };
    a.onmouseleave = function () { a.style.opacity = ".72"; };
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
})();
