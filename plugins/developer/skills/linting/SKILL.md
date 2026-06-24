---
name: linting
description: >
    Run authentik's linters, formatters, and type checkers across the Python
    backend and the web frontend. Covers the lint and format commands, the type
    checkers for both languages, applying autofixes, and matching what CI enforces
    so a change passes checks before it is pushed. Use when a contributor wants to
    run the linter, run the type checker, auto-format code, or resolve a failing
    lint/type CI check.
---

# authentik linting and type checking

## Purpose

Before a change can merge it has to pass the same lint, format, and type checks
CI runs. Those span two languages with different tools. This skill runs the
linters and type checkers, applies autofixes where possible, and reproduces a CI
check failure locally so it can be fixed in advance.

## When to invoke

- "Run the linter" / "run the formatter."
- "Run the type checker."
- "Auto-fix lint and formatting issues."
- "A lint or type check is failing in CI — how do I reproduce and fix it?"

Not this skill: running tests (testing) or PR submission conventions
(contributing).
