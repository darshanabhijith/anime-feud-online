# ⚔️ Anime Feud — Otaku Showdown (Multiplayer)

A playable, customizable, real-time **hybrid Family Feud–style web app** for anime clubs. One laptop hosts; competing team players buzz on phones; the audience votes in polls and earns team bonus points; a separate projector page displays the board. 25 starter rounds are included. Survey rankings are *illustrative*, not survey research.

## Requirements
- Node.js **20+** and npm
- Internet or LAN connection between devices for multiplayer

## Run locally

```bash
npm install
npm start
```

Visit **http://localhost:3000**. Create a room. Use the displayed PIN, or copy the audience, team or projector links. On other devices, replace `localhost` with the host computer's LAN IP address, and allow port 3000 through your firewall, e.g. `http://192.168.1.20:3000`. A locally hosted server is reachable by club members only when their devices can access your computer over the same network. Some campus Wi-Fi networks block this; public hosting avoids that issue.

## Publish online

This project requires a **persistent Node.js server that supports WebSockets**, not a static HTML host or Vercel static upload. Push the project to a GitHub repository, then deploy as a Node Web Service on a provider such as Render, Railway, or a VPS. Typical settings:

- Build command: `npm install`
- Start command: `npm start`
- Node runtime: Node 20+
- Health check: `/health`

Your provider will assign an HTTPS URL. Open that URL to create the room and share links with phone users. Start with **one running server instance**; the in-memory Socket.IO rooms are not shared across multiple instances. Configure a persistent disk and `DATA_DIR` for reliable room/question recovery across restarts. On hosts with ephemeral storage, rooms and custom questions may disappear after redeploy/restart. Check current provider plan conditions and sleep limits before your event.

## Who does what

| View | Privileges |
|---|---|
| Host | Reveal/hide answers; strikes; round navigation; scoreboard; timer; reset; edit packs; poll/bonus controls |
| Team player | Join the selected team; send the first live buzz while a round is open |
| Audience | Vote in polls; send one answer to each bonus challenge; earned bonus points are added to the supported team |
| Projector | Watch-only, fullscreen, no host controls |

### Rules

- First team buzzer arriving at the server wins until the host clears it.
- Host reveals answers by tapping their numbered board row, adds strikes, and uses **Award bank** when a round ends (including steals).
- The host can award to either team; set *double/triple points* before revealing answers, not mid-round.
- Audience polls show aggregate results; each currently connected socket has one editable poll vote.
- Audience bonus answers are locked on first submission. Close the challenge before selecting **Award bonus points**. Correct answers earn the specified number of points for the team the audience member supported when joining.
- Results are not authoritative real survey rankings; edit them or survey your club first.

## Customizing questions

Use the host **Question editor** (JSON) and **Save questions**. A question format:

```json
{"question":"Name a famous anime swordfighter","answers":[{"text":"Zoro","points":40},{"text":"Tanjiro","points":30},{"text":"Ichigo","points":20},{"text":"Kirito","points":10}]}
```

1–150 questions per pack, 2–8 answers per question, nonnegative integer points up to 1,000 per answer. The editor exports JSON and can be used to import a pack by pasting JSON.

## Helpful controls

- Use host's **Fullscreen** for a game-board view or open the dedicated projector link on a separate display/browser.
- For a projector-plus-host setup: open the host page on the host laptop, and display the projector link in a separate browser window or projector computer. If mirroring the same display, host controls will be visible unless you use a second screen/extended desktop.
- Private host URLs contain a secret key. Do not post them publicly; publish only audience/team/projector URLs.

## Limitations / event readiness

This is a working MVP, not a hardened public tournament service. Rooms use a 6-digit PIN; the host key is in a private URL. The host key is sufficient for admin access, so safeguard it. No persistent individual identity: disconnecting and reconnecting may allow resubmission of votes or bonus answers and transient participation is erased. Host role restores from its secret link after refresh. Server file storage is simple and intended for **single-instance use**; use a database and Socket.IO Redis adapter for larger events/multiple server replicas. No built-in moderation, login system, automatic matchmaking, or public room directory. Poll votes and question pack edits are stored in room JSON. Don't use it to collect sensitive personal data. The server enforces host authorization for actions; do not rely on client-only access checks.

## Files
- `server.js`: authoritative game engine, WebSockets, persistence, room/role logic
- `public/index.html`: game and host interface
- `public/style.css`: responsive neon theme
- `public/app.js`: client real-time events/UI
- `data/questions.json`: starter question pack
- `.env.example`: environment configuration reference
