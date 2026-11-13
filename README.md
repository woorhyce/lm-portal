# LM Portal

One login (Cloudflare Access), one database (D1 `lm-db`), one Worker per tool.

```
portal/      -> lmtools.xyz            Tool Library page + /api/tools, /api/me
_template/   -> copy for each tool     <slug>.lmtools.xyz, per-user storage via /api/data/:key
schema.sql   -> run once in D1
```

Replace `lmtools.xyz` with your domain everywhere (wrangler.toml files).

## Setup, in order

1. **Domain.** Cloudflare dashboard > Domain Registration > buy one.
2. **D1.** Storage & Databases > D1 > Create `lm-db`. Open its Console, paste `schema.sql`, run.
   Copy the database ID into every `wrangler.toml` (`database_id`).
3. **Make yourself admin.** In the D1 console, after you've opened the portal once:
   `UPDATE users SET role='admin' WHERE email='you@company.com';`
4. **GitHub repo.** Push this folder to a private repo.
5. **Portal Worker.** Workers & Pages > Create > Import a repository > pick the repo,
   set **Root directory** to `portal`. Every push to main redeploys it.
6. **Cloudflare Access.** Zero Trust > Access > Applications > Add > Self-hosted.
   Add two public hostnames: `lmtools.xyz` and `*.lmtools.xyz`.
   Policy: Allow, Include emails (or an email domain). Login method: One-time PIN.
7. **Each tool.** Copy `_template/` to e.g. `admin/`, set `name`, `TOOL`, and the route
   pattern in its `wrangler.toml`, drop the tool's HTML into `public/index.html`,
   then repeat step 5 with that root directory.

## Moving a tool off localStorage

Add `<script src="/lm-store.js"></script>` and swap:

```js
localStorage.setItem("trips", JSON.stringify(trips))   ->  await LM.save("trips", trips)
JSON.parse(localStorage.getItem("trips") || "[]")      ->  await LM.load("trips", [])
```

`LM.save(key, value, true)` stores one team-shared copy instead of a per-user one.

## LAN-only tools (Monitoring, Health Report)

An HTTPS page can't call `http://10.x` server IPs, so these stay local files.
Put them in `portal/public/local/<slug>.html`; their card shows **Download** instead of **Open**.
Flip any tool with `UPDATE tools SET local_only=1 WHERE slug='games';`.

## Updating a card after a deploy

D1 console: `UPDATE tools SET version='2.3', updated='2026-11-20' WHERE slug='admin';`

## Release notes

Each card has a **Release notes** button. Publishing a release also updates the card's version and date.

D1 console:
```sql
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES
 ('admin', '2.3', '2026-11-20', '- Flight search via SerpApi
- Fixed per diem rounding');
UPDATE tools SET version='2.3', updated='2026-11-20' WHERE slug='admin';
```
Or as an admin, one call: `POST /api/tools/admin/releases` with `{"version":"2.3","notes":"- ...\n- ..."}`.

## No-domain mode (current default)

Everything runs on `*.woorhyce.workers.dev` until you buy a domain:
portal at `lm-portal.woorhyce.workers.dev`, tools at `lm-<slug>.woorhyce.workers.dev`.
Protect each Worker with Access: Worker > Settings > Domains & Routes > workers.dev > enable Cloudflare Access.

Switching to a domain later (data in D1 is untouched):
1. Buy the domain; create one Access app for `domain` + `*.domain`.
2. In every wrangler.toml: `workers_dev = false`, uncomment the routes block, update `TOOL_URL` / `PORTAL_URL`.
3. Push. Remove the old per-Worker workers.dev Access apps.

## Existing tools: zero-change sync

Tools that already use localStorage only need one line, first thing in `<head>`:
`<script src="/lm-sync.js"></script>` (it's in `_template/public/`).
It pulls your saved data from D1 before the tool starts and saves every change back,
so the same data shows up on any computer you log in from. The first time you open a tool
in a browser that already has local data, that data is uploaded.
