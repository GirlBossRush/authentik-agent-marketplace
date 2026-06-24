---
name: flows-stages
description: >
  Design and modify Flows and the Stages bound to them — the step-by-step
  sequences for authentication, enrollment, recovery, unenrollment, and
  configuration. Use when a user wants to change what happens during login or
  signup: add a captcha, combine username and password onto one page, add a
  consent or email-verification step, build a self-service enrollment or password
  recovery flow, or reorder stages. Covers stage and policy bindings and flow
  execution order. MFA enrollment specifics live in authenticators-mfa.
---

# authentik flows and stages

## Purpose

Flows are authentik's login and lifecycle pipelines; Stages are the individual
steps inside them, attached by ordered bindings. Almost every "I want my login
page to do X" request is a flow-and-stage change. This skill builds and edits
flows, adds and orders stages, and attaches the policies that decide whether a
stage runs.

## When to invoke

- "I want a captcha on my login page."
- "Put the password field on the same page as the username field."
  (identification stage options)
- "Add an email verification / consent step to signup."
- "Build a self-service enrollment flow" or "a password recovery flow."
- "Change the order of steps during login" or "skip a stage for some users."

Not this skill: configuring the authenticator devices themselves
(authenticators-mfa), the policy expressions in depth
(policies-rbac), or the external login button's upstream config
(sources).
