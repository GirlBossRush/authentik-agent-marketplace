/** @file Small shared type-guard predicates used across the blueprint helpers. */

/**
 * Narrow an unknown value to a non-null object. `typeof x === "object"` already
 * excludes `undefined`, and the `x !== null` check excludes `null`, so this is
 * safe to use in place of a loose `x != null && typeof x === "object"` check.
 *
 * Note: this is true for arrays too — where the caller means "object but not
 * array", combine it with `!Array.isArray(x)`.
 */
export function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
}
