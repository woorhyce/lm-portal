// lm-sync.js: adds a "Tool Library" link and makes a tool's existing localStorage sync to D1 with no other code changes.
// Load it FIRST in <head>:  <script src="/lm-sync.js"></script>
//  - On load: pulls your saved keys from the server into localStorage (server wins),
//    and uploads any keys that exist only in this browser (first-run migration).
//  - After that: every localStorage.setItem/removeItem is saved to the server (debounced).
// Back-to-portal link, added to every tool that loads this file.
(function () {
  if (!/^https?:$/.test(location.protocol) || window.self !== window.top) return;
  function add(portal) {
    if (!portal || document.getElementById("lm-home")) return;
    var a = document.createElement("a");
    a.id = "lm-home"; a.href = portal; a.title = "Back to the Live-Media Tool Library";
    a.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg><span>Tool Library</span>';
    a.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:6px;" +
      "padding:6px 11px;border-radius:999px;background:#1a2231;color:#e8ecf3;border:1px solid #33405a;" +
      "font:600 12px/1 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;opacity:.72;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .15s";
    a.onmouseenter = function () { a.style.opacity = "1"; };
    a.onmouseleave = function () { a.style.opacity = ".72"; };
    document.body.appendChild(a);
  }
  function go() {
    fetch("/api/me").then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (u) { add(u.portal); }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

(function () {
  if (!/^https?:$/.test(location.protocol)) return;            // opened as a local file: plain localStorage
  var ls = window.localStorage, P = Storage.prototype;
  var set = P.setItem, remove = P.removeItem, clear = P.clear;
  var MAX = 1800000;                                           // D1 value limit is ~2 MB
  var url = function (k) { return "/api/data/" + encodeURIComponent(k); };
  var timers = {}, pending = {};

  function push(k) {
    delete timers[k];
    var v = pending[k]; delete pending[k];
    if (v === null) return fetch(url(k), { method: "DELETE" }).catch(console.error);
    if (v.length > MAX) { console.warn("[lm-sync] " + k + " is too large to sync (" + v.length + " chars); kept in this browser only"); return; }
    fetch(url(k), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) })
      .then(function (r) { if (!r.ok) console.warn("[lm-sync] save failed for " + k + " (" + r.status + ")"); })
      .catch(console.error);
  }
  function queue(k, v) {
    pending[k] = v; clearTimeout(timers[k]);
    timers[k] = setTimeout(function () { push(k); }, 800);
  }

  // 1. Hydrate before the tool's own scripts run (synchronous on purpose).
  var online = false;
  try {
    var x = new XMLHttpRequest(); x.open("GET", "/api/data", false); x.send();
    if (x.status === 200) {
      online = true;
      var items = JSON.parse(x.responseText).items || [], have = {};
      items.forEach(function (it) { have[it.key] = 1; if (typeof it.value === "string") set.call(ls, it.key, it.value); });
      for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (!have[k]) queue(k, ls.getItem(k)); }
    }
  } catch (e) { console.warn("[lm-sync] offline, using this browser's data only", e); }
  if (!online) return;

  // 2. Mirror later changes.
  P.setItem = function (k, v) { set.call(this, k, v); if (this === ls) queue(String(k), String(v)); };
  P.removeItem = function (k) { remove.call(this, k); if (this === ls) queue(String(k), null); };
  P.clear = function () { if (this === ls) for (var i = 0; i < ls.length; i++) queue(ls.key(i), null); clear.call(this); };

  // 3. Flush anything still waiting when the page closes.
  addEventListener("pagehide", function () {
    Object.keys(timers).forEach(function (k) {
      clearTimeout(timers[k]); var v = pending[k];
      if (v === null) fetch(url(k), { method: "DELETE", keepalive: true });
      else if (v.length < 60000) fetch(url(k), { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      else push(k);
    });
  });
})();
