---
name: users-directory
description: >
  Manage users, groups, roles, and invitations in authentik's directory. Use
  when a user wants to create or deactivate accounts, organize people into
  groups, assign roles, set or reset another user's password, issue enrollment
  invitations, or inspect a specific user's group membership and attributes.
  Covers the user/group data itself; the permissions attached to roles live in
  policies-rbac, and end-to-end login flows live in flows-stages.
---

# authentik users and directory

## Purpose

This skill manages the people in authentik: user accounts, the groups that
organize them, the roles assigned to them, and the invitations that let new
users enroll. It covers the lifecycle and data of those records — creating,
editing, deactivating, and inspecting them — as the foundation that policies and
flows act on.

## When to invoke

- "Create / deactivate a user account."
- "Add these users to a group" or "what groups is this user in?"
- "Reset a specific user's password" (an admin acting on another account).
- "Send an enrollment invitation."
- "Set custom attributes on a user or group."

Not this skill: what a role is _allowed_ to do (policies-rbac),
recovering the superuser/admin account when locked out (operations),
or the self-service enrollment flow design (flows-stages).
