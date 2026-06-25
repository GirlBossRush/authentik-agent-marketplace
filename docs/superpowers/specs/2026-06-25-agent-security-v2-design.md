# Agent Security v2 — design spec

**Status:** Approved design (2026-06-25). Supersedes the v2 row of `docs/agent-security-model.md` §10.
**Builds on:** v1 ("safe read, safe propose") — the propose-only MCP with a hardened read token and a blueprint content validator.
**Informed by:** a 3-pass competitor research sweep and a 5-turn adversarial design review (DeepSeek pro). Key external findings: propose-then-human-apply is the convergent SOTA for agents touching control planes; no mainstream IdP lets an agent mutate its own config plane; short-lived-token brokers are SOTA for *downstream* access but suffer a **self-referential collapse** when the agent mutates the IdP itself.

---

## 1. The load-bearing principle

The security boundary is **not** human review and **not** a held credential — both fail a lazy/rubber-stamping operator, and any apply credential is superuser-equivalent (authentik blueprint apply bypasses caller RBAC — maintainer-confirmed, see findings doc Finding 1). The boundary is:

> **The validator is a policy-enforcement point that makes any change to the IdP's *security surface* inexpressible.** Safety holds even if the operator blindly applies, because the dangerous blueprint never validates in the first place.

Corollary (the self-referential rule): never place a superuser-equivalent apply credential anywhere the agent can reach — not even a JIT-minted one — because for self-config there is no place to stand it up that a valid blueprint couldn't subvert. Therefore **v2 has no apply credential and no automated apply.** The human applies, under their own session.

## 2. Scope

**In scope (v2):**
- (a) Harden the blueprint validator into a policy-enforcement point (§3).
- (b) A **credential-free "prepare to apply" handoff**: trusted server-computed diff + undo snapshot + irreversible-op flagging + the exact operator-run apply command (§4).

**Out of scope (→ v3):**
- Any automated apply / server-held or JIT-minted apply credential.
- The **Trust-Policy pre-registry** (admin pre-approves per-app redirect URIs / scopes so the per-change step becomes a low-toil "match-confirmation"). Until it exists, the app-specific trust attributes are ALLOW+FLAG (surfaced for manual operator review), not auto-validated.

**Headline use case:** app onboarding — "integrate Grafana/Nextcloud" = create an `Application` + a `Provider` (OAuth2/OIDC or SAML).

## 3. The validator (policy-enforcement point)

Allow-lists, not deny-lists. Anything not explicitly permitted is rejected.

### 3.1 Model allow-list
Only: `authentik_core.application`, `authentik_providers_oauth2.oauth2provider`, `authentik_providers_saml.samlprovider`. All other models → reject. (Exact model labels: **verify in Phase 0, §5.3**.)

### 3.2 Strict per-model attribute allow-list
Any attribute not listed for its model → reject. Bins:

- **BLOCK (reject if present):**
  - property-mapping / expression *creation* (arbitrary code execution)
  - secret fields (`client_secret`, etc.)
  - relax-auth flags: `skip_authorization`, implicit-consent, public-client-without-secret coercion
  - signing/encryption key *selection* (except the curated default, §3.3)
  - flow bindings (`authentication_flow`/`authorization_flow`/`invalidation_flow`) except the curated defaults (§3.3)
  - **policy bindings** (the `policies` relationship — as powerful as a flow binding)
  - **any reference to a pre-existing object** not on the curated allow-list (§3.3)
- **FORCE-to-safe-default (reject if set to anything else):** `issuer_mode`, `include_claims_in_id_token=false`, `sub_mode`.
- **CAP (reject if outside bound):** `access_code_validity`, `token_validity`, refresh lifetime ≤ admin-configured global max.
- **ALLOW + FLAG (permitted; surfaced prominently in the diff for operator review):** `redirect_uris`, `post_logout_redirect_uris`, `allowed_scopes`, `client_type`, `client_auth_method`, `grant_types`. Rationale: misuse is *app-scoped* (bad redirect / over-broad scope for THIS app), not IdP-wide compromise; the operator applies manually and deliberately. (Exact field names + scope representation: **verify in Phase 0, §5.3**.)
- **PASS:** `name`, `slug`, UI metadata (`meta_*`).

### 3.3 Curated built-in reference allow-list
The *only* permitted references to pre-existing objects (required because a working provider must reference built-ins):
- default authorization + invalidation flows,
- the default signing key (instance self-signed certificate),
- the standard scope mappings: `openid`, `profile`, `email`, `offline_access` (the last flagged — enables refresh tokens).

Note: in authentik, **OAuth2 scopes ARE `ScopeMapping` property-mapping objects**, so "select scopes" = "reference built-in scope mappings." That is why referencing the curated built-ins is permitted while *creating* new property mappings is BLOCKed. (Stable identifiers for these built-ins: **verify in Phase 0, §5.1**; fall back to slug-matching if UUIDs vary per instance.)

Residual accepted risk: if the operator has themselves modified a default flow/scope-mapping to be unsafe, the agent inherits that — a pre-existing instance-config risk, out of the agent's threat model (the agent can't *choose* a different flow).

### 3.4 Structural validator rules (from v1 §11 gates)
- Parse **all** YAML documents (`parseAllDocuments`), not just the first (multi-doc bypass).
- Reject non-object `attrs`.
- Case-normalize model names before allow-list lookup.

## 4. Credential-free handoff

All artifacts are **server-computed** (trusted MCP code over live reads), never agent-narrated. The agent supplies only the blueprint YAML (data); the residual trust hole is scope-selection (the agent chooses which objects the blueprint touches), addressed by the non-collapsible object list below.

- **Trusted diff:** proposed vs current instance state, computed via read calls. Presentation forces attention: a **non-collapsible full object list** (type + name, unexpected models flagged) so a snuck-in object can't hide; ALLOW+FLAG trust attributes highlighted; FORCE/PASS fields shown read-only/greyed (visible, not collapsed) so the object set's completeness is obvious. (Diff/undo fidelity from read APIs: **verify in Phase 0, §5.4**.)
- **Trusted undo snapshot:** export current state of affected objects → a restore-point blueprint. Honest reversibility taxonomy: clean for pure config (same UUID); lossy for delete/recreate (UUID churn breaks references); impossible for secret rotation and external side-effects (SCIM deprovisioning, webhooks). The UI states this plainly.
- **Irreversible-op flagging:** destructive entries (`state: absent` on sources/providers, crypto) are flagged and steered to a manual host-CLI path — never part of the smooth handoff.
- **Apply handoff:** output = the validated blueprint + trusted diff + undo blueprint + the **exact operator-run apply command** (`ak`-CLI or, if none, a curl/UI step — **verify in Phase 0, §5.2**). The MCP never applies.
- **Honesty guardrails (anti-false-confidence):** no one-click apply; the summary states "validated as mechanically safe; you remain responsible for the flagged attributes and the object list; this tool will not apply the change"; active-engagement confirm (e.g., acknowledge the object count).

## 5. Phase 0 — must-verify probes (run BEFORE writing validator code)

Per the verify-before-build mandate. Cheapest probe per assumption:
1. **Stable slugs/UUIDs** for default flows / signing key / scope mappings (else slug-match fallback) — list them on the live instance.
2. **Operator CLI apply path** exists (`ak blueprint apply <file>`?) — try it; else fall back to a curl/UI handoff.
3. **Exact field names + scope representation** on the OAuth2/SAML provider serializers (scopes = property mappings) — inspect `schema.yml` / a live provider.
4. **Diff/undo fidelity** from read APIs — fetch a provider, confirm enough state is exposed to diff + rebuild.
5. **Multi-document blueprint** parsing — confirm authentik applies multi-doc, so `parseAllDocuments` is required.

Probe outcomes feed the concrete plan (field names, identifiers, apply command).

## 6. Testing approach

- Validator: pure-function unit tests (`node --test`), allow-list + each BLOCK/FORCE/CAP/ALLOW-FLAG/PASS bin, the curated-reference rule, the external-reference rejection, multi-doc, non-object attrs, case-normalization. Type-clean under `noUncheckedIndexedAccess` (run `tsc --noEmit`).
- Diff/undo/flagging: tested against the live dev instance (integration), like v1's bootstrap verification.
- Handoff: assert the MCP holds no write/apply credential and exposes no apply tool.

## 7. Deferred (v3)
Trust-Policy pre-registry + match-confirmation handoff; optionally automated apply — *only* if the minting/approval/audit path lives outside the config plane it can mutate (PDP/CDP separation).
