# Hearth

A spatial AI team workspace for small businesses. Spawn an engineering office, define teammates, give the team a mission, inspect its work, and launch a browser app.

## What works

- Six-role engineering template: PM, designer, backend, frontend, QA, engineering manager.
- Lean (PM/frontend/QA) and product-design team templates.
- Editable teammate instructions and names; durable teams, missions, files and event history.
- Office characters change location with planning, implementation and review states. Click any character to inspect its definition.
- Mission board, role handoffs, shared project files, team messages, pause/resume/retry and per-mission token budgets.
- Live OpenAI Responses execution. Each role receives the mission, shared files and recent human messages. Its structured output writes artifacts and hands work to the next role. QA can request up to two frontend revision rounds using exact, atomic file edits. Only the latest file versions enter the model context; QA and delivery roles return concise notes instead of rewriting the app.
- Cross-team collaboration copies project context into another team's mission. Return work explicitly to merge new artifacts back without duplicate copies.
- Downloadable artifacts, isolated playable HTML previews and private launch URLs.
- A clearly labeled, zero-token scripted walkthrough with a prebuilt pseudo-3D pinball game.
- Shared workspaces with single-use, expiring invitations, viewer/collaborator roles, named guidance, live presence, workspace switching, and owner-managed revocation. Collaborators can view, message, and pause; only owners can execute agents, change budgets or definitions, launch, and invite.
- WebMCP read-office and create-mission tools using the same server actions as the UI.

## Run locally

From the parent personal workspace, activate the personal environment, then enter this project:

```sh
source ../activate.sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_outstanding_the_professor.sql
npm run dev
```

Apply that migration and `drizzle/0001_elite_silver_surfer.sql` once to a new local database. The preview URL is printed by the development server. The Sites deployment applies production migrations automatically.

For real model runs, enter an OpenAI API key in Settings (memory-only for the current tab), or copy `.env.example` to `.env` and set `OPENAI_API_KEY`. The default model is `gpt-5.2`; the model can be changed in Settings. A server-side key is required for a persistent deployment connection. No credentials are committed.

## Verification

```sh
npx tsc --noEmit
node tests/logic.mjs
node tests/budget.mjs
npm run build
npm start -- --port 8787
HEARTH_TEST_URL=http://127.0.0.1:8787 node tests/integration.mjs
HEARTH_TEST_URL=http://127.0.0.1:8787 node tests/sharing.mjs
```

Use the built Worker for integration tests: the development server intentionally replaces identity headers with its local sign-in identity, so per-owner isolation cannot be tested through its mock sign-in middleware. Test users create independent rows in the local database. Do not point these tests at production.

The logic suite tests pinball scoring, flipper impulses, game-over, restart, and finite simulation. It also exercises the real live-request code using a mocked provider response, including precise budget guards, duplicate-file compaction, atomic revision edits, and incomplete/refused output. The budget suite checks pause/resume without rerunning completed steps. Integration tests cover durable state, validation, origin rejection, owner separation, concurrent leases, pause during a step, messaging, all six demo roles, launch, and collaboration returns. The sharing suite uses separate authenticated test identities to verify invitation claims, revocation, role restrictions, shared messages, presence, and launched-app isolation. Browser QA from the prior version covers the office, WebMCP, pinball keyboard input, and launch.

## Architecture and current boundaries

This is a functional first version, not an unrestricted software factory. Its deliverable scope is **self-contained browser apps and documents**. Agents have no shell, browser testing, package installation, repository access, external network tools, or public deployment permission. Live QA is source review, not executed tests. The included pinball demo was built in advance; demo teammates do not call a model.

The owner’s React client coordinates one role at a time through `/api/step`. Leave an office tab open to continue handoffs. Server calls already in flight can finish, but closing the browser stops new work from being scheduled. Pausing allows the current step to finish. A D1 compare-and-swap revision plus a 180-second lease prevents concurrent tabs from running the same step. An expired lease can be retried after a lost worker; provider calls are not exactly-once. A durable background queue would be the next production step.

Each authenticated visitor gets a private D1 workspace keyed by the platform's verified user ID. Members can explicitly select an invited workspace. Every workspace read, mutation, model step, and launched artifact checks membership; roles are enforced on the server. Invitations store only SHA-256 hashes, expire after 7 days, and are claimed atomically by one signed-in user. Removing a member revokes their old invitations too. Localhost has a development fallback identity.

Sites access remains a separate outer gate: allow your friend through the Site sharing controls first, then send a link from **People & sharing** in Hearth. Do not make the Site public to invite a friend. If sign-in drops the invitation fragment, reopen the invitation link after signing in. Display names are user-chosen labels, not verified identities. Online presence means a workspace was polled in the last 20 seconds; activity refreshes about every 4.5 seconds. Never expose this Worker directly without a trusted authentication gateway that strips client-supplied identity headers.

Generated HTML runs inside an iframe with `sandbox="allow-scripts"`, without same-origin privileges, and a restrictive Content Security Policy that blocks external requests, nested frames, plugins, forms and base URLs. Downloads preserve source, so review downloaded apps before running them outside the sandbox. Launch URLs are private to the workspace, not public internet hosting.

Tokens are reported from provider responses, including unusable completed responses. Before each generation, the runner measures the actual request with the provider’s input-token counting endpoint and reserves the role’s maximum output allowance. If it does not fit, the same mission pauses without a generation call. Adjust its total budget and resume: completed files, task position and usage are preserved. This is a token cap, not a monetary billing guarantee. Network failures can leave provider usage unknown. There is no fabricated dollar estimate. Storage is intentionally bounded to 12 teams, 30 missions and roughly 1.8 MB per workspace.

The data is a versioned workspace document in D1. This keeps atomic changes easy to reason about at prototype scale; large multi-user organizations should normalize records, add a durable job queue, execution sandboxes, granular permissions, and event streaming.

An opt-in real-provider smoke test is available as `node tests/live.mjs` with `OPENAI_API_KEY` in the process environment. It runs a six-role Snake mission and saves artifacts and provider output under ignored `outputs/`. To exercise recovery, set `HEARTH_LIVE_FIXTURE` to an exported mission JSON and `HEARTH_LIVE_BUDGET` to a new total limit. It uses real API tokens; credentials are never written.

The live response format follows [OpenAI's Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
