---
name: frontend
description: >
  Run and work on authentik's web frontend during development. Covers starting
  the web dev server in watch mode, building the frontend bundles, and pointing
  the running build at a local or remote backend. Use when a contributor wants to
  run the frontend dev server, rebuild the web UI after changes, or troubleshoot
  why their local UI changes aren't showing up.
---

# authentik frontend development

## Purpose

The web frontend is a separate build that talks to the backend API. Working on
it means running the dev server in watch mode so changes rebuild automatically,
and knowing how to produce a production build when needed. This skill covers
running and building the frontend.

## When to invoke

- "Run the frontend dev server" / "start the web UI in watch mode."
- "Rebuild the web frontend after my changes."
- "My UI edits aren't showing up in the browser."
- "Point the frontend at a different backend."

Not this skill: the backend API the frontend calls (backend), the documentation
site (docs), or first-time setup (dev-environment).
