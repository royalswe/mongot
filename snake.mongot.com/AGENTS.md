## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout. See `docs/agents/domain.md`.

## Workspace and accounts

This directory is the independently deployed `snake.mongot.com` game subdomain. The landing page, account registry, registration, and login are owned by the workspace's `mongot.com/` application; do not add a second Snake account system. Snake owns its gameplay and high-score data.

Read the workspace [`AGENTS.md`](../AGENTS.md) for the application map and shared-auth contract. Snake reads the `session` cookie using the same `COOKIE_SECRET` as the portal. Cross-subdomain browser login also requires the portal's cookie to be scoped to the parent domain; that cookie-domain option is currently commented out in `mongot.com/app.js`, so verify deployment behavior rather than assuming it is active.
