---
name: events-monitoring
description: >
  Inspect authentik's event log and configure notifications. Covers the audit
  and event stream (logins, login failures, configuration changes, system tasks),
  querying and filtering it, and the notification rules plus transports (email,
  webhook, generic webhook) that alert on matching events. Use when a user wants
  to see what happened — recent failed or successful logins, who changed a setting
  — or wants to be alerted when a specific kind of event occurs.
---

# authentik events and monitoring

## Purpose

authentik records an event for security-relevant and operational activity:
authentications, failures, model changes, and system tasks. This skill queries
that event log to answer "what happened and when", and sets up notification rules
bound to event-matcher policies so the right people are alerted through the right
transport.

## When to invoke

- "Show me the last 10 failed login attempts."
- "Show me the last 10 successful logins."
- "Who changed this provider / when was this user created?"
- "Alert me by email / webhook when an admin logs in or a policy fails."
- Questions about reading, filtering, or exporting the audit log.

Not this skill: diagnosing _why_ something is broken from logs and system health
(troubleshooting), or the event-matcher policy mechanics in depth
(policies-rbac).
