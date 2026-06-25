# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a repository of Markdown **skills**, not an application. It packages [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) for working with [authentik](https://goauthentik.io) (the identity provider) and ships them to several agent runtimes. The only executable code is one MCP server; the `package.json`, ESLint, and TypeScript config at the root exist to lint the content and support that server. The authentik product lives in a separate repo, and nothing here builds or runs it.

The same skill content is published four ways from one source tree, driven by sibling manifest/config files at the root:

| Runtime             | Entry point                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| Claude Code plugins | `.claude-plugin/marketplace.json` → `plugins/*/.claude-plugin/plugin.json` |
| Pi package          | `pi` field in `package.json`                                               |
| Cursor plugin       | `.cursor-plugin/`                                                          |
| `npx skills`        | the `plugins/*/skills/` dirs directly                                      |

When you change skills or the plugin layout, keep these manifests **and** the skill tables in `README.md` in sync. They are maintained by hand; there is no generator.

## Plugins

- **`ak-admin`** (`plugins/admin/`): for an operator administering a _running_ authentik instance.
- **`ak-dev`** (`plugins/developer/`): for a contributor working on authentik's _source code_.

Note the directory name (`admin`/`developer`) differs from the plugin name (`ak-admin`/`ak-dev`); the marketplace manifest maps one to the other.

## Skills

Each skill is a directory under `plugins/<plugin>/skills/<name>/` containing a `SKILL.md` with YAML frontmatter (a `name` and a `description` that lists the _triggers_, the phrasings that should auto-load it), followed by the body. Skills are auto-loaded by relevance, not invoked explicitly. The `description` is the only thing the agent sees before deciding to load a skill, so it must enumerate concrete trigger phrases and the "not this skill, use X instead" hand-offs.

### Three-layer information model (admin skills)

The `ak-admin` skills are deliberately thin routers. They do not embed authentik's reference material; they point outward, because authentik changes between releases:

- **L1, live docs:** `https://docs.goauthentik.io/llms.txt` (integrations: `https://integrations.goauthentik.io/llms.txt`). Skills tell the agent to follow the `llms.txt` index and fetch the relevant `.md` rather than answer from memory. Learn the _concept_ here first.
- **L2, the skill** itself: the mental model, the routing, the workflow.
- **L3, the live instance:** the `authentik-code-mode` MCP server (below) for reading and changing objects via the API.

A typical admin skill: explain the model (L2), send the agent to the docs for specifics (L1), then have it act on the instance through code-mode (L3). Preserve this layering when editing: do not inline doc content that L1 should own.

## MCP server: `authentik-code-mode`

`mcp-servers/code-mode/` is a TypeScript stdio MCP server that exposes authentik's whole REST API as **code** instead of hundreds of individual tools. It is **propose-only**: it holds no write/apply credential and never mutates the instance. Five tools:

- `search(query)`: free-text search over the instance's OpenAPI operations, returns matching ops and their schemas.
- `execute(code)`: runs JS with a **read-only** `ak.request(method, path, { query, body })` (GET/HEAD/OPTIONS only).
- `validate_blueprint(content)`: validates a proposed Blueprint (YAML) against a closed allow-list policy without applying it; returns `{ ok, violations, flags }`.
- `prepare_apply(content)`: validates, then returns a trusted diff, an undo snapshot, irreversible-op flags, and the exact `ak apply_blueprint` command for the operator to run. Never applies.
- `docs()`: version-aware authentik docs base URLs for this instance.

It fetches `${AUTHENTIK_URL}/api/v3/schema/` at startup so discovery always matches the running instance's version. Auth is two env vars, `AUTHENTIK_URL` and `AUTHENTIK_TOKEN` (the token carries the operator's own permissions). `.mcp.json` registers it for plugin installs via `${CLAUDE_PLUGIN_ROOT}`.

The source runs as `.ts` directly under Node's native type stripping, so there is **no build step** (`tsconfig.json` is `noEmit`). Internal imports use the `#*` subpath alias (`#client`, `#blueprint/validate`) defined in `package.json`, not relative paths. The layout under `lib/`:

- **Server core:** `index.ts` (entry + MCP tool registration), `tools.ts` (wires the five tools), `config.ts`, `version.ts`.
- **Read runtime** (the `search`/`execute` half): `client.ts` (the read-only `ak.request`), `sandbox.ts` (the `vm` code sandbox), `schema.ts` (operation search + `$ref` deref), `load-schema.ts` (startup schema fetch), `docs-url.ts` (version-aware docs URLs).
- **`blueprint/`** (the `validate`/`prepare` half): `policy.ts` (allow-list data), `validate.ts` (the orchestrator) with its helpers `tags.ts` (default-deny YAML-tag walk), `refs.ts` (reference curation), and `duration.ts` (token-validity parsing); `diff.ts` + `undo.ts` (the operator handoff) over a shared `live-lookup.ts`; and `prepare.ts` (ties validate + diff + undo into the handoff).
- `predicates.ts`: shared type-guards.

`test/` mirrors this tree (`test/blueprint/` for the subsystem). See the server's `README.md` for the security model and `docs/agent-security-model.md` for the threat model.

## Commands

Run from the repo root unless noted.

```bash
npm install            # installs root devtools + the mcp-servers/* workspaces
npm run lint           # prettier --check + eslint (whole repo)
npm run lint:fix       # prettier --write + eslint --fix
```

MCP server tests use the Node built-in test runner (`node:test`), no extra deps, from inside the server dir:

```bash
cd mcp-servers/code-mode
node --test                            # full suite (discovers test/ recursively)
node --test test/tools.test.ts         # a single test file
```

## Dependency handling

`node_modules` is gitignored everywhere. For a **plugin install**, the `SessionStart` hook in `hooks/hooks.json` runs `npm install --omit=dev` inside the code-mode server so it has its runtime deps; nothing to run by hand. For **local dev**, a single `npm install` at the root resolves everything because `mcp-servers/*` are npm workspaces.
