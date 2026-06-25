# authentik code-mode MCP server

Exposes authentik's API to an agent as **code**, not as hundreds of tools:

- `search(query)`: find API operations (path/summary/tags) with their schemas.
- `execute(code)`: run JS with a **read-only** `ak.request(method, path, { query, body })`.
- `validate_blueprint(content)`: validate a proposed Blueprint YAML against the policy without applying it.
- `prepare_apply(content)`: validate, then return a trusted diff, an undo snapshot, irreversible-op flags, and the exact `ak apply_blueprint` command for the operator to run. Never applies.
- `docs()`: version-aware docs URLs for this instance.

## Layout

No build step — `.ts` runs directly under Node's native type stripping. Internal
imports use the `#*` subpath alias from `package.json` (`#client`,
`#blueprint/validate`), never relative paths. `test/` mirrors this tree.

```
lib/
  index.ts          entry + MCP tool registration
  tools.ts          wires the five tools
  config.ts         env → { baseURL, token }
  version.ts        server identity constants
  predicates.ts     shared type-guards
  # read runtime (the search / execute half)
  client.ts         the read-only ak.request (blocks writes + secret reveals)
  sandbox.ts        the vm code sandbox bound to `ak`
  schema.ts         operation search + $ref deref
  load-schema.ts    fetch the instance's OpenAPI schema at startup
  docs-url.ts       resolve version-aware docs base URLs
  # blueprint subsystem (the validate / prepare half)
  blueprint/
    policy.ts       allow-list data: models, per-attr rules, curated refs
    validate.ts     the policy-enforcement orchestrator…
    tags.ts         …default-deny YAML-tag walk
    refs.ts         …reference curation
    duration.ts     …token-validity parsing
    live-lookup.ts  shared read-only "does this object exist live?" lookup
    diff.ts         trusted diff vs the live instance
    undo.ts         undo snapshot + reversibility classification
    prepare.ts      ties validate + diff + undo into the operator handoff
```

## Auth

Set two environment variables (the token carries your own permissions):

```bash
export AUTHENTIK_URL="https://id.example.com"
export AUTHENTIK_TOKEN="ak-…"   # Directory → Tokens → create
```

The server fetches `${AUTHENTIK_URL}/api/v3/schema/` at startup, so discovery
always matches your instance's version.

## Example

```
search({ query: "list failed logins events" })
execute({ code: `return (await ak.request("GET","/events/events/",{query:{action:"login_failed",ordering:"-created",page_size:10}})).data;` })
```

## Security (v2)

This server is **credential-free for writes**: it does not hold or expose a write- or apply-capable credential, and it never mutates or applies anything in the instance. Everything an agent could change is gated behind a server-side policy and a manual operator step.

- **Tools:** `search` (discovery), `execute` (read-only, GET/HEAD/OPTIONS-only API calls), `validate_blueprint` (policy validation only), `prepare_apply` (validate + diff + undo + apply-command handoff), `docs` (version-aware docs URLs). There is no `execute_write` and no apply tool.
- **Auth:** `AUTHENTIK_TOKEN` must be the scoped read-only token provisioned by `scripts/provision-agent-identity.py`, never a superuser token. If unset, `AUTHENTIK_URL` defaults to `http://localhost:9000`.
- **Read boundary:** the bootstrap assigns authentik's official **`authentik Read-only`** role, which grants only per-model `view_<model>` permissions, so secret-reveal permissions (`view_token_key`, `view_certificatekeypair_key`, …) are excluded by construction. That prevents exfiltration of API tokens and certificate private keys. See `docs/agent-security-model.md` § 5–7 for the threat model and design rationale.

### Validator: a policy-enforcement point

`validate_blueprint` enforces a closed, default-deny policy and returns `{ ok, violations, flags }`. It never throws on hostile or malformed input: a parse or walk error becomes a violation, not an exception.

- **Model allow-list:** only `authentik_core.application`, `authentik_providers_oauth2.oauth2provider`, and `authentik_providers_saml.samlprovider` are permitted. Any other model is rejected.
- **Per-attribute allow-list:** every attribute is binned and enforced: `PASS` (allowed as-is), `FLAG` (allowed but surfaced for operator review), `FORCE` (must deep-equal a policy-required value), `CAP` (numeric durations capped, e.g. token validity), `REF` (relationship fields that must be a permitted reference). An attribute not in the allow-list for its model is rejected. Obvious secret fields (`client_secret`, `token`, `password`, `key_data`) are always rejected.
- **Default-deny on YAML tags:** only the curated `!Find` / `!KeyOf` reference tags are permitted; any other tag (`!Env`, `!Context`, `!Format`, expressions, arbitrary tags) is rejected. Permitted references are curate-checked: `!Find` may resolve only to a small set of built-ins (curated flows, scope mappings, and the default signing key; `authentik_api`/`entitlements` scopes are excluded), and `!KeyOf` must reference an `id` defined within the same blueprint.
- **Structural guards:** multi-document YAML is rejected; `attrs` must be a plain object; model names are case-normalized before the allow-list check.

### `prepare_apply` is credential-free

`prepare_apply` validates first, returning only the violations if the blueprint is unsafe, then assembles a handoff for the **operator** to apply. The MCP holds no apply or write credential and never applies the change itself.

- **Trusted diff:** a server-computed full object list (not a collapsed summary), derived from read-only API calls.
- **Undo snapshot with reversibility classification:** a restore point classified as `clean` (pure attribute update of an existing object), `lossy` (create-only, so undo means delete), or `impossible` (a delete or a crypto object). The overall reversibility is the worst case across all entries.
- **Irreversible-op flags + apply command:** destructive entries (a delete via `state: absent`, or any crypto change) are flagged. For a safe change, the result includes the exact `ak apply_blueprint <file>` command for the operator to run on the host. For a destructive change the one-line command is withheld and the notice steers the operator to run the apply manually on the host CLI after reviewing the diff and undo notes.

### Not in v2 (deferred to v3)

- A **Trust-Policy pre-registry** (pre-declaring trusted objects/references out of band).
- **Automated apply:** applying a blueprint always remains a manual operator action on the host.

See `docs/agent-security-model.md` for the threat model and design rationale, and `docs/superpowers/specs/2026-06-25-agent-security-v2-design.md` for the v2 design spec.
