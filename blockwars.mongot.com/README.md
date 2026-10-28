# Blockwars development and asset builds

## Shared runtime layout

Blockwars is run from its own application directory. Keep the existing shared
package installation at the repository root: Express, sessions, Mongoose, Pug
and account middleware/models resolve from that parent layout. Blockwars' own
dependencies and build tooling remain in this directory's `node_modules`.

The root manifest currently uses Mongoose 6, which supports the database
callbacks used by Blockwars. Do not upgrade shared dependencies independently
of the other applications that consume them. Blockwars uses the shared
Express installation's built-in JSON and extended URL-encoded parsers; it
does not import the transitive `body-parser` package directly.

Logged-in lobby requests wait for the visit/IP record to save. Database and
chat-log file failures are forwarded to the existing HTTP error handler rather
than rendering successful pages. Guest lobby visits do not require a user save.

Babel core is declared explicitly in Blockwars' development dependencies,
alongside its preset and Gulp integration. This does not move shared runtime
packages into Blockwars.

Production uses externally managed PM2 scripts and the same parent-package
layout. This build does not move packages, restart PM2, or provision a server.

### Chat data

Game and lobby chat default to `gameChat.json` and `blockwarChat.json` in the
Blockwars application directory, independent of the working directory. All
chat reads, writes and admin chat-log operations use those same paths.
Optionally set `CHAT_DATA_DIR` before starting the server to use a different
directory (prefer an absolute path). That directory must already contain both
files with valid JSON arrays; the server does not create missing files or
silently replace invalid data.

## Lobby arrival notifications

The bell opts this browser into Web Push, not just notifications from an open
Lobby tab. Clicking it changes only the notification setting; setup errors appear
below the control, while browser/device limitations are opened separately.
The labeled bell shows an explicit On/Off state, and reloading checks the saved
setting with visible checking/error feedback. The separate "How it works & limits"
disclosure and its "Close explanation" button open or close the help without
changing the notification setting. Closing returns keyboard focus to the disclosure.
On mobile, the introduction and alerts cards follow the chat and user list.
On desktop, the user list shares the sidebar cards' width and sits below alerts
with a small gap.
Subscriptions are stored in the shared `BwNotification` collection, including
for Guests; toggling off deactivates the saved subscription on the server.
Reloading checks the saved server state rather than treating browser permission
alone as an opt-in. Registered accounts are not notified about their own
arrivals; Guests may receive an alert about their own later visits.

Configure these environment variables on the Blockwars server:

- `VAPID_SUBJECT`: a contact URI, for example `mailto:admin@example.com`.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: a newly generated VAPID key pair.
- `DOMAIN`: the exact public origin, including scheme and any port, matching
  the Lobby WebSocket origin. Defaults to the application configuration.

Generate a key pair locally with `npx web-push generate-vapid-keys`. Keep the
private key in the deployment secret store, never in source control. The old
hard-coded private key must be considered compromised and must not be reused.
Keep the new keys stable across server restarts; rotating them requires browsers
to enable the bell again. No credentials have been provisioned by this change.
Without any VAPID configuration, the bell reports that off-site notifications
are unavailable; partial or invalid configuration fails startup explicitly.

The server sends push from the Lobby's first WebSocket initialization, with no
recipient tab or connection required. Repeat initialization and concurrent tabs
for the same account do not send extra arrivals. Delivery is throttled per
subscription to one alert per minute per server process, with a 60-second TTL
and a shared notification tag. Expired subscriptions (HTTP 404/410) are
deactivated; other delivery failures are logged. Multiple independent server
processes do not share the throttle.

Deploy the application entry point, `serviceworker.js`, game server changes,
templates, browser assets (including `public/manifest.webmanifest`), and updated
package installation together. The
application serves the browser worker at `/service-worker.js` with root scope;
do not redirect or cache that route indefinitely at the reverse proxy. The
legacy `/send-pw` and `/subscribe` routes are no longer used.

HTTPS (or localhost for development) is required. iPhone/iPad requires iOS/iPadOS
16.4+ and a Home Screen installation; the Lobby links a standalone web-app
manifest for that installation. A fully quit browser, OS power saving,
offline devices and notification settings can prevent delivery. Test actual
delivery on an HTTPS deployment: enable the bell, close all Blockwars tabs,
have a different user enter the Lobby, and confirm the alert opens the Lobby.
Automated tests cover subscription persistence/opt-out, server-triggered sends
without recipient connections, worker event lifetimes/clicks, and real browser
worker scope/UI, but do not contact external browser push services.

## Local validation

- `npm test`: unit and template tests.
- `npm run test:e2e`: Chromium desktop and emulated phone tests using in-memory
  account models.
- `npm run build`: stage the production asset tasks into local `build/`.
- `npm run test:build`: stage assets and verify template/CSS asset references,
  source-script coverage, JavaScript syntax, bundle source ordering and
  exclusion of deployment configuration and mutable data, then smoke-test
  staged browser assets against the existing test server.

Playwright's server launcher creates fresh empty chat files in a temporary
directory for each test-server run, overriding any inherited `CHAT_DATA_DIR`.
Tests share that temporary data within the run; they do not write to the
application's chat files. The launcher removes its directory on normal exit,
startup failure, SIGINT or SIGTERM, but cannot clean up after SIGKILL.
Regression checks verify chat-path selection, launcher cleanup and unchanged
application chat files after sending actual game and lobby messages.

The CSS check requires every local stylesheet asset URL to resolve, with no
missing-file exceptions. Unused account-form sprite rules were removed:
registration and login are owned by the parent portal, not Blockwars.
Font Awesome references only the bundled WOFF2 and WOFF files, rather than
missing EOT/TTF/SVG fallbacks. Browser checks verify navigation icons load with
WOFF2 and with WOFF when WOFF2 is blocked; this does not establish support for
obsolete browsers that require the removed formats.

Browser smoke tests use real HTTP documents and WebSocket connections while
serving scripts, styles and resources from staging. The output checks verify
that staged templates are identical to the source templates served by that
test server. This is not a test of the actual PM2 or production database setup.

No production path is written by `npm run build` or `npm run test:build`.
Build tooling uses Gulp 5 and Node's `node:stream/promises` pipelines, rather
than nested legacy stream mergers. Use Node 24 LTS as the validated baseline.
The production server is planned to move to Node 24 or newer; that upgrade
has not been performed or verified by this work. Full validation ran locally
on Node 24. Node 22 testing was explicitly excluded by the owner; newer Node
major versions should be validated before adoption.
Images, fonts, vendor resources and sounds are read with binary encoding
preserved. Tests compare copied fonts, vendor resources and sounds byte for byte.
The former `fs.Stats` warning no longer occurs during the verified build,
including with `NODE_OPTIONS=--throw-deprecation`; legacy transitive packages
can still exist elsewhere in the toolchain.
The ignored `build/` directory is an asset staging tree, not a standalone
application or a clean/deleting deployment. Tasks overwrite matching files but
do not remove stale files from previous builds.

The image task uses `gulp-imagemin` 9 with explicitly declared GIF, JPEG, PNG
and SVG plugins. Missing plugins or optimizer failures reject the build.
The ESM optimizer is loaded dynamically; the Gulp file remains CommonJS.
Optimization retains the existing plugin behavior: PNG metadata can be stripped
and JPEG compression is lossy. Browser checks verify image dimensions and
PNG/GIF first-frame pixels with color-space conversion disabled, not identical
color-profile rendering, JPEG pixels, or animated GIF timing/all frames.
Some deprecated transitive dependencies remain in these plugins. The owner
chose to retain the verified optimizer stack rather than replace it solely to
remove deprecation notices; see the audit for dependency chains. The build
contract test's VM module loader emits an experimental warning on Node 24;
the normal build does not use that VM API.

## Existing production tasks

`npm run gulp` still writes to
`../../mongot_prod/blockwars.mongot.com`, relative to this directory.
**This is a deployment operation, not a local validation command.**
The individual `gulp js`, `css`, `views`, `img` and `fonts` tasks retain their
production destinations; `gulp assets` copies runtime resources and sounds.
`gulp jsDev` still creates bundles under `public/js/dist`.

Both production and local staging use the same task implementations. Output
includes:

- Legacy game/lobby bundles and compiled settings/service-worker scripts.
- Individual browser scripts loaded by the current templates.
- Game server code, including the shared Special rules.
- Templates, CSS, images, fonts and licenses, vendor resources and sounds.

Game/lobby bundle source ordering matches the active template ordering.
Templates still load individual game/lobby scripts; this change does not
silently switch the live application to bundles.

The output deliberately excludes `app.js`, routes, package installations,
configuration/secrets, account models/middleware and chat data. Those remain
owned by the existing server deployment process. Deploy route/entry-point
changes through that process; copying assets alone does not deploy them.

See the [legacy-code audit](docs/legacy-code-audit.md) for completed
modernization batches and remaining deployment uncertainties.
