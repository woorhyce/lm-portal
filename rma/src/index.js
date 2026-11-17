// lm-rma: public customer RMA form.
//   GET  /            the form (public/index.html)
//   GET  /config      Turnstile site key, if spam protection is on
//   POST /api/submit  validate, save to D1 (rma_requests), email TO_EMAIL
// There is deliberately no endpoint that reads requests back; the portal does that behind Access.
import { EmailMessage } from "cloudflare:email";

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const TYPES = ["Repair", "Replacement", "Warranty Replacement", "Loaner Needed", "Other"];
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

async function sendEmail(env, r) {
  if (!env.EMAIL || !env.FROM_EMAIL) return "not configured";
  const subject = `RMA request ${r.ref}: ${r.company}${r.urgent === "Yes" ? " (URGENT / HOT)" : ""}`;
  const enc = (s) => "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
  const raw = [
    `From: ${enc("Live Media RMA")} <${env.FROM_EMAIL}>`,
    `To: <${env.TO_EMAIL}>`,
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
    await env.EMAIL.send(new EmailMessage(env.FROM_EMAIL, env.TO_EMAIL, raw));
    return "sent";
  } catch (e) {
    return "failed: " + String(e.message || e).slice(0, 200);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/config") return json({ turnstile: env.TURNSTILE_SITE_KEY || null });

    if (url.pathname === "/api/submit" && request.method === "POST") {
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
      for (const k of ["urgent", "flag_receipt", "hot", "auto_return"]) if (!YN.includes(r[k])) r[k] = "";
      r.hot = r.urgent === "Yes" ? "Yes" : "No";               // urgent is always a Hot RMA
      if (!r.verified) r.verified = "No (Evertz will assign as necessary)";
      if (r.auto_return !== "Yes") missing.push("acceptance of the evaluation fee / automatic return");
      if (!r.units.length) missing.push("at least one unit");
      r.units.forEach((u, i) => { if (!u.part || !u.serial || !u.problem) missing.push(`part, serial and problem for unit ${i + 1}`); });
      if (missing.length) return json({ error: "Please fill in: " + missing.join(", ") + "." }, 400);

      await env.DB.prepare(
        `INSERT INTO rma_requests (ref, created, status, contact, company, phone, email, cc, type, urgent, flag_receipt,
           verified, hot, auto_return, company_address, shipping_address, units, email_status)
         VALUES (?1, datetime('now'), 'New', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'pending')`
      ).bind(r.ref, r.contact, r.company, r.phone, r.email, r.cc, r.type, r.urgent, r.flag_receipt,
        r.verified, r.hot, r.auto_return, r.company_address, r.shipping_address, JSON.stringify(r.units)).run();

      const status = await sendEmail(env, r);
      await env.DB.prepare("UPDATE rma_requests SET email_status = ?1 WHERE ref = ?2").bind(status, r.ref).run();
      return json({ ok: true, ref: r.ref });
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
