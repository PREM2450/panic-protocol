# PANIC PROTOCOL

A real-time cooperative crisis-response game for 2–6 operators. Teams coordinate through six timed city incidents, earning individual points for correct calls and a team bonus when at least half of connected operators choose correctly. The maximum timed run is five minutes: six 45-second decision windows and five six-second result intervals. A round resolves as soon as every connected operator submits, so teams that decide quickly finish sooner.

## Requirements

- Node.js 20 or later
- npm 10 or later

## Local development

```sh
npm install
cp client/.env.example client/.env
cp server/.env.example server/.env
npm run dev
```

The Vite client is at `http://localhost:5173`; the Express and Socket.IO server listens at `http://localhost:3001`. The client connects to the server URL from `VITE_SERVER_URL`. Keep the local value as `http://localhost:3001`. The server's `CLIENT_ORIGIN` may be a comma-separated list of allowed browser origins.

To run either service independently:

```sh
npm run dev -w server
npm run dev -w client
```

Use separate terminals for the independent commands. Do not commit `.env` files; `.env.example` files contain only local defaults.

## Gameplay and networking

- Create a room and share its five-character code with 1–5 other operators.
- The host can start once at least two operators are connected. Other operators can mark themselves ready in the lobby.
- The server owns room membership, host permissions, valid choices, scores, deadlines, and round transitions. Client countdowns are displays derived from the server deadline.
- Each connected operator may submit one response per incident. Responses are locked after submission; all connected operators' responses or the server timer resolve the round.
- The host can replay a finished mission. A disconnected player can reclaim their seat using the browser's saved session token. Rooms with no connected operators are removed after two minutes.

Rooms and reconnect tokens are held in server memory. Deploy one server instance for this version; a process restart clears active games. Durable rooms and horizontal scaling would require a shared store/Socket.IO adapter and are not included.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

The Vitest suite covers room capacity and code validation, host permissions, duplicate submissions, scoring, timer expiry, round progression, and replay.

## Deploy

### Backend — Render

1. Create a Render Web Service from this repository. The included `render.yaml` sets the service root to `server`.
2. Set `CLIENT_ORIGIN` to the exact deployed frontend origin, such as `https://panic-protocol.vercel.app` (no trailing slash). For preview deployments, provide an explicit comma-separated allowlist of the origins you intend to permit.
3. Render installs and builds the server and starts it with `npm start`. The `/health` endpoint is available for service health checks. `PORT` is supplied by Render; `ROUND_SECONDS` defaults to 45.
4. Copy the deployed server URL, for example `https://panic-protocol-server.onrender.com`.

### Frontend — Vercel

1. Import the repository into Vercel. The included `vercel.json` configures the Vite build and SPA fallback.
2. Set the `VITE_SERVER_URL` environment variable to the deployed Render URL. Set it for each Vercel environment that should connect to the backend.
3. Deploy or redeploy after setting the variable. Add the final Vercel origin to the Render `CLIENT_ORIGIN` allowlist.

### Cross-device smoke test

Open the deployed frontend on two separate devices or browser profiles. On the first, create a room and share its code. On the second, join using that code and a different callsign. Verify both lobby rosters update, only the host can start, both clients see the same incident and deadline, submissions lock once, scores/results match, and a host replay begins a new run. This checklist is instructions, not a claim that the hosted services have been deployed or tested.
