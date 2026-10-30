# Workspace Guide

This workspace contains the Mongot games and their shared account portal. Treat each top-level game directory as an independently built and deployed application; do not assume they share runtime code just because they share a domain family.

## Applications

- `mongot.com/` is the public landing page and the source of truth for account registration, login, and profile routes. All subdomains consume this logged in session.
- `snake.mongot.com/` is the multiplayer Snake subdomain.
- `general.mongot.com/` is the turn-based RISK like game.
- `blockwars.mongot.com/` is the multiplayer tetris game.

Shared account data and session setup live at the workspace root in `models.js`, `middleware.js`, and `mongot.com/app.js`. Game-specific match data remains owned by each game application; for example, Snake high scores are stored in `snake.mongot.com/highscores.json`.

## Cross-subdomain Authentication

The login flow is owned by `mongot.com`; game subdomains should consume that identity rather than implement a separate account or password store. The session cookie is named `session`, and Snake decodes it with `client-sessions` using `COOKIE_SECRET`.

For browser authentication to work across subdomains, the portal must issue the cookie with a parent-domain scope such as `mongot.com` (or `.mongot.com`), and the Snake server must use the same `COOKIE_SECRET`. The cookie domain option is currently commented out in `mongot.com/app.js`, so do not assume cross-subdomain cookie sharing is enabled by the checked-in configuration. Keep this requirement in mind when changing auth or local/prod setup.

See `snake.mongot.com/AGENTS.md` for Snake-specific instructions and `snake.mongot.com/README.md` for its development setup.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md` points to per-game glossaries (e.g. `blockwars.mongot.com/GLOSSARY.md`), with ADRs in `<game>/docs/adr/`. See `docs/agents/domain.md`.
