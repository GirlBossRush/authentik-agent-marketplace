/**
 * @file Trusted, server-computed diff between a proposed blueprint and the live
 * authentik instance — the read-only half of the credential-free "prepare to
 * apply" handoff.
 *
 * Security property (the reason this lives server-side, not in the agent): the
 * diff emits exactly ONE {@link DiffObject} per blueprint entry — the FULL
 * object list, nothing collapsed or omitted. An object the agent tries to sneak
 * in is therefore always surfaced to the operator. Each object is classified by
 * reading the live instance (GET the model's list, then matching on the entry's
 * identifiers), never by trusting the blueprint's own claims about current state.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import type { Ak } from "./client.ts";

/**
 * A single parsed blueprint entry. Mirrors the shape the validator works with:
 * a model name, the identifiers that locate the live object, and the attrs the
 * blueprint would set.
 */
export interface ParsedEntry {
    /** Django app-label model, e.g. `authentik_core.application`. */
    model: string;
    /** Fields that uniquely locate the object (e.g. `{ slug: "grafana" }`). */
    identifiers: Record<string, unknown>;
    /** Attributes the blueprint would write. Only these are compared. */
    attrs?: Record<string, unknown>;
}

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
     * Reserved: set by downstream policy when an object is unexpected (e.g. a
     * model outside the allow-list). Carried here so Task 5 can surface it.
     */
    unexpected?: boolean;
}

/** The full, un-collapsed diff: one entry in → one object out. */
export interface BlueprintDiff {
    objects: DiffObject[];
}

/**
 * Maps a blueprint model to its read-only list endpoint and the query
 * parameters the endpoint accepts as exact filters. Identifiers not listed here
 * fall back to client-side matching against the returned results.
 */
const MODEL_LIST: Readonly<
    Record<string, { path: string; filterParams: readonly string[] }>
> = {
    "authentik_core.application": {
        path: "/core/applications/",
        filterParams: ["slug"],
    },
    "authentik_providers_oauth2.oauth2provider": {
        path: "/providers/oauth2/",
        // No exact `name` filter exposed; match client-side on the results.
        filterParams: [],
    },
    "authentik_providers_saml.samlprovider": {
        path: "/providers/saml/",
        filterParams: [],
    },
};

/** Render an identifiers map as a stable, readable string for the operator. */
function formatIdentifier(identifiers: Record<string, unknown>): string {
    const parts = Object.entries(identifiers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`);
    return parts.join(",");
}

/** True if `obj` matches every identifier field exactly. */
function matchesIdentifiers(
    obj: Record<string, unknown>,
    identifiers: Record<string, unknown>,
): boolean {
    for (const [key, value] of Object.entries(identifiers)) {
        if (obj[key] !== value) return false;
    }
    return true;
}

/** Extract the `results` array from a DRF list response, defensively. */
function extractResults(data: unknown): Record<string, unknown>[] {
    if (data && typeof data === "object" && "results" in data) {
        const results = (data as { results: unknown }).results;
        if (Array.isArray(results)) {
            return results.filter(
                (r): r is Record<string, unknown> =>
                    r != null && typeof r === "object",
            );
        }
    }
    return [];
}

/**
 * Find the live object matching an entry, or `null` if none exists.
 *
 * Always GETs the model's list endpoint (passing supported identifier fields as
 * query filters to narrow the result set) and then re-checks every identifier
 * client-side, so a non-filtering or over-broad endpoint can never produce a
 * false match.
 */
async function findLiveObject(
    entry: ParsedEntry,
    ak: Ak,
): Promise<Record<string, unknown> | null> {
    const mapping = MODEL_LIST[entry.model];
    if (!mapping) return null;

    const query: Record<string, string> = {};
    for (const param of mapping.filterParams) {
        const value = entry.identifiers[param];
        if (value !== undefined && value !== null) {
            query[param] = String(value);
        }
    }

    const res = await ak.request("GET", mapping.path, { query });
    if (res.status !== 200) return null;

    const results = extractResults(res.data);
    return (
        results.find((obj) => matchesIdentifiers(obj, entry.identifiers)) ?? null
    );
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
        const live = await findLiveObject(entry, ak);

        if (live === null) {
            objects.push({ model: entry.model, identifier, status: "create" });
            continue;
        }

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
