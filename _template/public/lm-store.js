// Drop-in replacement for localStorage in existing tools.
// Usage:  <script src="/lm-store.js"></script>
//   const trips = await LM.load("trips", []);
//   await LM.save("trips", trips);
//   LM.saveSoon("trips", trips);  // debounced, good for on-input saves
window.LM = {
  async load(key, fallback = null, shared = false) {
    try {
      const r = await fetch(`/api/data/${key}${shared ? "?shared=1" : ""}`);
      const { value } = await r.json();
      return value ?? fallback;
    } catch { return fallback; }
  },
  async save(key, value, shared = false) {
    const r = await fetch(`/api/data/${key}${shared ? "?shared=1" : ""}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
    });
    if (!r.ok) throw new Error(`Save failed for ${key} (${r.status})`);
  },
  _t: {},
  saveSoon(key, value, shared = false, ms = 800) {
    clearTimeout(this._t[key]);
    this._t[key] = setTimeout(() => this.save(key, value, shared).catch(console.error), ms);
  },
  async me() { return (await fetch("/api/me")).json(); },
};
