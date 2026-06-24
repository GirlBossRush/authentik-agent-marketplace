---
name: testing
description: >
    Run authentik's test suites during development. Covers the Python unit and
    integration tests, the browser-based end-to-end (e2e) tests, and the web
    frontend tests — including running a single test or a subset, and the services
    those tests require. Use when a contributor wants to run the Python e2e tests,
    run a focused test while iterating, or understand why a test suite won't start
    locally.
---

# authentik testing

## Purpose

authentik has several test layers: Python unit and integration tests, a
browser-driven e2e suite, and frontend tests. Each has its own command and its
own service prerequisites. This skill runs the right suite, narrows a run to a
single test while iterating, and sorts out the setup a suite needs.

## When to invoke

- "Run the Python e2e tests."
- "Run the backend unit tests" or "run just this one test."
- "Run the web / frontend tests."
- "The e2e suite won't start" or "tests pass in CI but fail locally."

Not this skill: linting and type checking (linting), or setting up the
environment the tests run against (dev-environment, backend).
