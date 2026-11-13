// LM Portal Worker: serves the Tool Library page and its API.
// Cloudflare Access sits in front, so every request carries the signed-in email.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function userEmail(request) {
  return (request.headers.get("Cf-Access-Authenticated-User-Email") || "dev@local").toLowerCase();
}

async function touchUser(env, email) {
  await env.DB.prepare(
    `INSERT INTO users (email, last_seen) VALUES (?1, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET last_seen = datetime('now')`
  ).bind(email).run();
  return env.DB.prepare("SELECT email, name, role FROM users WHERE email = ?1").bind(email).first();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = userEmail(request);

    if (url.pathname === "/api/me") {
      const me = await touchUser(env, email);
      const prefs = await env.DB.prepare("SELECT theme FROM prefs WHERE email=?1").bind(email).first().catch(() => null);
      return json({ ...me, theme: prefs?.theme || null });
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

    if (url.pathname === "/api/tools") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM tools WHERE enabled = 1 ORDER BY sort, name"
      ).all();
      const tools = results.map((t) => ({
        ...t,
        file_needed: !!t.file_needed,
        local_only: !!t.local_only,
        downloads: t.downloads ? JSON.parse(t.downloads) : null,
        url: t.url || (t.local_only ? `/local/${t.slug}.html` : env.TOOL_URL.replace("{slug}", t.slug)),
      }));
      return json({ tools });
    }

    // Admins can bump a tool's version/date after deploying it:
    // PATCH /api/tools/admin  {"version":"2.3","updated":"2026-11-20"}
    const m = url.pathname.match(/^\/api\/tools\/([a-z0-9-]+)$/);
    if (m && request.method === "PATCH") {
      const me = await touchUser(env, email);
      if (me?.role !== "admin") return json({ error: "Admins only" }, 403);
      const body = await request.json();
      const allowed = ["name", "category", "description", "version", "updated", "icon",
                       "file_needed", "local_only", "sort", "enabled", "url", "downloads"];
      const sets = [], vals = [];
      for (const k of allowed) if (k in body) { sets.push(`${k} = ?${vals.length + 1}`); vals.push(body[k]); }
      if (!sets.length) return json({ error: "Nothing to update" }, 400);
      vals.push(m[1]);
      await env.DB.prepare(`UPDATE tools SET ${sets.join(", ")} WHERE slug = ?${vals.length}`)
        .bind(...vals).run();
      return json({ ok: true });
    }

    // Release notes
    //   GET  /api/tools/:slug/releases           -> newest first
    //   POST /api/tools/:slug/releases (admin)   {"version":"2.3","date":"2026-11-20","notes":"- Fixed X\n- Added Y"}
    //        also bumps the tool card's version and date.
    const r = url.pathname.match(/^\/api\/tools\/([a-z0-9-]+)\/releases$/);
    if (r && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT version, date, notes FROM releases WHERE slug = ?1 ORDER BY date DESC, version DESC"
      ).bind(r[1]).all();
      return json({ releases: results });
    }
    if (r && request.method === "POST") {
      const me = await touchUser(env, email);
      if (me?.role !== "admin") return json({ error: "Admins only" }, 403);
      const { version, notes, date = new Date().toISOString().slice(0, 10) } = await request.json();
      if (!version || !notes) return json({ error: "version and notes are required" }, 400);
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES (?1, ?2, ?3, ?4)")
          .bind(r[1], version, date, notes),
        env.DB.prepare("UPDATE tools SET version = ?1, updated = ?2 WHERE slug = ?3").bind(version, date, r[1]),
      ]);
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
