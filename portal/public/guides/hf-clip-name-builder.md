# HF Clip Name Builder

Set up how Highlight Factory names clips on a DreamCatcher, then build an .efp package that applies those clip name keys to the templates or sessions you choose. Your work saves to your portal account automatically, so you can pick it up on any computer.

## Before you start

- Know the league and the home and away teams for the game or venue.
- Know the exact names of the DreamCatcher templates or sessions you want to update, or have SSH access to the CM so the package can list them for you.
- Optional: to start from an existing template, have the output of `/opt/dreamcatcher/bin/dcrcp get_sessions` from the server ready to paste.
- Optional: a roster to paste (one player per line, like `29 Nathan MacKinnon`, or a CSV with a `Number,Name` header) if the built-in NBA, NHL or NFL rosters don't cover your teams.

## Steps

1. **Setup:** choose the league, then the home and away teams. The home team names the package.
2. To copy keys from a template already on a server, open **Start from a template already on a server**, paste the `get_sessions` output and select **Read templates**.
3. **Clip name keys:** click keys (Period, Event Type, Shooter, and so on) to add them. Drag tiles to change the order, and click a tile to set its prefix, case and word substitutions.
4. To replace player names with numbers, open a player key's tile, load a team or paste a roster, check the number format, then select **Add**.
5. Pick a **Separator**. Check the **Example clip name** bar at the top until it looks right.
6. **Build .efp:** leave **Dry run** on for the first install. Either tick **Ask on the server which templates or sessions to update**, or untick it and list the exact template names, one per line.
7. Select **Build** at the top, then **Download** the .efp, or select **Copy CM command** and paste it into your SSH session on the CM.
8. Install it, read the **WOULD UPDATE** lines, then turn **Dry run** off, rebuild and install again. Check the **OK** lines. A backup is saved first.

## Tips

- **New** clears the current clip names. Click it twice to confirm.
- Your clip names save automatically a second after each change; the time shows next to the Build button.
- Use the light/dark switch in the Live Media banner; it follows you across portal tools.
- Template names must match the server exactly, including capitals and spaces.
- Live game sessions can be updated too when you let the package ask on the server.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Build says to choose the home team first | Pick a home team in **Setup**; the package is named after it. |
| Build button stays disabled | Add at least one template or session name, or tick **Ask on the server**. |
| "No templates found" after pasting | Paste the full `get_sessions` output, starting from the line with `[`. |
| Roster lines are skipped | Each line needs a number and a first and last name, e.g. `8 Cale Makar`. |
| The download is blocked | Use **Copy CM command** and paste it into your SSH session instead. |
| The .efp lists sessions but changes nothing | It can only ask which session to update in a terminal. Run it over SSH, or untick **Ask on the server** and list the names. |
| Nothing changed on the server | Dry run was on. Turn it off, rebuild and install again. |
| My clip names are missing on another computer | Make sure you're signed in with the same email, then reload the page. |
