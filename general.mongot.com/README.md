# General Testing

Run these commands from `general.mongot.com`:

```sh
npm install
npx playwright install chromium
npm test
npm run test:coverage
npm run test:e2e
npm run test:all
brew services start mongodb-community # start mongodb
COOKIE_SECRET=hello node app.js # start app
```

`npm test` runs deterministic map, rating, and game-state tests with Node's built-in test runner. `npm run test:e2e` starts an isolated app on port 5182 and checks the lobby, map setup, and mobile layout in Chromium. Test mode skips MongoDB, so the browser suite does not read or write account data.

## Lobby arrival notifications

The bell opts this browser into Web Push, not just notifications from an open
Lobby tab. The setting is saved per browser/device in the shared
`BwNotification` collection, so alerts can arrive with no General tab open.
Subscriptions are tagged with the app name; General and Blockwars therefore
never send each other's alerts even though they share the collection. Sharing a
VAPID key pair between the two sites is allowed, but each origin still needs its
own browser subscription.
Toggling the bell off deactivates the saved subscription on the server, and
reloading checks the saved state rather than trusting browser permission alone.
Registered accounts are not notified about their own arrivals.

Configure these variables on the General server:

- `VAPID_SUBJECT`: a contact URI, for example `mailto:admin@example.com`.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: a stable VAPID key pair.
- `DOMAIN`: the exact public origin, including scheme and any port. The server
  also accepts a request whose `Origin` matches the `Host` it was sent to, so a
  stale value does not break the bell behind a correctly configured proxy.

`npm run dev` wires the values from `package.json` into the process. Production
should set the same names in its environment/secret store instead. Keep the key
pair stable: rotating it makes browsers enable the bell again. Without any VAPID
configuration the bell reports that off-site notifications are unavailable;
partial configuration fails startup explicitly.

The server sends the push when a lobby connection announces the arrival, so no
recipient tab or socket is required. Repeat connections from other tabs of the
same account do not send extra alerts. Delivery is throttled per subscription
to one alert per minute per server process with a 60-second TTL; expired push
subscriptions (HTTP 404/410) are deactivated and other delivery failures are
logged.

The browser worker is served at `/service-worker.js` with root scope; serve it
without long-lived caching. HTTPS (or localhost for development) is required.
On iPhone/iPad, the Lobby's web-app manifest lets users add General to the Home
Screen, where iOS 16.4+ can receive push. Quitting the browser, power saving,
offline mode, Do Not Disturb, or blocked site permission can prevent delivery.

When deploying, include `app.js`, `sockets.js`, `serviceworker.js`,
`public/js/notifications.js`, `public/js/service-worker.js`, `views/lobby.pug`,
`public/css/lobby.css`, and `public/manifest.webmanifest`. The old `/send-pw`
and `/subscribe` routes are no longer used.

Before deploying, remember:

Run production with NODE_ENV=production.
Copy reserved-names.js and models.js to the root of mongot_prod.