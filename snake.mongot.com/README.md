Multiplayer snake game made with uWebSockets.js and SvelteKit.

The **High Score** page ranks registered players by completed match wins, with fewer losses as the tie-breaker. Match totals are persisted in `highscores.json` at the application root; the server process needs write access to that directory.

Requires Node.js 24 and pnpm 12.9.1 for the server and client packages.
Install [mkcert](https://github.com/FiloSottile/mkcert#installation) for trusted local HTTPS/WebSocket certificates; the server creates or renews its local certificate when development starts.

Install root tooling with `npm ci`, then install the app packages:

```sh
cd server && pnpm install
cd ../client && pnpm install
```

Start the server and client separately, or run from the repository root to start both:

```sh
npm run dev
```

For local login to be shared with mongot.com, the `cookie` setting in `server/package.json` must match the `COOKIE_SECRET` used by the local mongot.com process. The Snake dev script passes that setting as `COOKIE_SECRET`; when starting the server another way, set the environment variable yourself. The server exits with an error if it is not set.

### Playing with bots

In a waiting room, take a seat to add bots to or remove bots from any open seat. Bots use the seat's color and are ready automatically; in a mixed match, the countdown begins when every human player is ready.

To run a bot-only match, seat at least two bots, have all humans leave their seats, then select **Start bot match**. Any room member can start it. Bot-only matches do not rematch automatically, and a launched countdown or match continues if its watchers leave. Bots remain seated between rounds.

A four-bot lineup cannot be edited directly because only seated humans can remove bots. Create another room if you want a different bot lineup.

### Local game load test

The on-demand load test is restricted to a loopback `/api/room` WebSocket endpoint. Run it from the repository root:

```sh
npm run test:load
```

This starts an isolated development server on an available loopback port, runs a 10-second smoke test (one room, four players), and stops the server afterward.

For the full profile, use a five-minute ramp and 30-minute soak, capped at 10 rooms, 40 seated players, and 100 spectators:

```sh
npm run test:load -- --rooms 10 --spectators 100 --ramp-seconds 300 --soak-seconds 1800
```

The report distinguishes reaching the configured cap from observed server failures; it does not infer saturation from reaching the cap. Never point load tests at production. Use `--output <path>` to save the JSON report and compare baselines from the same representative machine.
