// LM Portal Worker: HF Clip Name Builder
// Serves public/ and a small per-user data API backed by the shared lm-db D1 database.
// The app itself runs entirely in the browser; it needs no secrets or external APIs.

const MAX_VALUE = 256 * 1024; // bytes per key, matches lm-sync's ~200 KB guidance with headroom

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Same identity rule as every other portal tool: Access email header, or the email inside
// Access's own token. Lowercased so data lines up across tools (tool_data is keyed by email).
function userEmail(request) {
  let e = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!e) {
    let tok = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!tok) { const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/); if (m) tok = m[1]; }
    try {
      const p = tok && tok.split(".")[1];
      if (p) e = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(p.length / 4) * 4, "="))).email;
    } catch {}
  }
  return e ? String(e).trim().toLowerCase() : "";
}

function parseValue(text) {
  try { return JSON.parse(text); } catch { return text; }
}

async function handleApi(request, env, url) {
  const email = userEmail(request);
  if (!email) return json({ error: "Not signed in through Cloudflare Access" }, 401);
  const tool = env.TOOL;
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (path === "/api/me" && method === "GET") {
    return json({ email, portal: env.PORTAL_URL });
  }

  if (path === "/api/data" && method === "GET") {
    const shared = url.searchParams.get("shared") === "1";
    const rows = await env.DB.prepare(
      "SELECT key, value, updated FROM tool_data WHERE tool = ?1 AND email = ?2 ORDER BY key"
    ).bind(tool, shared ? "*" : email).all();
    const pref = await env.DB.prepare("SELECT theme FROM prefs WHERE email = ?1").bind(email).first();
    return json({
      items: (rows.results || []).map(r => ({ key: r.key, value: parseValue(r.value), updated: r.updated })),
      prefs: { theme: pref ? pref.theme : null },
    });
  }

  if (path === "/api/prefs" && method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const theme = body && body.theme;
    if (theme !== "light" && theme !== "dark") return json({ error: "theme must be light or dark" }, 400);
    await env.DB.prepare(
      "INSERT INTO prefs (email, theme) VALUES (?1, ?2) ON CONFLICT(email) DO UPDATE SET theme = excluded.theme"
    ).bind(email, theme).run();
    return json({ ok: true, theme });
  }

  const m = path.match(/^\/api\/data\/(.+)$/);
  if (m) {
    let key;
    try { key = decodeURIComponent(m[1]); } catch { return json({ error: "Bad key" }, 400); }
    if (!key || key.length > 200) return json({ error: "Bad key" }, 400);
    const owner = url.searchParams.get("shared") === "1" ? "*" : email;

    if (method === "GET") {
      const row = await env.DB.prepare(
        "SELECT value, updated FROM tool_data WHERE tool = ?1 AND email = ?2 AND key = ?3"
      ).bind(tool, owner, key).first();
      if (!row) return json({ error: "Not found" }, 404);
      return json({ key, value: parseValue(row.value), updated: row.updated });
    }

    if (method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_VALUE) return json({ error: "Value too large" }, 413);
      let value;
      try { value = JSON.parse(text); } catch { return json({ error: "Body must be JSON" }, 400); }
      // accept either a bare JSON value or { value: ... }
      if (value && typeof value === "object" && !Array.isArray(value) && "value" in value && Object.keys(value).length === 1) value = value.value;
      const updated = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO tool_data (tool, email, key, value, updated) VALUES (?1, ?2, ?3, ?4, ?5) " +
        "ON CONFLICT(tool, email, key) DO UPDATE SET value = excluded.value, updated = excluded.updated"
      ).bind(tool, owner, key, JSON.stringify(value), updated).run();
      return json({ ok: true, key, updated });
    }

    if (method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM tool_data WHERE tool = ?1 AND email = ?2 AND key = ?3"
      ).bind(tool, owner, key).run();
      return json({ ok: true, key });
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "Server error", detail: String(err && err.message || err) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
