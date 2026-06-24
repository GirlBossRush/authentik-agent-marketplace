---
name: backend
description: >
    Run and work on authentik's Python/Django backend during development. Covers
    starting the backend API server and the background worker, creating and
    applying database migrations, and the common management commands a contributor
    runs while changing backend code. Use when someone wants to run the backend dev
    server, generate or apply migrations, or execute a Django management command
    against their local instance.
---

# authentik backend development

## Purpose

The backend is the Django server plus a background worker. Day-to-day backend
work means running those processes, and keeping the database schema in sync by
generating migrations when models change and applying them. This skill covers
running the backend and the migration workflow.

## When to invoke

- "Run the backend dev server."
- "Run migrations" or "apply the latest migrations."
- "I changed a model — how do I generate a migration?"
- "Start the worker" or "my background tasks aren't processing locally."
- "Run a Django management command against my local instance."

Not this skill: first-time environment setup (dev-environment), the web UI
server (frontend), or running the test suites (testing).
