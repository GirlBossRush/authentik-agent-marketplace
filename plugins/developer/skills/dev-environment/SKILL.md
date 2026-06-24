---
name: dev-environment
description: >
    Set up and maintain a local authentik development environment from a source
    checkout. Covers prerequisites, installing backend (Python) and web
    (Node/pnpm) dependencies, bringing up the supporting services (PostgreSQL and
    Redis) via Docker Compose, generating local config, applying the initial
    database migrations, and creating the first admin user. Use when a contributor
    is starting from a fresh clone or their environment is broken and they need a
    working dev stack before running servers or tests.
---

# authentik dev environment

## Purpose

A working authentik checkout needs several moving parts before anything runs:
language toolchains, dependency installs, a database and Redis, local
configuration, and a migrated schema. This skill walks a contributor from a
fresh clone to a running stack, and gets a broken environment back to a known
good state.

## When to invoke

- "Set up my local authentik development environment."
- "I just cloned authentik — how do I get it running?"
- "My dependencies / database / Redis won't come up."
- "How do I create the first admin user locally?"
- "Reset my local environment to a clean state."

Not this skill: running an individual server once the environment exists
(backend, frontend, docs) or running migrations as a routine task (backend).
