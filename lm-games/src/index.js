// Template tool Worker. Serves public/index.html and a per-user key/value API in D1.
//   GET    /api/data/:key          -> your value
//   PUT    /api/data/:key          -> save your value (JSON body)
//   GET    /api/data/:key?shared=1 -> team-shared value (PUT works the same)
//   GET    /api/me                 -> signed-in email
//   GET    /api/data               -> all of your keys for this tool + your shared prefs (used by lm-sync.js)
//   PUT    /api/prefs              -> {"theme":"light"|"dark"}, shared by every tool and the portal

// Who is signed in. Cloudflare Access sits in front of every hostname and passes the email,
// either as a header or inside its signed token. No sign-in = no email = API calls are refused.
function accessEmail(request) {
  let e = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!e) {
    let tok = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!tok) { const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/); if (m) tok = m[1]; }
    try {
      const p = tok && tok.split(".")[1];
      if (p) e = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(p.length / 4) * 4, "="))).email;
    } catch {}
  }
  return e ? String(e).toLowerCase() : null;
}

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = accessEmail(request);
    if (!email && url.pathname.startsWith("/api/")) return json({ error: "Not signed in" }, 401);

    if (url.pathname === "/api/me") return json({ email, portal: env.PORTAL_URL });

    if (url.pathname === "/api/data" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT key, value, updated FROM tool_data WHERE tool=?1 AND email=?2"
      ).bind(env.TOOL, email).all();
      const prefs = await env.DB.prepare("SELECT theme FROM prefs WHERE email=?1").bind(email).first().catch(() => null);
      return json({ items: results.map(r => ({ key: r.key, value: JSON.parse(r.value), updated: r.updated })), prefs: prefs || {} });
    }

    if (url.pathname === "/api/prefs" && request.method === "PUT") {
      const { theme } = await request.json();
      if (theme !== "light" && theme !== "dark") return json({ error: "theme must be light or dark" }, 400);
      await env.DB.prepare(
        `INSERT INTO prefs (email, theme, updated) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(email) DO UPDATE SET theme=?2, updated=datetime('now')`
      ).bind(email, theme).run();
      return json({ ok: true });
    }

    // Leaderboard: everyone's synced best score for one game.
    //   /api/leaderboard            -> Replay Academy ("dcra-hi"), kept for the Academy page
    //   /api/leaderboard?key=ib-hi  -> any key in GAME_KEYS
    // LOW_KEYS are fastest-time games, where the smallest number wins.
    const GAME_KEYS = ["dcra-hi", "rop-hi", "ib-hi", "mfr-best", "vt-hi", "s16-best"];
    const LOW_KEYS = ["s16-best"];
    if (url.pathname === "/api/leaderboard") {
      const lbKey = url.searchParams.get("key") || "dcra-hi";
      if (!GAME_KEYS.includes(lbKey)) return json({ error: "unknown game" }, 400);
      const order = LOW_KEYS.includes(lbKey) ? "ASC" : "DESC";
      const { results } = await env.DB.prepare(
        `SELECT d.email, u.name, CAST(json_extract(d.value, '$') AS INTEGER) AS score, d.updated
           FROM tool_data d LEFT JOIN users u ON u.email = d.email
          WHERE d.tool = ?1 AND d.key = ?2 AND d.email LIKE '%@%.%' AND CAST(json_extract(d.value, '$') AS INTEGER) > 0
          ORDER BY score ${order}, d.updated ASC LIMIT 10`
      ).bind(env.TOOL, lbKey).all();
      const label = (r) => (r.name || r.email.split("@")[0].replace(/[._-]+/g, " ")).toUpperCase().slice(0, 16);
      return json({ me: email, rows: results.map((r, i) => ({ rank: i + 1, name: label(r), score: r.score, you: r.email === email })) });
    }

    const raw = url.pathname.startsWith("/api/data/") ? url.pathname.slice(10) : null;
    let dkey = null;
    try { dkey = raw && decodeURIComponent(raw); } catch {}
    const m = dkey && dkey.length <= 200 ? [null, dkey] : null;
    if (m) {
      const owner = url.searchParams.get("shared") ? "*" : email;
      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT value, updated FROM tool_data WHERE tool=?1 AND email=?2 AND key=?3"
        ).bind(env.TOOL, owner, m[1]).first();
        return json(row ? { value: JSON.parse(row.value), updated: row.updated } : { value: null });
      }
      if (request.method === "PUT" || request.method === "POST") {
        const value = JSON.stringify(await request.json());
        await env.DB.prepare(
          `INSERT INTO tool_data (tool,email,key,value,updated) VALUES (?1,?2,?3,?4,datetime('now'))
           ON CONFLICT(tool,email,key) DO UPDATE SET value=?4, updated=datetime('now')`
        ).bind(env.TOOL, owner, m[1], value).run();
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM tool_data WHERE tool=?1 AND email=?2 AND key=?3")
          .bind(env.TOOL, owner, m[1]).run();
        return json({ ok: true });
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
