# LM Commissioning

Builds the `.efp` installers that commission DreamCatcher servers: base server config, Matrox 2110 node config, routes, operational settings, patches and an SSH mesh. Everything is set up once per project, then each server gets its own `.efp`.

## Start a project

**New project** asks for:

- **Customer**, number of **servers**, **hostname prefix** and **start #** (servers are named from these)
- **Hardware**: every type in this project (LM-CORE, LM-COREF, LM-COREQ, DC-CORE-PLUS)
- **Commissioning**: Baseband SDI or 2110 IP
- **Video standard**: 720p, 1080i, 1080p 3G or UHD 12G
- **Network ports in use**, and whether ENET-3 / ENET-4 run as a point-to-point ring (4 servers or fewer)
- For 2110: the **Matrox card** (25G one lane, or 50G two lanes) and **Red only** or **Red / Blue**

The project saves as you work. **Export Project (.json)** to keep a copy or hand it to someone else; **Import Project** to open one.

## Server Commissioning

1. **Network Settings**: one row per server. Typing in the first row counts down the column. **Download .xlsx** or **Copy table** to share the IP plan.
2. **System Configuration**: I/O configuration, `features.conf` flags, timezone, services (firewall off, mask timemaster on SDI systems), SMB users, `render_delay.json`, export formats and Operational Settings. On SDI servers, **Lock and limit I/O** caps max inputs/outputs to each server's counts.
3. **Layouts and Images**: pick the Vue layouts to copy to `/etc/vue/layouts/`, and drop in any custom layouts or images.
4. **Generate EFP**: one `.efp` per server.

## Matrox Commissioning (2110)

1. **Matrox Configuration**: NMOS registry, server connections, node state. **Automatic** mode finds the node's `A######.json` on the server and edits only these fields; certificates, senders and receivers are left alone and a backup is made first. Or upload the file yourself.
2. **Streams & Connectors**: inputs, outputs and **audio streams per video** (you must pick this before downloading). Set how multicast is spread across SFP ports A/B and C/D, then fill addresses: enumerate from a start address, paste a list, import a customer spreadsheet, or carry addresses over from an existing `dc_routes.json`.
3. **DC routes file**: optionally deploy a `dc-routes.json` as-is.
4. **Generate EFP**: one combined installer per server for persistence, Matrox node config and routes. Each file is backed up before it's replaced, and each part reports success or failure separately.

## Package & Deploy

**Generate deployment package** zips every server's installers together.

## Standalone tools (no project needed)

- **Operational Settings**: start from Brandon's confirmed baseline, untick anything you don't want touched, build an `.efp`.
- **Patch**: drop in a `.deb`; you get an `.efp` that copies it to the server, runs `dpkg -i` and confirms the version installed. Dependencies must already be on the server.
- **SSH Mesh**: lets every server `ssh` / `scp` to every other with no password, using its own dedicated key. **Run once** on one server (uses the shared etdev password to set up the rest) or **run on each server** (no password involved).

**Commissioning Check** and **Checklists** are coming soon.

## Things to know

- Projects now sync through the Tool Library, so they're on any computer you log in from. That includes SMB and SSH passwords saved in a project.
- **Preview EFP** shows exactly what will run on the server before you download.
