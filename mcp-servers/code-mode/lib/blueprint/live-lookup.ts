/**
 * @file Shared read-only instance lookup for the blueprint diff/undo readers.
 *
 * Both readers answer the same question — "does the object this entry would
 * touch already exist live, and what are its current field values?" — by GETting
 * the model's list endpoint and matching on the entry's identifiers. This module
 * is the single source of that logic (the model→endpoint map, the DRF response
 * shape handling, and the existence classification) so diff and undo can't drift
 * apart.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import { isObject } from "#predicates";
import type { Ak } from "#client";

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
    /** `absent` marks a delete; undefined for a create/update. */
    state?: string;
}

/**
 * The outcome of looking up an entry against the live instance.
 *
 * `found` carries the live object. `absent` means existence was positively
 * confirmed to be false (a 200 read over a complete result window with no
 * match). `unconfirmed` means existence could NOT be verified — a non-200 read,
 * an unmapped model, or a client-side-matched page that was truncated — so the
 * caller must surface it for manual review rather than trust the classification.
 */
export type LookupResult =
    | { kind: "found"; live: Record<string, unknown> }
    | { kind: "absent" }
    | { kind: "unconfirmed" };

/**
 * Maps a blueprint model to its read-only list endpoint and the query
 * parameters the endpoint accepts as exact filters. Identifiers not listed here
 * fall back to client-side matching against the returned results.
 */
const MODEL_LIST: Readonly<
    Record<
        string,
        {
            path: string;
            filterParams: readonly string[];
            /**
             * When the endpoint exposes no exact identifier filter, matching is
             * client-side over a single fetched page. Request the largest page
             * the API allows so the match window is as wide as possible.
             */
            wideFetch?: boolean;
        }
    >
> = {
    "authentik_core.application": {
        path: "/core/applications/",
        filterParams: ["slug"],
    },
    "authentik_providers_oauth2.oauth2provider": {
        path: "/providers/oauth2/",
        // No exact `name` filter exposed; match client-side on the results.
        filterParams: [],
        wideFetch: true,
    },
    "authentik_providers_saml.samlprovider": {
        path: "/providers/saml/",
        filterParams: [],
        wideFetch: true,
    },
};

/** The largest page size authentik's DRF list endpoints accept. */
const MAX_PAGE_SIZE = 100;

/** Render an identifiers map as a stable, readable string for the operator. */
export function formatIdentifier(identifiers: Record<string, unknown>): string {
    return Object.entries(identifiers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(",");
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
            return results.filter(isObject);
        }
    }

    return [];
}

/**
 * True if a DRF list response indicates more pages exist beyond the one
 * fetched. authentik's pagination object carries a `next` page number that is
 * `0` (falsy) on the last page; a truthy value means the result window we
 * matched against is incomplete.
 */
function hasMorePages(data: unknown): boolean {
    if (data && typeof data === "object" && "pagination" in data) {
        const pagination = (data as { pagination: unknown }).pagination;

        if (
            pagination &&
            typeof pagination === "object" &&
            "next" in pagination
        ) {
            const next = (pagination as { next: unknown }).next;
            if (typeof next === "number") return next > 0;
            // DRF's default paginator uses a URL string for `next`.
            if (typeof next === "string") return next.length > 0;

            return Boolean(next);
        }
    }

    return false;
}

/**
 * Look up the live object matching an entry.
 *
 * Always GETs the model's list endpoint (passing supported identifier fields as
 * query filters to narrow the result set) and then re-checks every identifier
 * client-side, so a non-filtering or over-broad endpoint can never produce a
 * false match.
 *
 * @returns `unconfirmed` rather than guessing whenever existence cannot be
 * positively verified: an unmapped model, a non-200 read, or a client-side
 * match over a page that was truncated (more pages exist) with no hit — in
 * which case the object could live on a page we never fetched.
 */
export async function findLiveObject(
    entry: ParsedEntry,
    ak: Ak,
): Promise<LookupResult> {
    const mapping = MODEL_LIST[entry.model];
    if (!mapping) return { kind: "unconfirmed" };

    const query: Record<string, string | number> = {};

    for (const param of mapping.filterParams) {
        const value = entry.identifiers[param];

        if (value !== undefined && value !== null) {
            query[param] = String(value);
        }
    }

    // Endpoints without an exact identifier filter are matched client-side over
    // a single page; widen that page to the API maximum.
    if (mapping.wideFetch) {
        query.page_size = MAX_PAGE_SIZE;
    }

    const res = await ak.request("GET", mapping.path, { query });
    if (res.status !== 200) return { kind: "unconfirmed" };

    const results = extractResults(res.data);
    const match = results.find((obj) =>
        matchesIdentifiers(obj, entry.identifiers),
    );
    if (match) return { kind: "found", live: match };

    // No match on the fetched page. If this was a client-side match over a
    // truncated list, the object may live on an unfetched page — can't confirm.
    if (mapping.wideFetch && hasMorePages(res.data)) {
        return { kind: "unconfirmed" };
    }

    return { kind: "absent" };
}
