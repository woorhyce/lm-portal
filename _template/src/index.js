// Template tool Worker. Serves public/index.html and a per-user key/value API in D1.
//   GET    /api/data/:key          -> your value
//   PUT    /api/data/:key          -> save your value (JSON body)
//   GET    /api/data/:key?shared=1 -> team-shared value (PUT works the same)
//   GET    /api/me                 -> signed-in email

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = (request.headers.get("Cf-Access-Authenticated-User-Email") || "dev@local").toLowerCase();

    if (url.pathname === "/api/me") return json({ email, portal: env.PORTAL_URL });

    const m = url.pathname.match(/^\/api\/data\/([\w.-]{1,100})$/);
    if (m) {
      const owner = url.searchParams.get("shared") ? "*" : email;
      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT value, updated FROM tool_data WHERE tool=?1 AND email=?2 AND key=?3"
        ).bind(env.TOOL, owner, m[1]).first();
        return json(row ? { value: JSON.parse(row.value), updated: row.updated } : { value: null });
      }
      if (request.method === "PUT") {
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
