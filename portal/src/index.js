// LM Portal Worker: serves the Tool Library page and its API.
// Cloudflare Access sits in front, so every request carries the signed-in email.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

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


async function touchUser(env, email) {
  await env.DB.prepare(
    `INSERT INTO users (email, last_seen) VALUES (?1, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET last_seen = datetime('now')`
  ).bind(email).run();
  return env.DB.prepare("SELECT email, name, role FROM users WHERE email = ?1").bind(email).first();
}


// ---------- Team travel calendar (Outlook "Dreams Travel", published as ICS) ----------
// CAL_ICS_URL is a Worker secret: the calendar's ICS link works like a password, so it never goes in GitHub.
function icsUnfold(text) { return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
function icsDate(v, params) {
  // all-day: 20261124 ; timed: 20261124T150000Z or 20261124T090000 (TZID local; treated as that wall-clock time)
  const m = String(v || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params || "");
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null, utc: !!m[7], allDay };
}
function icsText(v) { return String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }
function parseIcs(text) {
  const out = [];
  for (const block of icsUnfold(text).split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0], ev = {};
    for (const line of body.split("\n")) {
      const i = line.indexOf(":"); if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      ev[name.toUpperCase()] = { v: line.slice(i + 1), p: params.join(";") };
    }
    if (!ev.DTSTART || (ev.STATUS && /CANCELLED/i.test(ev.STATUS.v))) continue;
    const start = icsDate(ev.DTSTART.v, ev.DTSTART.p), end = ev.DTEND ? icsDate(ev.DTEND.v, ev.DTEND.p) : start;
    if (!start) continue;
    // ICS all-day end dates are exclusive: show the last real day
    let last = end ? end.date : start.date;
    if (start.allDay && end && end.date > start.date) { const d = new Date(end.date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); last = d.toISOString().slice(0, 10); }
    out.push({ title: icsText(ev.SUMMARY && ev.SUMMARY.v) || "(no title)", location: icsText(ev.LOCATION && ev.LOCATION.v),
      start: start.date, end: last, allDay: start.allDay, time: start.time, recurring: !!ev.RRULE });
  }
  return out;
}
async function teamCalendar(env, url) {
  if (!env.CAL_ICS_URL) return { events: [], note: "CAL_ICS_URL not set" };
  const cache = caches.default, key = new Request("https://cache.lm-portal/team-calendar");
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(env.CAL_ICS_URL, { headers: { "user-agent": "lm-portal" } });
    if (!r.ok) return { events: [], error: "Calendar returned " + r.status };
    res = new Response(await r.text(), { headers: { "cache-control": "max-age=300" } });   // refresh every 5 minutes
    await cache.put(key, res.clone());
  }
  const all = parseIcs(await res.text());
  const today = new Date().toISOString().slice(0, 10);
  const fromQ = url.searchParams.get("from");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromQ || "") ? fromQ : today;
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "21", 10)));
  const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days - 1);
  const until = d.toISOString().slice(0, 10);
  const events = all.filter((e) => e.end >= from && e.start <= until).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return { events, today, from, until };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = accessEmail(request);
    if (!email && url.pathname.startsWith("/api/")) return json({ error: "Not signed in" }, 401);

    if (url.pathname === "/api/me" && request.method === "GET") {
      const me = await touchUser(env, email);
      const prefs = await env.DB.prepare("SELECT theme FROM prefs WHERE email=?1").bind(email).first().catch(() => null);
      return json({ ...me, theme: prefs?.theme || null });
    }

    // Display name, shown on the leaderboard and on RMA assignments
    if (url.pathname === "/api/me" && request.method === "PUT") {
      const { name } = await request.json();
      const n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
      await touchUser(env, email);
      await env.DB.prepare("UPDATE users SET name = ?1 WHERE email = ?2").bind(n || null, email).run();
      return json({ ok: true, name: n || null });
    }

    // Everyone who has signed in (for assigning RMA requests)
    if (url.pathname === "/api/users" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT email, name FROM users WHERE email LIKE '%@%.%' ORDER BY COALESCE(name, email)"
      ).all();
      return json({ users: results });
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
        "SELECT t.*, (SELECT MAX(r.date) FROM releases r WHERE r.slug = t.slug) AS last_release FROM tools t WHERE t.enabled = 1 ORDER BY t.sort, t.name"
      ).all();
      // who built each tool, and how many feature requests are still open for it
      let names = {}, open = {};
      try {
        (await env.DB.prepare("SELECT email, name FROM users").all()).results.forEach((u) => { names[u.email] = u.name; });
        (await env.DB.prepare("SELECT slug, COUNT(*) AS n FROM feature_requests WHERE status IN ('New', 'Planned') GROUP BY slug").all()).results.forEach((r) => { open[r.slug] = r.n; });
      } catch {}
      const tools = results.map((t) => ({
        ...t,
        file_needed: !!t.file_needed,
        local_only: !!t.local_only,
        downloads: t.downloads ? JSON.parse(t.downloads) : null,
        owner_name: t.owner ? (names[t.owner] || t.owner.split("@")[0]) : null,
        open_requests: open[t.slug] || 0,
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
                       "file_needed", "local_only", "sort", "enabled", "url", "downloads", "owner"];
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

    // RMA requests from the public lm-rma form (portal is behind Access, so only the team sees these)
    if (url.pathname === "/api/rma" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM rma_requests ORDER BY created DESC LIMIT 500"
      ).all().catch(() => ({ results: [] }));
      return json({ requests: results.map((r) => ({ ...r, units: r.units ? JSON.parse(r.units) : [] })) });
    }
    const rm = url.pathname.match(/^\/api\/rma\/([A-Z0-9-]{4,40})$/);
    if (rm && request.method === "PATCH") {
      const body = await request.json();
      const STATUSES = ["New", "In progress", "Waiting on customer", "Shipped", "Closed"];
      if ("status" in body && !STATUSES.includes(body.status)) return json({ error: "Unknown status" }, 400);
      if (body.assigned) {
        body.assigned = String(body.assigned).toLowerCase();
        const u = await env.DB.prepare("SELECT email FROM users WHERE email = ?1").bind(body.assigned).first();
        if (!u) return json({ error: "That person hasn't signed in to the portal yet" }, 400);
      }
      const sets = [], vals = [];
      for (const k of ["status", "assigned", "notes"]) if (k in body) { sets.push(`${k} = ?${vals.length + 1}`); vals.push(String(body[k] ?? "").slice(0, 8000)); }
      if (!sets.length) return json({ error: "Nothing to update" }, 400);
      vals.push(email); sets.push(`updated_by = ?${vals.length}`, "updated = datetime('now')");
      vals.push(rm[1]);
      await env.DB.prepare(`UPDATE rma_requests SET ${sets.join(", ")} WHERE ref = ?${vals.length}`).bind(...vals).run();
      return json({ ok: true });
    }

    // Customer log uploads (from the public lm-logs page). Files live in R2; only the team, signed in, can read them.
    if (url.pathname === "/api/logs" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT ref, created, status, name, company, email, site, rma_ref, description, files, total_bytes, assigned, notes, email_status, updated_by FROM log_uploads WHERE status != 'Uploading' ORDER BY created DESC LIMIT 500"
      ).all().catch(() => ({ results: [] }));
      return json({ uploads: results.map((r) => ({ ...r, files: JSON.parse(r.files || "[]").map((f, i) => ({ name: f.name, size: f.size, i, done: f.done, deleted: f.deleted })).filter((f) => f.done || f.deleted) })) });
    }
    const lg = url.pathname.match(/^\/api\/logs\/(LOG-\d{8}-[A-Z0-9]{4})(?:\/file\/(\d+))?$/);
    if (lg && lg[2] !== undefined && request.method === "GET") {
      const row = await env.DB.prepare("SELECT files FROM log_uploads WHERE ref = ?1").bind(lg[1]).first();
      const f = row && JSON.parse(row.files || "[]")[Number(lg[2])];
      if (!f || !f.done || !env.LOGS) return json({ error: "File not found" }, 404);
      const obj = await env.LOGS.get(f.key);
      if (!obj) return json({ error: "File not found (it may have been cleaned up)" }, 404);
      return new Response(obj.body, { headers: {
        "content-type": "application/octet-stream", "content-length": String(obj.size), "cache-control": "no-store",
        "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`,
      } });
    }
    if (lg && !lg[2] && request.method === "PATCH") {
      const body = await request.json();
      const STATUSES = ["New", "Reviewing", "Waiting on customer", "Done"];
      if ("status" in body && !STATUSES.includes(body.status)) return json({ error: "Unknown status" }, 400);
      if (body.assigned) {
        body.assigned = String(body.assigned).toLowerCase();
        const u = await env.DB.prepare("SELECT email FROM users WHERE email = ?1").bind(body.assigned).first();
        if (!u) return json({ error: "That person hasn't signed in to the portal yet" }, 400);
      }
      const sets = [], vals = [];
      for (const k of ["status", "assigned", "notes"]) if (k in body) { sets.push(`${k} = ?${vals.length + 1}`); vals.push(String(body[k] ?? "").slice(0, 8000)); }
      if (!sets.length) return json({ error: "Nothing to update" }, 400);
      vals.push(email); sets.push(`updated_by = ?${vals.length}`, "updated = datetime('now')");
      vals.push(lg[1]);
      await env.DB.prepare(`UPDATE log_uploads SET ${sets.join(", ")} WHERE ref = ?${vals.length}`).bind(...vals).run();
      return json({ ok: true });
    }
    // Delete the files of an upload (the record stays, marked Done)
    if (lg && !lg[2] && request.method === "DELETE") {
      const row = await env.DB.prepare("SELECT files FROM log_uploads WHERE ref = ?1").bind(lg[1]).first();
      if (!row) return json({ error: "Not found" }, 404);
      const files = JSON.parse(row.files || "[]");
      if (env.LOGS && files.length) await env.LOGS.delete(files.map((f) => f.key));
      files.forEach((f) => { f.done = false; f.deleted = true; });
      await env.DB.prepare("UPDATE log_uploads SET files = ?1, status = 'Done', updated_by = ?2, updated = datetime('now') WHERE ref = ?3")
        .bind(JSON.stringify(files), email, lg[1]).run();
      return json({ ok: true });
    }

    // Manuals & release notes shown on dcsupport.evertz.app/docs
    if (url.pathname === "/api/docs" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM docs ORDER BY uploaded DESC").all().catch(() => ({ results: [] }));
      return json({ docs: results });
    }
    if (url.pathname === "/api/docs" && request.method === "POST") {
      if (!env.DOCS) return json({ error: "The lm-docs bucket isn't connected" }, 500);
      const form = await request.formData();
      const file = form.get("file");
      const f = (k, n = 200) => String(form.get(k) || "").trim().slice(0, n);
      const product = f("product", 60) || "DreamCatcher", kind = f("kind", 40), version = f("version", 30), title = f("title", 200);
      if (!file || typeof file === "string" || !file.size) return json({ error: "Choose a file" }, 400);
      if (!kind || !version || !title) return json({ error: "Fill in the type, version and title" }, 400);
      const id = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const filename = String(file.name || "document.pdf").replace(/[\\/]+/g, "_").replace(/[^\w.\- ()+]+/g, "_").slice(-150);
      const key = `docs/${id}/${filename}`;
      await env.DOCS.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      await env.DB.prepare(
        `INSERT INTO docs (id, product, kind, version, title, filename, size, key, published, uploaded, uploaded_by, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), ?10, ?11)`
      ).bind(id, product, kind, version, title, filename, file.size, key, form.get("published") === "0" ? 0 : 1, email, f("notes", 500)).run();
      return json({ ok: true, id });
    }
    const dm = url.pathname.match(/^\/api\/docs\/([a-f0-9]{20})$/);
    if (dm && request.method === "PATCH") {
      const body = await request.json();
      const sets = [], vals = [];
      for (const k of ["product", "kind", "version", "title", "notes"]) if (k in body) { sets.push(`${k} = ?${vals.length + 1}`); vals.push(String(body[k] ?? "").trim().slice(0, 200)); }
      if ("published" in body) { sets.push(`published = ?${vals.length + 1}`); vals.push(body.published ? 1 : 0); }
      if (!sets.length) return json({ error: "Nothing to update" }, 400);
      vals.push(dm[1]);
      await env.DB.prepare(`UPDATE docs SET ${sets.join(", ")} WHERE id = ?${vals.length}`).bind(...vals).run();
      return json({ ok: true });
    }
    const df = url.pathname.match(/^\/api\/docs\/([a-f0-9]{20})\/file$/);
    if (df && request.method === "POST") {
      const row = await env.DB.prepare("SELECT key FROM docs WHERE id = ?1").bind(df[1]).first();
      if (!row || !env.DOCS) return json({ error: "Not found" }, 404);
      const form = await request.formData(), file = form.get("file");
      if (!file || typeof file === "string" || !file.size) return json({ error: "Choose a file" }, 400);
      const filename = String(file.name || "document.pdf").replace(/[\\/]+/g, "_").replace(/[^\w.\- ()+]+/g, "_").slice(-150);
      const key = `docs/${df[1]}/${Date.now().toString(36)}-${filename}`;
      await env.DOCS.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      await env.DB.prepare("UPDATE docs SET key = ?1, filename = ?2, size = ?3, uploaded = datetime('now'), uploaded_by = ?4 WHERE id = ?5")
        .bind(key, filename, file.size, email, df[1]).run();
      if (row.key !== key) await env.DOCS.delete(row.key);
      return json({ ok: true });
    }
    if (dm && request.method === "DELETE") {
      const row = await env.DB.prepare("SELECT key FROM docs WHERE id = ?1").bind(dm[1]).first();
      if (row && env.DOCS) await env.DOCS.delete(row.key);
      await env.DB.prepare("DELETE FROM docs WHERE id = ?1").bind(dm[1]).run();
      return json({ ok: true });
    }

    // ---------- Feature requests: anyone can ask; the tool's owner works the list ----------
    const FR_STATUSES = ["New", "Planned", "Done", "Declined"];
    const frShape = (r, names) => ({ ...r, votes: JSON.parse(r.votes || "[]"), requester_name: names[r.requester] || r.requester.split("@")[0] });
    const frNames = async () => { const m = {}; try { (await env.DB.prepare("SELECT email, name FROM users").all()).results.forEach((u) => { m[u.email] = u.name; }); } catch {} return m; };
    if (url.pathname === "/api/requests" && request.method === "GET") {
      const slug = url.searchParams.get("slug"), mine = url.searchParams.get("mine") === "1";
      let q, b = [];
      if (slug) { q = "SELECT * FROM feature_requests WHERE slug = ?1 ORDER BY created DESC LIMIT 300"; b = [slug]; }
      else if (mine) { q = "SELECT f.*, t.name AS tool_name FROM feature_requests f JOIN tools t ON t.slug = f.slug WHERE lower(t.owner) = ?1 ORDER BY f.created DESC LIMIT 500"; b = [email]; }
      else return json({ error: "Pass slug or mine=1" }, 400);
      const { results } = await env.DB.prepare(q).bind(...b).all().catch(() => ({ results: [] }));
      const names = await frNames();
      return json({ requests: results.map((r) => frShape(r, names)) });
    }
    if (url.pathname === "/api/requests" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      const slug = String(b.slug || ""), title = String(b.title || "").trim().slice(0, 140), details = String(b.details || "").trim().slice(0, 4000);
      if (!title) return json({ error: "Give the request a short title" }, 400);
      const tool = await env.DB.prepare("SELECT slug, owner FROM tools WHERE slug = ?1").bind(slug).first();
      if (!tool) return json({ error: "Unknown tool" }, 404);
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("INSERT INTO feature_requests (id, slug, title, details, requester, created, status, votes) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), 'New', ?6)")
        .bind(id, slug, title, details, email, JSON.stringify([email])).run();
      return json({ ok: true, id });
    }
    const frm = url.pathname.match(/^\/api\/requests\/([a-f0-9]{16})(\/vote)?$/);
    if (frm && frm[2] && request.method === "POST") {   // "me too": toggle your vote
      const r = await env.DB.prepare("SELECT votes FROM feature_requests WHERE id = ?1").bind(frm[1]).first();
      if (!r) return json({ error: "Not found" }, 404);
      let v = JSON.parse(r.votes || "[]");
      v = v.includes(email) ? v.filter((x) => x !== email) : v.concat(email);
      await env.DB.prepare("UPDATE feature_requests SET votes = ?1 WHERE id = ?2").bind(JSON.stringify(v), frm[1]).run();
      return json({ ok: true, votes: v });
    }
    if (frm && !frm[2] && request.method === "PATCH") {   // only the tool's owner (or an admin) changes status / replies
      const r = await env.DB.prepare("SELECT f.requester, t.owner FROM feature_requests f JOIN tools t ON t.slug = f.slug WHERE f.id = ?1").bind(frm[1]).first();
      if (!r) return json({ error: "Not found" }, 404);
      const me = await env.DB.prepare("SELECT role FROM users WHERE email = ?1").bind(email).first();
      if (String(r.owner || "").toLowerCase() !== email && !(me && me.role === "admin")) return json({ error: "Only the tool's owner can update this" }, 403);
      const b = await request.json().catch(() => ({}));
      if ("status" in b && !FR_STATUSES.includes(b.status)) return json({ error: "Unknown status" }, 400);
      const sets = [], vals = [];
      if ("status" in b) { sets.push(`status = ?${vals.length + 1}`); vals.push(b.status); }
      if ("owner_note" in b) { sets.push(`owner_note = ?${vals.length + 1}`); vals.push(String(b.owner_note || "").slice(0, 2000)); }
      if (!sets.length) return json({ error: "Nothing to update" }, 400);
      vals.push(email); sets.push(`updated_by = ?${vals.length}`, "updated = datetime('now')");
      vals.push(frm[1]);
      await env.DB.prepare(`UPDATE feature_requests SET ${sets.join(", ")} WHERE id = ?${vals.length}`).bind(...vals).run();
      return json({ ok: true });
    }
    if (frm && !frm[2] && request.method === "DELETE") {   // requester can withdraw a request that's still New
      const r = await env.DB.prepare("SELECT requester, status FROM feature_requests WHERE id = ?1").bind(frm[1]).first();
      if (!r) return json({ error: "Not found" }, 404);
      if (r.requester !== email || r.status !== "New") return json({ error: "You can only withdraw your own request while it's New" }, 403);
      await env.DB.prepare("DELETE FROM feature_requests WHERE id = ?1").bind(frm[1]).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/calendar" && request.method === "GET") {
      try { return json(await teamCalendar(env, url)); } catch (e) { return json({ events: [], error: String(e.message || e).slice(0, 200) }); }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
