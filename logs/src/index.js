// lm-logs: public page where customers upload log files for the Live Media team.
//   GET  /                     the upload page (public/index.html)
//   GET  /config               limits + Turnstile site key
//   POST /api/start            details + file list -> reference number + upload token
//   POST /api/file/create      start one file (R2 multipart upload)
//   PUT  /api/file/part        upload one chunk of a file
//   POST /api/file/complete    finish one file
//   POST /api/finish           mark the upload done and email the team
// Customers can only add files to their own upload (the token proves it). Nothing here reads files
// back: the team downloads them in the portal, behind Cloudflare Access.
import { EmailMessage } from "cloudflare:email";

const MB = 1024 * 1024;
const LIMITS = { files: 20, fileBytes: 5 * 1024 * MB, totalBytes: 20 * 1024 * MB, chunk: 20 * MB };

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const clean = (v, max = 2000) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
const emailOk = (e) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(e);
const safeName = (n) => String(n || "file").replace(/[\\/]+/g, "_").replace(/[^\w.\- ()+@]+/g, "_").slice(-150) || "file";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newRef() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 4).padStart(4, "0");
  return `LOG-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${rand}`;
}
function newToken() { return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function fmtBytes(n) { return n >= 1024 * MB ? (n / 1024 / MB).toFixed(2) + " GB" : n >= MB ? (n / MB).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || "" }),
  });
  return (await r.json()).success === true;
}

// The upload a request belongs to, if its token matches and it is still open for files.
async function openUpload(env, ref, token) {
  if (!/^LOG-\d{8}-[A-Z0-9]{4}$/.test(String(ref || "")) || !token) return null;
  const row = await env.DB.prepare("SELECT * FROM log_uploads WHERE ref = ?1").bind(ref).first();
  if (!row || row.token_hash !== await sha256(String(token)) || row.status !== "Uploading") return null;
  row.filesArr = JSON.parse(row.files || "[]");
  return row;
}

async function start(request, env) {
  const b = await request.json().catch(() => null);
  if (!b) return json({ error: "Bad request" }, 400);
  if (b.website) return json({ error: "Bad request" }, 400);   // honeypot
  if (!(await turnstileOk(env, b.turnstile, request.headers.get("CF-Connecting-IP"))))
    return json({ error: "Please complete the spam check and try again." }, 400);
  const r = {
    name: clean(b.name, 120), company: clean(b.company, 160), email: clean(b.email, 160),
    site: clean(b.site, 200), rma_ref: clean(b.rma_ref, 60), description: clean(b.description, 4000),
  };
  const files = (Array.isArray(b.files) ? b.files : []).map((f) => ({ name: safeName(f && f.name), size: Math.floor(Number(f && f.size) || 0) }));
  const missing = [];
  if (!r.name) missing.push("your name");
  if (!r.company) missing.push("company");
  if (!emailOk(r.email)) missing.push("a valid email address");
  if (!r.description) missing.push("what happened");
  if (!files.length) missing.push("at least one file");
  if (missing.length) return json({ error: "Please fill in: " + missing.join(", ") + "." }, 400);
  if (files.length > LIMITS.files) return json({ error: `Up to ${LIMITS.files} files per upload. Zip them together if you have more.` }, 400);
  const big = files.find((f) => f.size > LIMITS.fileBytes || f.size <= 0);
  if (big) return json({ error: `${big.name}: files must be between 1 byte and ${fmtBytes(LIMITS.fileBytes)}.` }, 400);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > LIMITS.totalBytes) return json({ error: `That's ${fmtBytes(total)}; one upload can be up to ${fmtBytes(LIMITS.totalBytes)}.` }, 400);

  const ref = newRef(), token = newToken();
  const stored = files.map((f, i) => ({ name: f.name, size: f.size, key: `${ref}/${String(i + 1).padStart(2, "0")}-${f.name}`, done: false }));
  await env.DB.prepare(
    `INSERT INTO log_uploads (ref, created, status, name, company, email, site, rma_ref, description, files, total_bytes, token_hash)
     VALUES (?1, datetime('now'), 'Uploading', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  ).bind(ref, r.name, r.company, r.email, r.site, r.rma_ref, r.description, JSON.stringify(stored), total, await sha256(token)).run();
  return json({ ref, token, chunk: LIMITS.chunk });
}

async function fileCreate(request, env) {
  const b = await request.json().catch(() => ({}));
  const up = await openUpload(env, b.ref, b.token);
  const f = up && up.filesArr[b.i];
  if (!f) return json({ error: "Upload not found or already finished." }, 403);
  const mpu = await env.LOGS.createMultipartUpload(f.key, {
    httpMetadata: { contentType: "application/octet-stream", contentDisposition: `attachment; filename="${f.name}"` },
    customMetadata: { ref: up.ref, company: up.company || "" },
  });
  return json({ uploadId: mpu.uploadId });
}

async function filePart(request, env, url) {
  const ref = url.searchParams.get("ref"), i = Number(url.searchParams.get("i")), n = Number(url.searchParams.get("n"));
  const up = await openUpload(env, ref, request.headers.get("X-Upload-Token"));
  const f = up && up.filesArr[i];
  if (!f || !(n >= 1 && n <= 10000)) return json({ error: "Upload not found or already finished." }, 403);
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > LIMITS.chunk) return json({ error: "Bad chunk size" }, 400);
  const part = await env.LOGS.resumeMultipartUpload(f.key, url.searchParams.get("uploadId")).uploadPart(n, body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function fileComplete(request, env) {
  const b = await request.json().catch(() => ({}));
  const up = await openUpload(env, b.ref, b.token);
  const f = up && up.filesArr[b.i];
  if (!f || !Array.isArray(b.parts)) return json({ error: "Upload not found or already finished." }, 403);
  const obj = await env.LOGS.resumeMultipartUpload(f.key, b.uploadId).complete(b.parts);
  f.done = true; f.size = obj.size;
  await env.DB.prepare("UPDATE log_uploads SET files = ?1 WHERE ref = ?2").bind(JSON.stringify(up.filesArr), up.ref).run();
  return json({ ok: true });
}

async function finish(request, env) {
  const b = await request.json().catch(() => ({}));
  const up = await openUpload(env, b.ref, b.token);
  if (!up) return json({ error: "Upload not found or already finished." }, 403);
  const got = up.filesArr.filter((f) => f.done);
  if (!got.length) return json({ error: "No files finished uploading. Please try again." }, 400);
  const total = got.reduce((n, f) => n + f.size, 0);
  await env.DB.prepare("UPDATE log_uploads SET status = 'New', total_bytes = ?1, email_status = 'pending' WHERE ref = ?2").bind(total, up.ref).run();
  const status = await notify(env, up, got, total);
  await env.DB.prepare("UPDATE log_uploads SET email_status = ?1 WHERE ref = ?2").bind(status, up.ref).run();
  return json({ ok: true, ref: up.ref, files: got.length, missing: up.filesArr.length - got.length });
}

// Email the team (same setup as the RMA form: TO_EMAIL is a comma-separated list of verified addresses).
async function notify(env, up, got, total) {
  const list = String(env.TO_EMAIL || "").split(",").map((x) => x.trim()).filter(emailOk);
  if (!env.EMAIL || !env.FROM_EMAIL || !list.length) return "not configured";
  const subject = `Logs uploaded ${up.ref}: ${up.company}${up.rma_ref ? " (" + up.rma_ref + ")" : ""}`;
  const body = [
    `New log upload ${up.ref}`, "",
    `From:     ${up.name} <${up.email}>`, `Company:  ${up.company}`, `Site:     ${up.site || "-"}`, `RMA/case: ${up.rma_ref || "-"}`, "",
    "What happened:", up.description, "",
    `Files (${got.length}, ${fmtBytes(total)}):`, ...got.map((f) => `  ${f.name}  (${fmtBytes(f.size)})`), "",
    `Download them in the portal: ${env.PORTAL_URL || ""} (INBOX > Log uploads)`,
  ].join("\r\n");
  const enc = (s) => "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
  const failed = [];
  for (const to of list) {
    const raw = [
      `From: ${enc("Live Media Logs")} <${env.FROM_EMAIL}>`, `To: <${to}>`, `Reply-To: <${up.email}>`,
      `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${up.ref}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@${env.FROM_EMAIL.split("@")[1]}>`,
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", body,
    ].join("\r\n");
    try { await env.EMAIL.send(new EmailMessage(env.FROM_EMAIL, to, raw)); }
    catch (e) { failed.push(to + " (" + String(e.message || e).slice(0, 100) + ")"); }
  }
  if (!failed.length) return list.length === 1 ? "sent" : `sent to ${list.length}`;
  return `sent ${list.length - failed.length}/${list.length}; failed: ` + failed.join("; ").slice(0, 300);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), m = request.method;
    try {
      if (url.pathname === "/config") return json({ turnstile: env.TURNSTILE_SITE_KEY || null, limits: LIMITS });
      if (url.pathname === "/api/start" && m === "POST") return await start(request, env);
      if (url.pathname === "/api/file/create" && m === "POST") return await fileCreate(request, env);
      if (url.pathname === "/api/file/part" && m === "PUT") return await filePart(request, env, url);
      if (url.pathname === "/api/file/complete" && m === "POST") return await fileComplete(request, env);
      if (url.pathname === "/api/finish" && m === "POST") return await finish(request, env);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Something went wrong on our side (" + String(e.message || e).slice(0, 160) + "). Please try again." }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
