/**
 * @file Trusted, server-computed diff between a proposed blueprint and the live
 * authentik instance — the read-only half of the credential-free "prepare to
 * apply" handoff.
 *
 * Security property (the reason this lives server-side, not in the agent): the
 * diff emits exactly ONE {@link DiffObject} per blueprint entry — the FULL
 * object list, nothing collapsed or omitted. An object the agent tries to sneak
 * in is therefore always surfaced to the operator. Each object is classified by
 * reading the live instance (via {@link findLiveObject}), never by trusting the
 * blueprint's own claims about current state.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import {
    findLiveObject,
    formatIdentifier,
    type ParsedEntry,
} from "#blueprint/live-lookup";
import type { Ak } from "#client";

/** The classification of one blueprint entry against the live instance. */
export interface DiffObject {
    /** The entry's model. */
    model: string;
    /** A human-readable identifier for the object (the entry's identifiers). */
    identifier: string;
    /** `create` if absent live; `update`/`unchanged` if present. */
    status: "create" | "update" | "unchanged";
    /** Per-field before/after, present only for `update`. */
    changedFields?: Record<string, { from: unknown; to: unknown }>;
    /**
     * `true` when existence could NOT be positively confirmed — a non-200 read,
     * an unmapped model, or a truncated provider list with no match on the
     * fetched page. The `status` is still emitted best-effort (typically
     * `create`), but this flag tells the operator to review manually rather than
     * trust the classification.
     */
    unexpected?: boolean;
}

/** The full, un-collapsed diff: one entry in → one object out. */
export interface BlueprintDiff {
    objects: DiffObject[];
}

/** Structural equality sufficient for blueprint attr values (JSON-shaped). */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== "object") return false;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;

        return a.every((item, i) => deepEqual(item, b[i]));
    }

    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);

    for (const key of keys) {
        if (!deepEqual(ao[key], bo[key])) return false;
    }

    return true;
}

/** Compare the entry's attrs against the live object, field by field. */
function diffAttrs(
    live: Record<string, unknown>,
    attrs: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | undefined {
    const changed: Record<string, { from: unknown; to: unknown }> = {};

    for (const [key, to] of Object.entries(attrs)) {
        const from = live[key];

        if (!deepEqual(from, to)) {
            changed[key] = { from, to };
        }
    }

    return Object.keys(changed).length > 0 ? changed : undefined;
}

/**
 * Compute the trusted diff: one {@link DiffObject} per blueprint entry,
 * classified `create` / `update` / `unchanged` by reading the live instance.
 *
 * The output is intentionally complete — every entry produces an object, so the
 * operator always sees the full set of changes a blueprint would make.
 */
export async function computeDiff(
    entries: ParsedEntry[],
    ak: Ak,
): Promise<BlueprintDiff> {
    const objects: DiffObject[] = [];

    for (const entry of entries) {
        const identifier = formatIdentifier(entry.identifiers);
        const attrs = entry.attrs ?? {};
        const result = await findLiveObject(entry, ak);

        if (result.kind !== "found") {
            // Best-effort `create`, but flag the entries where we could not
            // positively confirm absence so the operator reviews manually
            // instead of trusting a possibly-wrong `create`.
            objects.push({
                model: entry.model,
                identifier,
                status: "create",
                ...(result.kind === "unconfirmed" ? { unexpected: true } : {}),
            });
            continue;
        }

        const live = result.live;
        const changedFields = diffAttrs(live, attrs);

        if (changedFields) {
            objects.push({
                model: entry.model,
                identifier,
                status: "update",
                changedFields,
            });
        } else {
            objects.push({
                model: entry.model,
                identifier,
                status: "unchanged",
            });
        }
    }

    return { objects };
}
