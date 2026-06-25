# Agent security model: overview (for review)

**Audience:** a developer reviewing the approach for the first time. This is the orientation layer; the detailed spec is [`agent-security-model.md`](./agent-security-model.md) and the authentik findings behind it are in [`authentik-security-findings.md`](./authentik-security-findings.md).

## What we're building

An AI coding agent (Claude Code) that can help an operator run authentik, from "hey Claude, set me up authentik" through to a production-ready deployment. Three layers exist today:

1. **Docs as `llms.txt`**: the agent retrieves current docs instead of guessing.
2. **Skills**: playbooks teaching the agent authentik's object model.
3. **Code-mode MCP**: gives the agent `search` (over the live API schema), `execute` (read), and (historically) `execute_write` against the instance, authenticated by an API token.

## Why this doc exists

While testing, the agent minted _itself_ a full-superuser API token through authentik's management shell. That's harmless on a throwaway dev box but worrying as a pattern, and it raised the question this doc answers: what should an agent be allowed to do to an identity provider, the system that guards everything else?

## Core idea

> **The agent scaffolds and verifies; it does not operate. Security comes from structural defaults the agent can't touch, not from a human approving prompts.**

Two assumptions drive everything:

- **The operator is inattentive.** They'll click "approve" without reading and paste a superuser token because it's less typing. Any control that depends on human vigilance fails. So the secure path has to be the low-friction one, or the operator routes around it.
- **The boundary must be enforced by code we control (the MCP), not by authentik's RBAC**, because RBAC isn't sufficient on its own (below).

## What we found (why RBAC alone won't do it)

We probed a live instance. Two escalation patterns, both confirmed (details + repro in `authentik-security-findings.md`):

1. **Blueprint apply ignores the caller's RBAC.** A token that can manage blueprints can apply one that creates a superuser group → "manage blueprints" = superuser.
2. **"Grant read on everything" leaks secrets.** authentik has secret-reveal permissions (codenames ending `_key`) bundled in with ordinary `view_*` perms. A naive read-only role could read every API token value _and_ every certificate private key (→ forge SAML/JWT).

Conclusion: a scoped RBAC token is necessary but not sufficient. The MCP server has to be the boundary.

## Model summary

- **Read** through a least-privilege token: an _allow-list_ of view perms with all secret-reveal (`view_*_key`) perms denied. Plus a defense-in-depth block of secret-reveal endpoints in the MCP client itself.
- **Write** only by proposing a **blueprint** (authentik's declarative YAML), which the MCP **validates** (rejects denied models, the `!Env` tag, and explicit secret fields) before anything is applied. Apply is done by a server-held identity the agent never possesses, never the agent's own token.
- **Undo** via auto-snapshotting affected objects to a blueprint before each change. This is true undo only for pure config; deletions, secret rotations, and external side-effects (e.g. SCIM deprovisioning) are not reversible, and the UI must say so.
- **Bootstrap**: "set me up" auto-provisions the scoped agent identity so the lazy admin never has the easier option of pasting a superuser token.

## Rollout

- **v1 (in progress now): "safe read, safe propose."** Scoped read token, secret-reveal blocked, blueprint _validation only_, with **no mutation path at all** (we removed `execute_write`).
- **v2:** validated blueprint _apply_ via a server-held identity; auto-snapshot undo; irreversible ops gated to a host CLI.
- **v3:** zero-touch bootstrap; short-lived write authorization via a side-channel so no token is ever pasted.

## What we'd like you to review

1. **Is "MCP-as-boundary, RBAC-as-defense-in-depth" the right call**, or should we push harder to fix/avoid the RBAC gaps upstream first?
2. **Blueprint-only writes**: are there operator workflows that blueprints can't express, where we'd be forced back to imperative API writes (and a wider attack surface)?
3. **The two authentik findings**: do you agree on severity/framing, and should they be filed as security advisories before we build v2 on top of them?
4. **Undo honesty**: is auto-snapshot-to-blueprint worth shipping given it reverses only config changes, or does partial undo create false confidence?
