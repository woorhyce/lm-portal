// lm-rma: public customer RMA form.
//   GET  /            the form (public/index.html); on dcsupport.evertz.app, the support home (public/support/)
//   GET  /config      Turnstile site key, if spam protection is on
//   POST /api/submit  validate, save to D1 (rma_requests), email TO_EMAIL
// There is deliberately no endpoint that reads requests back; the portal does that behind Access.
import { EmailMessage } from "cloudflare:email";

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const TYPES = ["Repair", "Replacement", "Warranty Replacement", "Other"];
const YN = ["Yes", "No", ""];
const clean = (v, max = 2000) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
const emailOk = (e) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(e);

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || "" }),
  });
  return (await r.json()).success === true;
}

function rmaNumber() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 4).padStart(4, "0");
  return `LM-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${rand}`;
}

function emailBody(r) {
  const yn = (v) => v || "Not answered";
  const lines = [
    `New RMA request ${r.ref}`, "",
    `Contact:   ${r.contact}`, `Company:   ${r.company}`, `Phone:     ${r.phone}`, `Email:     ${r.email}`,
    r.cc ? `CC:        ${r.cc}` : null, "",
    `Type:      ${r.type}`, `Urgent / Hot RMA: ${r.urgent === "Yes" ? "YES" : "No"}`,
    `Loaner needed: ${r.loaner === "Yes" ? "YES" : "No"}`, `Needed by: ${r.needed_by || "Not given"}`,
    `Verified prior to shipping: ${r.verified || "No (Evertz will assign as necessary)"}`,
    `Accepts evaluation fee + automatic return if no fault found: ${yn(r.auto_return)}`, "",
    "Company address:", r.company_address, "", "Shipping address:", r.shipping_address, "",
  ];
  r.units.forEach((u, i) => lines.push(
    `Unit ${i + 1}`, `  Part number:   ${u.part}`, `  Serial number: ${u.serial}`, `  Firmware:      ${u.firmware || "-"}`,
    `  Problem:`, ...u.problem.split("\n").map((l) => "    " + l),
    ...(u.troubleshooting ? ["  Troubleshooting:", ...u.troubleshooting.split("\n").map((l) => "    " + l)] : []), ""));
  return lines.filter((l) => l !== null).join("\r\n");
}

// TO_EMAIL can be one address or several, comma-separated. Each one gets its own copy, and each must
// be a verified destination address in Email Routing.
function recipients(env) {
  return String(env.TO_EMAIL || "").split(",").map((x) => x.trim()).filter((x) => emailOk(x));
}

async function sendEmail(env, r) {
  const list = recipients(env);
  if (!env.EMAIL || !env.FROM_EMAIL || !list.length) return "not configured";
  const flags = [r.urgent === "Yes" ? "URGENT / HOT" : "", r.loaner === "Yes" ? "LOANER" : ""].filter(Boolean).join(", ");
  const subject = `RMA request ${r.ref}: ${r.company}${flags ? " (" + flags + ")" : ""}`;
  const failed = [];
  for (const to of list) {
    const res = await sendOne(env, r, subject, to);
    if (res !== "sent") failed.push(to + " (" + res + ")");
  }
  if (!failed.length) return list.length === 1 ? "sent" : `sent to ${list.length}`;
  return `sent ${list.length - failed.length}/${list.length}; failed: ` + failed.join("; ").slice(0, 300);
}

async function sendOne(env, r, subject, to) {
  const enc = (s) => "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
  const raw = [
    `From: ${enc("Live Media RMA")} <${env.FROM_EMAIL}>`,
    `To: <${to}>`,
    `Reply-To: <${r.email}>`,
    `Subject: ${enc(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${r.ref}.${Date.now()}@${env.FROM_EMAIL.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "", emailBody(r),
  ].join("\r\n");
  try {
    await env.EMAIL.send(new EmailMessage(env.FROM_EMAIL, to, raw));
    return "sent";
  } catch (e) {
    return String(e.message || e).slice(0, 120);
  }
}

async function submit(request, env) {
    let b;
    try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
    if (b.website) return json({ ok: true, ref: "LM-0" });           // honeypot: bots fill hidden fields
    if (!(await turnstileOk(env, b.turnstile, request.headers.get("CF-Connecting-IP"))))
      return json({ error: "Please complete the spam check and try again." }, 400);

    const r = {
      ref: rmaNumber(),
      contact: clean(b.contact, 120), company: clean(b.company, 160), phone: clean(b.phone, 60),
      email: clean(b.email, 160), cc: clean(b.cc, 400),
      type: clean(b.type, 40), urgent: clean(b.urgent, 3), flag_receipt: clean(b.flag_receipt, 3),
      verified: clean(b.verified, 80), hot: clean(b.hot, 3), auto_return: clean(b.auto_return, 3),
      loaner: clean(b.loaner, 3), needed_by: /^\d{4}-\d{2}-\d{2}$/.test(String(b.needed_by || "")) ? b.needed_by : "",
      company_address: clean(b.company_address, 600), shipping_address: clean(b.shipping_address, 600),
      units: (Array.isArray(b.units) ? b.units : []).slice(0, 20).map((u) => ({
        part: clean(u.part, 120), serial: clean(u.serial, 120), firmware: clean(u.firmware, 120),
        problem: clean(u.problem, 4000), troubleshooting: clean(u.troubleshooting, 4000),
      })),
    };
    const missing = [];
    for (const [k, label] of [["contact", "Customer contact"], ["company", "Company name"], ["phone", "Phone number"],
      ["email", "Email address"], ["company_address", "Company address"], ["shipping_address", "Shipping address"]])
      if (!r[k]) missing.push(label);
    if (r.email && !emailOk(r.email)) missing.push("a valid email address");
    if (!TYPES.includes(r.type)) r.type = "Other";
    for (const k of ["urgent", "flag_receipt", "hot", "auto_return", "loaner"]) if (!YN.includes(r[k])) r[k] = "";
    if (b.type === "Loaner Needed") { r.type = "Other"; r.loaner = "Yes"; }   // old form value
    r.hot = r.urgent === "Yes" ? "Yes" : "No";               // urgent is always a Hot RMA
    if (!r.verified) r.verified = "No (Evertz will assign as necessary)";
    if (r.auto_return !== "Yes") missing.push("acceptance of the evaluation fee / automatic return");
    if (!r.units.length) missing.push("at least one unit");
    r.units.forEach((u, i) => { if (!u.part || !u.serial || !u.problem) missing.push(`part, serial and problem for unit ${i + 1}`); });
    if (missing.length) return json({ error: "Please fill in: " + missing.join(", ") + "." }, 400);

    await env.DB.prepare(
      `INSERT INTO rma_requests (ref, created, status, contact, company, phone, email, cc, type, urgent, flag_receipt,
         verified, hot, auto_return, company_address, shipping_address, units, email_status, loaner, needed_by)
       VALUES (?1, datetime('now'), 'New', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'pending', ?16, ?17)`
    ).bind(r.ref, r.contact, r.company, r.phone, r.email, r.cc, r.type, r.urgent, r.flag_receipt,
      r.verified, r.hot, r.auto_return, r.company_address, r.shipping_address, JSON.stringify(r.units), r.loaner, r.needed_by).run();

    const status = await sendEmail(env, r);
    await env.DB.prepare("UPDATE rma_requests SET email_status = ?1 WHERE ref = ?2").bind(status, r.ref).run();
    return json({ ok: true, ref: r.ref });
}


// ---------- Manuals & release notes (read-only; the team uploads them in the portal) ----------
// Behind an access code: DOCS_CODE is a Worker secret (one code, or several comma-separated).
// Entering a right code sets a 30-day cookie. Changing the secret signs everyone out.
const DOCS_COOKIE = "lm_docs";
function docCodes(env) { return String(env.DOCS_CODE || "").split(",").map((x) => x.trim()).filter(Boolean); }
async function docPass(env) {
  const codes = docCodes(env); if (!codes.length) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(codes.join("|")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("lm-docs-v1"));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}
async function docsUnlocked(request, env) {
  const pass = await docPass(env); if (!pass) return false;
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + DOCS_COOKIE + "=([^;]+)"));
  return !!m && m[1] === pass;
}
async function docsUnlock(request, env) {
  const b = await request.json().catch(() => ({}));
  const code = String(b.code || "").trim();
  const codes = docCodes(env);
  if (!codes.length) return json({ error: "Documents aren't available right now." }, 503);
  if (!code || !codes.includes(code)) { await new Promise((r) => setTimeout(r, 800)); return json({ error: "That code isn't right. Check it and try again." }, 401); }
  return new Response(JSON.stringify({ ok: true }), { headers: {
    "content-type": "application/json", "cache-control": "no-store",
    "set-cookie": `${DOCS_COOKIE}=${await docPass(env)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
  } });
}
function verKey(v) { return String(v || "").split(/[^0-9]+/).filter(Boolean).map((n) => n.padStart(6, "0")).join("."); }
async function publicDocs(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, product, kind, version, title, filename, size, uploaded, notes FROM docs WHERE published = 1"
  ).all().catch(() => ({ results: [] }));
  results.sort((a, b) => verKey(b.version).localeCompare(verKey(a.version)) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  return json({ docs: results });
}
async function docFile(env, id) {
  const row = await env.DB.prepare("SELECT key, filename FROM docs WHERE id = ?1 AND published = 1").bind(id).first();
  if (!row || !env.DOCS) return new Response("Not found", { status: 404 });
  const obj = await env.DOCS.get(row.key);
  if (!obj) return new Response("Not found", { status: 404 });
  const pdf = /\.pdf$/i.test(row.filename);
  return new Response(obj.body, { headers: {
    "content-type": pdf ? "application/pdf" : "application/octet-stream", "content-length": String(obj.size),
    "content-disposition": `${pdf ? "inline" : "attachment"}; filename="${row.filename.replace(/"/g, "")}"`,
    "cache-control": "private, max-age=300",
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // dcsupport.evertz.app: the customer support home page (links to the RMA form and the log upload page)
    if (url.hostname.startsWith("dcsupport.") && (url.pathname === "/" || url.pathname === "/index.html"))
      return env.ASSETS.fetch(new Request(new URL("/support/", url), request));
    if (url.pathname === "/api/docs/unlock" && request.method === "POST") return docsUnlock(request, env);
    if (url.pathname === "/api/docs" && request.method === "GET")
      return (await docsUnlocked(request, env)) ? publicDocs(env) : json({ error: "locked" }, 401);
    const dm = url.pathname.match(/^\/docs\/file\/([a-z0-9]{8,40})$/);
    if (dm && request.method === "GET")
      return (await docsUnlocked(request, env)) ? docFile(env, dm[1]) : Response.redirect(new URL("/docs/", url), 302);
    if (url.pathname === "/docs") return Response.redirect(new URL("/docs/", url), 301);
    if (url.pathname === "/config") return json({ turnstile: env.TURNSTILE_SITE_KEY || null });

    if (url.pathname === "/api/submit" && request.method === "POST") {
      try { return await submit(request, env); }
      catch (e) { return json({ error: "Sorry, the request could not be saved (" + String(e.message || e).slice(0, 160) + "). Please try again or email lmvenuesupport@evertz.com." }, 500); }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
