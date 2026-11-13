# LM Health Report

A read-only health check for a whole DreamCatcher cluster. You install it on one server, it checks that server and every other DreamCatcher it can find, and it writes one combined report. **Nothing is changed on any server.**

## Which build do I need?

| Build | Use it on |
|---|---|
| **Live Media** | Current Live Media DreamCatchers (personas, systemd) |
| **Trusty** | Legacy pre-Live Media DreamCatchers (1.x software, Ubuntu 14.04) |

The two builds run the same checks. The Trusty build only differs in how the stored password is unlocked, because the older OpenSSL on 14.04 can't use the newer method.

## Running it

1. Download the right build from the Tool Library card.
2. Install the `.efp` on the Content Manager, or on any one server in the cluster.
3. Wait for it to finish. The LLDP/CDP neighbour check listens for about a minute per port, alongside the other checks.
4. Collect the reports from `/clips/clips`.

You get two reports:

- **Engineering report**: every check with PASS, WARN, FAIL or INFO, plus the raw command output as an appendix.
- **Customer report**: the cleaned-up version to hand to the site.

## How it finds servers

By default it reads the remotes and network groups in `dreamcatcher.ini`. If it finds none, it scans the server's own /24 subnets and treats anything answering on port 5001 as a DreamCatcher. It also checks the RCPs used by the Vue seats.

## What it checks

- System identity, CPU, memory and DIMMs
- I/O config from `dreamcatcher.ini`, including HFR inputs
- DreamCatcher services against a known-good baseline for the server's role
- Network: bonds, link error rates, web GUI, LLDP/CDP neighbours
- Matrox card and PTP (in-band and out-of-band), Karak SDI cards
- Storage, root filesystem space, drive health, NAS write test
- GPU, displays and Vue seats

## Troubleshooting

| Message | Fix |
|---|---|
| *No health-check key found* | This is a split build. Install the matching `dc_health_key.efp` first, then this one. |
| *Could not unlock the password* | The key and the EFP came from different builds. Each build makes a new pair; use the two that were built together. |
