# Blockwars legacy-code audit

Date: 2026-10-27

This document records the original read-only audit. The implementation status sections below record subsequently approved changes; original inventory counts and findings are baseline observations.

## Final regression checkpoint

After the route cleanup, CSS asset fixes and optimizer-retention decision:

- `npm test`: **134 passed**, zero failures or skips.
- `npm run test:e2e`: **179 passed, 9 skipped**, zero failures across the
  configured desktop and phone projects, including both font-format checks.
- Latest `npm run test:build`: **6 asset/stream checks and 5 browser checks
  passed**, with no missing CSS asset exceptions.
- Staged and unstaged whitespace checks passed. Neither application chat
  file differs from Git HEAD after the browser run.

Validation used local Node 24.18.0. No production deployment, PM2 restart,
server runtime upgrade or commit was performed. The retained transitive
deprecations, intentional classic-script globals and keyboard compatibility
fallbacks are not claimed removed; real production database and deployment
verification remain outside this local regression checkpoint.

## Follow-up decision: retain the verified image optimizer stack

The owner chose to retain the current optimizer stack after reviewing its
remaining transitive deprecations. `npm explain stable uuid glob inflight
rimraf` traced the five deprecated packages as follows:

- `stable`: SVGO 2 through `imagemin-svgo` 10.
- `uuid` 3: `tempfile` 2 through the GIF/JPEG/PNG binary build tooling and the
  PNG plugin's `exec-buffer`.
- `rimraf` 2, `glob` 7 and `inflight`: `exec-buffer` through the PNG plugin.

`npm outdated` found no newer direct GIF/JPEG/PNG optimizer or Gulp image
wrapper releases. `imagemin-svgo` 12 uses SVGO 4 and requires Node 20+, but
`gulp-imagemin` 9.2.0 still declares the old SVG plugin as an optional
dependency. A direct SVG upgrade alone would therefore retain the old chain
alongside the new plugin, rather than eliminate the deprecation.

No dependency overrides, optimizer replacements or package changes were made.
Deprecation notices alone are not a vulnerability assessment. Replacing the
optimizer stack is deferred; the verified image-format/output behavior is
preserved. The unrelated Babel major upgrade reported by `npm outdated` was
not included in this investigation.

## Implementation status: missing CSS asset references

Resolved the four formerly allowlisted CSS source gaps without adding or
copying assets from other applications:

- Removed the unused account-form sprite selectors from
  [style.css](../public/css/style.css). No Blockwars template or browser script
  uses those form IDs; account forms belong to the parent portal.
- Removed only the missing EOT/TTF/SVG font sources from
  [font-awesome.min.css](../public/resources/font-awesome.min.css), retaining
  its license header, bundled WOFF2/WOFF sources and all other vendor rules.
  The existing game stylesheet already uses only WOFF2/WOFF.
- Replaced the build test's four-file exception list with an assertion that
  every local CSS asset URL resolves. The tightened test failed with all four
  missing paths before the fix and passed afterward.

Verification:

- `npm run test:build`: **6 asset/stream checks and 5 browser checks passed**.
- New browser checks verify the navigation icon's font loads and its expected
  glyph/style is selected using WOFF2, then WOFF with WOFF2 deliberately
  blocked. They verify the corresponding font response is successful.
- Compared the vendor stylesheet against its original version with the
  `@font-face` rule excluded: all remaining content is unchanged.

Earlier CSS-gap notes below are historical and superseded by this batch.
No new font formats, old-browser support guarantees, dependency upgrades or
production deployments were introduced.

## Implementation status: route-module legacy cleanup

Changed the four never-reassigned dependency/router bindings in
[routes/main.js](../routes/main.js) from `let` to `const`. Removed its unused,
unexported `requireLogin` function and commented-out lobby activation/login
messages. No route used that function; removing it does not add or remove
authentication. Public pages, guest lobby/game access, admin checks, ban
checks and the shared Mongoose 6 callback API remain unchanged.

Verification:

- `node --test test/routes.test.js`: **29 passed**, including a new public-page
  registration/rendering regression check and existing admin/error-path tests.
- `npm run test:e2e -- e2e/lobby.spec.js e2e/game.spec.js`: **8 passed**, covering
  guest and authenticated lobby/game flows.

## Implementation status: isolated browser-test chat data

Centralized chat paths in [game/chat-files.js](../game/chat-files.js). Server
chat loads/writes and admin chat-log reads/erases now use the same paths.
Defaults remain the application-root JSON files when launched from the normal
application directory; launching elsewhere no longer splits initial reads and
subsequent writes across different directories. Optional `CHAT_DATA_DIR`
selects another directory. Both JSON array files must exist; missing/invalid
data still fails explicitly. Lobby persistence failures are now logged rather
than ignored.

[start-server.js](../tests/fixtures/start-server.js) creates fresh empty chat files in
a temporary directory before loading the test models and application. It
overrides inherited chat-directory configuration and removes its directory on
normal exit, startup failure, SIGINT or SIGTERM (not SIGKILL). Data is shared
within a test-server run, not reset between individual tests.

Verification after the tooling and isolation changes, locally on Node 24:

- `npm test`: **133 passed**, zero failures or skips.
- `npm run test:e2e`: **177 passed, 9 skipped**, zero failures across the
  configured desktop and phone projects, including staged assets.
- Captured both application chat files before the full browser run and
  asserted byte-for-byte equality afterward: passed. Chat-send browser tests
  also assert unchanged files, without restoring/masking writes.
- `npm run test:build`: **6 asset/stream checks and 3 browser smoke/image
  checks passed**.
- Launcher regression tests cover normal-exit and startup-failure cleanup,
  overridden inherited configuration, and application-file preservation.

Production was reported to use Node 22+. The user subsequently chose to
upgrade the server to Node 24 or newer and explicitly excluded Node 22
testing. Node 24 is the locally validated baseline; the server upgrade has
not been performed or verified by this work, and later Node major versions
are not claimed tested. Shared package locations, production destinations
and PM2 management remain unchanged.

## Implementation status: image optimization tooling

Updated Blockwars' `gulp-imagemin` from 7.1.0 to 9.2.0, using dynamic ESM
imports inside the existing CommonJS image task. Declared the four optimizer
plugins directly and import them explicitly, so missing plugins reject the
build rather than taking the wrapper's optional-plugin skip path. Existing
task names, output destinations, binary reads and shared runtime packages
remain unchanged. The image task now requires Node 18+; validation uses Node 24.

This removes SVGO 1 from this dependency chain, but is not a complete
deprecation cleanup. Checked-in metadata still reports deprecated `stable`,
`uuid`, `glob`, `inflight` and `rimraf` transitively through image plugins.
No vulnerability assessment is implied by these package notices.

Verification:

- `npm run test:build`: **6 asset/stream checks and 3 browser smoke/image
  checks passed**.
- The new browser check decodes source and staged PNG/GIF/JPEG images and
  verifies dimensions. PNG/GIF first-frame stored pixels match with browser
  color-space conversion disabled. It does not assert JPEG pixel equality,
  animated GIF timing/all-frame equality, or color-profile preservation.
- PNG optimization strips metadata through the plugin's existing behavior;
  decoding with browser color conversion enabled exposed a difference in
  `game/special-description.png`. This is documented, not claimed fixed.
- `git diff --check`: passed.

The build-contract test uses the VM main-context loader to inspect an async
ESM image task without writing to production. Node 24 emits an experimental
warning for that test-only API; the ordinary build does not use it. The
separate Mongoose test-server warning and CSS baseline gaps also remain.

## Implementation status: Gulp 5 compatibility

Updated Blockwars' local Gulp development dependency from 4.0.2 to 5.0.1.
Shared runtime dependency locations, production output destinations, task
names and PM2 management are unchanged.

The first Gulp 5 build exposed `Writable stream closed` failures. A minimal
real-stream probe reproduced failure when a merged Gulp destination stream
was merged again. Replaced the legacy merger with Node's promise-based
`pipeline` and `Promise.all`, preserving transform and bundle source order.
The real-stream regression test redirects destination writes into a temporary
directory, never production, and removes that directory afterward.

Gulp 5 changes file-encoding defaults. Binary reads are explicitly preserved
for images, fonts, vendor resources and sounds; copied fonts/resources/sounds
are checked byte for byte. Removed the direct `merge-stream` dependency
(transitive consumers may still retain it).

Verification on Node 24:

- `npm run test:build`: **6 asset/stream tests and 2 browser smoke tests passed**.
- `NODE_OPTIONS=--throw-deprecation npm run build`: passed. The former
  `fs.Stats` constructor warning is no longer emitted on this build path;
  deprecated transitive code is not claimed to be entirely eliminated.
- `git diff --check`: passed.

The build now requires Node's `node:stream/promises` API (Node 16+); use a
current supported LTS release. Production Node version and live PM2 processes
were not inspected or changed. The separately documented Mongoose warning and
CSS baseline gaps remain.

## Earlier regression checkpoint (before tooling upgrades and chat isolation)

After the implementation batches above, on 2026-10-27:

- `npm test`: **129 passed**, zero failures or skips.
- `npm run test:e2e`: **176 passed, 9 skipped**, zero failures across the configured desktop and phone projects. This run included staged-asset browser smoke tests because the local staging tree was present.
- `git diff --check`: passed.

The chat-send browser tests persist messages through the actual test server;
the two generated chat entries were removed after validation, preserving the
pre-run chat-file contents. At this checkpoint the suite was not isolated from
those local data files. The completed isolation batch above supersedes this
limitation; tests should still never target a production server.

These full-suite results precede the Gulp 5 upgrade, whose targeted validation
is recorded above.

Remaining limits: no production deployment or PM2 changes, real database outage
testing, physical-device testing, or exhaustive cross-browser/keyboard-layout
coverage. Known tooling warnings, CSS source gaps, classic-script globals and
compatibility keyboard fallbacks remain explicitly documented below. Passing
tests do not establish that these remaining modernization opportunities have
been resolved.

## Implementation status: asynchronous route failures

[routes/main.js](../routes/main.js) now forwards database lookup/query/save errors and chat-file read/write/JSON parse errors to the existing Express error handler through `next(error)`. Failed operations stop before rendering; a failed ban lookup no longer proceeds as an allowed request.

The chat-log and erase-chat routes share the same read/parse/render helper. A failed erase write stops without reading or rendering. Existing admin checks, successful templates, address precedence, and chat serialization are unchanged. Database calls retain the callback API supported by the shared Mongoose 6 dependency; this is not a Mongoose major-version migration.

**Intentional behavior change:** logged-in lobby requests wait for the user visit/IP save to complete before rendering. Lookup/save failures produce the existing error response rather than silently returning a successful page. Guest requests and requests whose user record is absent still render without saving. The browser test model was updated to implement the save-completion callback.

Verification:

- `node --test test/routes.test.js test/app.test.js`: **35 passed**. Covers lookup/save/query/file/parse failures, success paths, save-completion ordering, guest/missing-user behavior, admin access, ban/address handling and HTTP payload parser regression cases. File tests use in-memory doubles and do not erase real chat data.
- `npm run test:e2e -- e2e/lobby.spec.js e2e/game.spec.js`: **8 passed**, including authenticated lobby visits and Game access.
- `git diff --check`: passed.

Real database outage/integration testing remains outside this batch. The existing top-level HTTP error response format is unchanged.

## Implementation status: dependency ownership

- [app.js](../app.js) now uses the shared Express installation's built-in `express.urlencoded({ extended: true })` and `express.json()` middleware instead of directly importing an undeclared transitive `body-parser` package. Parser ordering and default options remain the same; the Express-owned parser version follows the existing shared Express dependency.
- [package.json](../package.json) now explicitly declares Babel core as a development dependency. The lockfile was refreshed offline using `--package-lock-only --ignore-scripts --no-audit --no-fund`. It retains the existing Babel core 7.20.2 and all other package versions; only direct-dependency/peer ownership metadata changed.
- Shared runtime packages, root manifests, PM2 processes and production paths were not modified. No package installation or version upgrade was performed.
- A traced local build identified the `fs.Stats` constructor warning in `clone-stats`, called by legacy Vinyl through `gulp-concat`. It remains visible; resolving it requires a separately verified tooling update or replacement.

Verification:

- `node --test test/app.test.js test/routes.test.js`: **22 passed**, including HTTP checks for JSON and nested URL-encoded payloads, empty JSON, malformed/primitive JSON rejection, the default 100KB limit, and existing address/ban route behavior.
- `npm run test:build`: **5 asset-contract tests and 2 staged-browser smoke tests passed**.
- `git diff --check`: passed.

## Implementation status: build contract and local staging

The user confirmed that production retains parent-shared packages and is run by externally managed PM2 scripts. Inspection of the root manifest confirmed ownership of Express, sessions, Mongoose and Pug. Locally resolved Mongoose is 6.13.11, so the existing database callbacks remain supported in the inspected installation; production versions were not independently checked. The direct transitive `body-parser` import identified in this batch was subsequently removed in the dependency-ownership batch above.

Refactored [gulpfile.js](../gulpfile.js) to share bundle inputs and asset tasks between the existing production tasks and a new local staging task:

- The existing production destination, shared-package layout and PM2 process management are unchanged.
- Production JavaScript output now also includes the individual browser scripts loaded by the current templates. Settings/service-worker filenames remain compiled outputs, avoiding concurrent raw/compiled writes.
- Game/lobby bundle source ordering now matches the active templates.
- Added copies for runtime vendor resources and sounds, and included root-level images such as the favicon.
- `npm run build` stages the same asset tasks into ignored local `build/`; it does not write to production.
- No shared dependencies were upgraded. Entry points, routes, configuration/secrets, account models/middleware, dependencies and mutable chat data are not staged. Existing deployment scripts still own those surfaces.
- Tasks overwrite matching files without deleting stale output. This is an asset staging tree, not a standalone or atomic deployment package.

Verification:

- `npm run test:build`: build succeeded, **5 asset-contract tests and 2 browser smoke tests passed**. Checks cover template/CSS references, script coverage/syntax, bundle ordering, unchanged production destinations, staging exclusions, compiled settings interoperability, saved rebinding, real game startup and lobby connectivity.
- Browser smoke tests use staged static assets with the existing HTTP/WebSocket test server. Output tests separately verify staged template equality. They do not establish production PM2/database behavior or execute the optional game/lobby bundles.
- `node --test test/views.test.js test/block.test.js test/keyboard.test.js`: **9 passed**.

Four CSS source gaps are explicitly reported as baseline exceptions, not hidden build success: `img/register.sprites.png` and Font Awesome `.eot`, `.ttf` and `.svg` fallbacks. WOFF/WOFF2 files exist and are copied. Any additional missing asset or omission of an existing source file fails verification. Existing build tooling emits a deprecated `fs.Stats` constructor warning; the test server also retains its Mongoose `strictQuery` warning.

See [development and build instructions](../README.md). Production tasks were not run and PM2 was not changed.

## Implementation status: keyboard compatibility mapping

Added [UTILS.keyCode](../public/js/modules/utils.js) to translate modern `KeyboardEvent.key`/`code` values into the existing numeric binding format. Gameplay press/release, Controls rebinding and the Ctrl+C chat-focus shortcut now share that mapping. On-screen button IDs and saved `KEY_BINDS` values are unchanged.

Letters follow the reported Latin character rather than blindly following physical key positions. Shifted digit-row keys retain their number bindings, while numpad digits and operators keep their distinct numeric values. Named controls and function keys map without reading the deprecated API.

This is a compatibility migration, not complete deletion of `KeyboardEvent.keyCode`: its remaining reads are isolated in the mapper for browser-specific punctuation and Meta values, unidentified keys and legacy synthetic events. Removing those fallbacks would require a separate saved-binding/browser-support decision. Actual behavior across all operating systems and keyboard layouts is not established by emulated tests.

Both chat inputs now handle Enter through `keydown` and `event.key`, replacing deprecated `keypress` listeners. Composing Enter does not send a message. Rebinding an unrecognized event without a numeric fallback displays an explicit retry message instead of overwriting the binding with zero.

Verification:

- `node --test test/keyboard.test.js test/block.test.js`: **5 passed**, covering modern-event mapping, shifted/layout-dependent keys, numpad and function keys, legacy fallback values, and existing development controls.
- `npm run test:e2e -- e2e/keyboard.spec.js`: **6 passed**, covering numeric saved bindings, default actions and all five Special targets, held-key release, rebinding/duplicate removal/reload, unsupported-key feedback, Ctrl+C focus, Space while typing, and chat Enter/composition handling.
- The related input/panel regression run passed **17 tests**, with **3 existing project-specific skips**, across desktop and phone portrait/landscape. That run also included the initial five keyboard tests before the held-key test was added.
- `git diff --check`: passed.

No dependency, script-loading, build or proxy-policy changes were made in this batch.

## Implementation status: request-address API

Replaced both deprecated `req.connection` address lookups in [routes/main.js](../routes/main.js) with `req.socket.remoteAddress`: the lobby's saved visit address and the Game's ban lookup. In Node HTTP requests, `connection` is an alias of `socket`; the redundant alias and nested `connection.socket` fallback are no longer used.

The existing `x-forwarded-for` precedence and raw header value are unchanged, including comma-separated chains. This batch does not change proxy trust, normalize addresses, or migrate database callbacks. Such policy changes require separate deployment decisions.

Verification:

- `node --test test/routes.test.js`: **15 passed**. Covers forwarded-address precedence, unchanged forwarded chains, IPv4/IPv6 socket fallback, empty-header fallback, saved lobby addresses, and both banned and allowed Game requests. Test requests throw if the deprecated `connection` property is accessed.
- `npm run test:e2e -- e2e/lobby.spec.js e2e/game.spec.js`: **8 passed**, exercising the actual HTTP routes with existing in-memory database stubs.
- A JavaScript source search found no remaining `req.connection` usage in Blockwars.

Real database integration and production proxy configuration remain outside this validation. The existing Mongoose `strictQuery` warning remains.

## Implementation status: safe lexical declarations

Completed the approved first syntax-cleanup batch:

- Converted server-local speed-up timer bindings to `const`/`let`, retaining the mutable expected-time closure.
- Converted development shortcut bindings to `const` within explicit switch-case blocks, preserving the host gate and effects.
- Converted template titles, row-loop indices, per-row values and duration-formatting locals. The highscore crown variable is declared once per row and assigned by the existing branches.
- Converted function-local rules-language and lobby SDK initialization bindings.
- Preserved classic-script globals, including namespace exports, `user`, the theme bootstrap binding and the chat-log script's globals. Changing their window-property or cross-script visibility is outside this batch.

The same first-party source scan now finds **14 lines containing `var`**, down from the original **49**. This is a matching-line count, not a declaration count. No dependency, build, module-system, browser-support or deprecated-API changes were made.

Verification:

- `node --test test/session.test.js test/views.test.js test/block.test.js`: **43 passed**. Covers repeated speed-up ticks and disposal; all affected inherited page titles; highscore crown boundaries and row isolation; game-log output; rules-language switching; and repeated, host-gated development shortcuts.
- `npm run test:e2e -- e2e/lobby.spec.js e2e/keys.spec.js e2e/input.spec.js e2e/input.mobile.spec.js`: **12 passed** across desktop and phone portrait/landscape projects.
- `git diff --check`: passed.

These are targeted regression checks, not a full-suite or production-build claim. Existing diagnostic output remains: the malformed-state unit test logs a null-block error and the browser server emits a Mongoose `strictQuery` deprecation warning.

## Scope and conclusions

Read-only inspection of Blockwars' first-party JavaScript, inline template scripts, dependency manifests, build configuration, and test setup. No application changes, dependency upgrades, installs, or commits were made for this audit.

Other applications, parent-owned dependencies and configuration, deployment infrastructure, generated bundles, minified/vendor contents, and external package registries were excluded. Dependency observations describe checked-in metadata, not a current security assessment.

**There is legacy code, but replacing `var` everywhere is not the highest-value first step.** Prioritize runtime compatibility and a reproducible build/deployment contract. Treat syntax cleanup as a separate, behavior-preserving activity.

Priority below is modernization order, not vulnerability severity. “Confirmed” means visible in source or checked-in metadata; it does not mean a production failure was reproduced.

## Findings

### P1: Runtime dependency ownership is incomplete locally

**Confirmed boundary; deployment impact unverified.**

[package.json](../package.json#L16) declares only `ws` as a production dependency, while [app.js](../app.js#L2) also imports Express, client-sessions, body-parser, Mongoose and express-flash, plus configuration and middleware outside this application. [routes/main.js](../routes/main.js#L2) relies on shared models. This can work with parent-provided dependencies, but the local manifest alone does not establish a reproducible standalone runtime.

Four route operations use Mongoose-style callbacks through `findOne` or `exec`: [routes/main.js](../routes/main.js#L17), [routes/main.js](../routes/main.js#L43), [routes/main.js](../routes/main.js#L49), and [routes/main.js](../routes/main.js#L105). These callback APIs are incompatible with Mongoose 7+, but the actual parent-provided version and model implementation were outside scope. Do not upgrade or rewrite these calls without verifying that contract.

The dormant notification server also imports undeclared `web-push` in [serviceworker.js](../serviceworker.js#L1). Its mount is commented out in [app.js](../app.js#L50), so it should not be treated as an established active runtime dependency.

**Recommendation:** establish ownership and supported versions before changing manifests or database calls. Preserve shared account/session behavior.

### P1: Build outputs and template loading do not establish one deployment path

**Confirmed wiring difference; production breakage not established.**

[gulpfile.js](../gulpfile.js#L9) emits concatenated, transpiled, minified scripts, with development outputs under `public/js/dist` and production outputs in an external tree. Active script tags in [game.pug](../views/game.pug#L312) and [lobby.pug](../views/lobby.pug#L66) instead load individual source scripts; their bundle tags are commented out.

The production tasks in [gulpfile.js](../gulpfile.js#L89) do not show a complete deployment of individual browser source scripts, server entry points, routes, manifests and configuration. An external or incremental deployment may supply those files; that was not inspected. Bundle ordering also differs from the template script order.

[package.json](../package.json#L30) configures Babel without explicit browser targets or a polyfill policy. Individual source scripts bypass that build transformation.

**Recommendation:** confirm the deployed entry point, asset-copy process, script order and supported browsers. Then choose one documented loading/build path and test it from a clean output directory. Do not assume converting syntax makes the deployed browser code more compatible.

### P2: Deprecated input and request APIs remain

**Confirmed usage; migration requires behavioral tests.**

- Numeric `KeyboardEvent.keyCode` appears in gameplay, controls, chat and lobby handling: [block.js](../public/js/block.js#L182), [settings.js](../public/js/settings.js#L303), [chat.js](../public/js/chat.js#L10), [lobby.js](../public/js/lobby.js#L104), and [zmain.js](../public/js/zmain.js#L21).
- Deprecated `IncomingMessage.connection` access remains beside socket access in [routes/main.js](../routes/main.js#L11) and [routes/main.js](../routes/main.js#L99).

**Recommendation:** migrate request-address handling with explicit tests for missing addresses and proxy behavior. For keyboard modernization, decide between character-based `key` and physical-key `code` semantics first. Test custom bindings, default bindings, duplicate bindings, chat focus, held keys, rotation/drop, and Special targeting. A replacement must not silently change keyboard-layout behavior.

### P2: Older tooling includes recorded transitive deprecations

**Confirmed lockfile metadata; current support/security status not verified.**

The root dependency lists in [package.json](../package.json#L16) and [package-lock.json](../package-lock.json#L4) agree. The version-3 lockfile records a mixed-age stack: Babel preset-env 7.20.2, Gulp 4.0.2 and gulp-imagemin 7.1.0, alongside Playwright 1.64.1 and ws 8.22.0.

The lockfile contains nine package deprecation annotations, including Chokidar 2, fsevents 1, source-map helpers and an unsupported SVGO version. Examples: [package-lock.json](../package-lock.json#L2945), [package-lock.json](../package-lock.json#L4850), and [package-lock.json](../package-lock.json#L9387). Deprecation metadata alone does not establish an exploitable vulnerability or production impact.

[highscore.pug](../views/highscore.pug#L63) references vendored jQuery 3.3.1 and tablesorter 2.31.0. Vendor source was excluded. The Howler filename in [game.pug](../views/game.pug#L312) does not establish its version.

**Recommendation:** determine which build tasks and vendor assets are actually used, then update one dependency group at a time with output and browser checks. Avoid mass upgrades based only on package age.

### P3: `var` cleanup needs scope-aware classification

**Confirmed older syntax; not inherently deprecated or defective.**

The inventory found **49 matching lines containing `var`**, not 49 declarations: nine browser-JavaScript lines, three server-game lines and 37 Pug lines. These are source-pattern counts, not generated-output counts.

| Category | Examples | Modernization constraint |
| --- | --- | --- |
| Browser namespace globals | [utils.js](../public/js/modules/utils.js#L1), [tetris-utils.js](../public/js/modules/tetris-utils.js#L1), [screen-settings.js](../public/js/modules/screen-settings.js#L1), [theme.js](../public/js/modules/theme.js#L2), [notifications.js](../public/js/modules/notifications.js#L1) | Top-level `var` in classic scripts creates window properties; `let`/`const` do not. Verify consumers and bundle scope before replacement. |
| Inline browser globals | [game.pug](../views/game.pug#L10), [game.pug](../views/game.pug#L306), [lobby.pug](../views/lobby.pug#L61) | Preserve cross-script access to `user` and initialization order. A `try` block does not scope `var`. |
| Function-scoped switch variables | [block.js](../public/js/block.js#L246) | Four declarations are behind a development-host condition. Check case boundaries and hoisting before using lexical declarations. |
| Server-local timer variables | [session.js](../game/session.js#L259) | Check reassignment and closure lifetime; these are not browser globals. |
| Server-side Pug declarations | [highscore.pug](../views/highscore.pug#L92) | Template locals are not browser globals. Verify template compiler behavior rather than treating every match as client JavaScript. |

**Recommendation:** prefer `const` for bindings that are not reassigned and `let` where reassignment is needed, after checking lifetime, hoisting and visibility. Do not run a repository-wide text replacement.

CommonJS, constructor/prototype methods, IIFEs and callbacks are not inherently obsolete APIs. For example, the callback contract in [arena.js](../public/js/arena.js#L25) is valid older style. Converting these to modules, classes or promises requires a concrete benefit and separate approval for architectural changes.

### Separate reliability follow-up: asynchronous error handling

**Source-level concerns; failures were not reproduced in this audit.**

[routes/main.js](../routes/main.js#L55) logs a chat-read error but continues toward JSON parsing; an erase-chat write callback does not inspect its error. [routes/main.js](../routes/main.js#L21) calls `user.save()` without awaiting or catching completion.

Filesystem callbacks themselves remain valid Node APIs. The concern is error/completion handling, not their age. Investigate these with focused failure-path tests rather than bundling them into cosmetic syntax cleanup.

## Existing validation and its limits

- Five unit-test files cover bots, sessions, lobby messaging, Special rules and gestures. [package.json](../package.json#L10) uses `node:test`; mock timers in [session-fixtures.js](../test/helpers/session-fixtures.js#L61) make Node version compatibility relevant. No Node engine range is declared.
- Eighteen browser spec files cover gameplay/protocol, input, accessibility, canvas, layout, panels, targeting, themes and mobile interaction. [playwright.config.js](../playwright.config.js#L18) configures Chromium desktop and emulated Pixel 7 portrait/landscape, not Firefox, WebKit or physical-device validation.
- Browser tests start the app with in-memory model stubs. [stub-models.js](../tests/fixtures/stub-models.js#L3) accepts legacy database callbacks, so passing these tests would not prove compatibility with the production Mongoose/MongoDB setup.
- No tests or builds were run for this read-only audit. Earlier modal-specific validation is not a modernization baseline.

## Behavior-preserving staged plan

1. **Establish external contracts.** Confirm deployed Node/npm and parent dependency versions, database model API, supported browsers, active notification features, deployed template variants, and whether assets are copied cleanly or incrementally. These remain unverified outside-scope facts, not user-code defects.
2. **Capture a baseline.** On an approved environment, run `npm test` and the existing browser suite. Exercise the actual build path separately. Do not invoke production-copy tasks until their external destinations and side effects are understood.
3. **Resolve runtime/build reliability first.** Propose dependency ownership and asset wiring changes against confirmed deployment facts. Test a clean deployment and real database integration where appropriate.
4. **Migrate deprecated APIs in bounded changes.** Separate request handling from keyboard input; preserve network messages, gameplay, saved settings and browser support.
5. **Modernize safe local syntax.** Start with local `var` declarations whose scope is proven equivalent. Handle classic-script globals and templates separately. Run focused tests after each coherent batch.
6. **Evaluate optional architectural work independently.** ES modules, classes, a different bundler, changed browser support and broad dependency upgrades are proposals, not automatic cleanup.

No gameplay terminology was changed, so the gameplay glossary was left untouched. No consequential architectural trade-off was settled, so this audit does not introduce an ADR.
