# LM Games

The **LM Games** tool for the Live Media portal: a menu of DreamCatcher training games, each with a synced personal best and a team top-three leaderboard.

| Game | File | Score key |
|---|---|---|
| Replay Op (RED/BLUE outputs in VUE + RCP-10) | `public/replay-op.html` | `rop-hi` |
| DreamCatcher Replay Academy | `public/academy.html` | `dcra-hi` |
| Input Breaker | `public/input-breaker.html` | `ib-hi` |
| Million Frame Replay | `public/million-frame-replay.html` | `mfr-best` |
| Venues On Call | `public/venues-on-call.html` | `vt-hi` |

## Layout

```
wrangler.toml          Worker config: name lm-games, D1 lm-db, TOOL = "games"
src/index.js           Worker: login/session check, /api/me, saved-data sync, /api/leaderboard?key=
public/index.html      The LM Games menu (Tool Library style)
public/*.html          The games
public/lm-sync.js      Syncs each game's localStorage scores to D1 per user
public/lm-games-nav.js "LM Games" back button on every game page
public/lm-ui.css/.js   Shared Live Media banner and light/dark switch
docs/games-guide.md    Portal guide; copy to lm-portal/portal/public/guides/games.md
updates/*.sql          D1 updates for the Tool Library card
```

## Deploy (Cloudflare Workers Builds)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → **lm-games** → Settings → Build.
3. Connect this repo. Root directory: leave blank. Build command: none. Deploy command: `npx wrangler deploy`.
4. Run `updates/2026-11-15-games.sql` once in the D1 console for `lm-db`.

## Adding a game

1. Put the HTML in `public/` and add these two lines right after `<meta charset="utf-8">`:
   ```html
   <script src="/lm-sync.js"></script>
   <script src="/lm-games-nav.js"></script>
   ```
2. Save the best score in `localStorage` under a short key.
3. Add the key to `GAME_KEYS` in `src/index.js` and a card to `GAMES` in `public/index.html`.
