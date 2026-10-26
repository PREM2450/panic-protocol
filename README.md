# PANIC PROTOCOL — Cyber City Survival

A browser-based, real-time cooperative survival game for 2–6 players. Move through three escalating cyber-city sectors, collect energy cells, activate terminals, rescue teammates, avoid hazards and hostile drones, then extract together before the three-minute lockdown ends.

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

The client runs at `http://localhost:5173`; the Express and Socket.IO server listens at `http://localhost:3001`. The client reads the backend URL from `VITE_SERVER_URL`. The backend's `CLIENT_ORIGIN` accepts a comma-separated origin allowlist.

Run services independently when needed:

```sh
npm run dev -w server
npm run dev -w client
```

Do not commit `.env` files. The checked-in `.env.example` files contain local development values only.

## Room flow

Create or join a room from the landing page with a callsign. The host shares the room code from the lobby, where the roster updates as players connect. The host chooses an unlocked map and starts after at least two players are connected; all room members then enter the same server-controlled arena. Room creation never starts a mission automatically.

## Controls and objectives

- **Move:** WASD or arrow keys. On touch screens, use the on-screen directional pad.
- **Collect:** walk over cyan energy cells to add them to the shared team supply.
- **Activate:** stand near an orange terminal and select **Interact / Rescue**. Each terminal uses two energy cells.
- **Rescue:** interact near a downed teammate who still has lives remaining to revive them with partial health.
- **Extract:** once all terminals in the level are active, every connected operator must reach the marked extraction point and interact to complete the level.
- **Survive:** avoid orange electrical hazards and red enemy drones. A player's health loss consumes a life and downs them; if everyone is down, the mission fails.
- **Win/lose:** complete the selected level and extract before the 180-second shared timer expires. Completing a level unlocks the next level for that room. The host can replay a level or proceed to the next unlocked level from the results screen.

Room codes, player positions, enemy movement, pickups, damage, objective progress, scores, and outcomes are controlled by the server. Clients send directional input and interaction requests; they do not calculate positions, collisions, timers, or score.

All three lobby cards launch playable missions built on the same authoritative movement, collision, pickup, terminal, health, and extraction systems, with different map and difficulty configurations:

- **Power Outage (Easy):** a three-minute introductory city map with two power terminals and limited hazards.
- **Drone Invasion (Medium):** a tighter maze with three relays, active drone detection/pursuit, and a 2:45 lockdown.
- **Final Extraction (Hard):** an industrial reactor layout with four relays, patrolling hazards, stronger drones, a 2:30 lockdown, and a 12-second team extraction hold. Leaving the extraction zone resets that final hold.

In the lobby, the host selects the map for the team; the server synchronizes the selection and enforces which levels have been unlocked. Completing a level unlocks the next one for that room. The game sends only movement and interaction intent from clients; collision, enemy movement, damage, objective progress, timer expiry, extraction, and progression remain server-authoritative.

## Room and server limitations

Rooms support up to six players. A disconnected player can reclaim their in-progress seat with the session token stored in that browser. A disconnected host is replaced by a connected teammate. Empty rooms are cleaned up after two minutes.

Room state and reconnect tokens are held in process memory. Run exactly **one backend instance**: separate Render instances cannot see each other's rooms, and a restart clears rooms. Confirm a single instance in the Render dashboard. Durable rooms and horizontal scaling would require shared storage and a Socket.IO adapter, which are not included.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

The server tests cover room capacity and validation, repeated room creation/joining after abandoned rooms, room isolation across server instances, host-only start and level selection, authoritative movement and wall collision, energy collection, terminal costs and scoring, level completion/unlocking/continuation, countdown defeat, reconnect, and replay.

## Deploy

### Backend — Render

1. Create a Render Web Service from this repository using [`render.yaml`](./render.yaml). Its build and start commands run the server workspace from the repository root.
2. Set `CLIENT_ORIGIN` to the exact Vercel origin, for example `https://panic-protocol.vercel.app` (no trailing slash). Add explicitly approved preview origins as a comma-separated allowlist if needed.
3. Confirm the service has one instance in the Render dashboard. Render supplies `PORT`; `/health` is the health-check endpoint.
4. Copy the deployed backend URL.

### Frontend — Vercel

1. Import the repository into Vercel. [`vercel.json`](./vercel.json) configures the Vite build and SPA fallback.
2. Set `VITE_SERVER_URL` to the deployed Render URL in each Vercel environment that should connect to the backend.
3. Deploy the frontend and allowlist its origin in the Render `CLIENT_ORIGIN` value. Redeploy the backend if the allowlist changes.

### Two-device smoke test

Open the deployed frontend on two devices or separate browser profiles. Create a room on one, join its five-character code on the other, select a level and start from the host. Verify both clients see the same selected map, characters moving in real time, energy totals and pickups, terminal activations and scores, connected players converging at extraction, level unlock/progression, and reconnect/replay behavior. These are test instructions, not a claim that the live deployment has been tested.
