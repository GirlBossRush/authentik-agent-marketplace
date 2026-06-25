/**
 * @file Curate-check references. A `ref`-binned attribute must carry a permitted
 * reference (a curated `!Find` or an in-blueprint `!KeyOf`); these helpers decide
 * whether a given reference target is curated and locate the AST node to inspect.
 */

import { isMap, isSeq, isPair, isScalar, isNode, type Node } from "yaml";

import { CURATED_REFS, EXCLUDED_SCOPES } from "#blueprint/policy";
import type { TaggedRef } from "#blueprint/tags";

/**
 * Return a violation message if a tagged reference is not curated, or null if
 * it is permitted. `definedIDs` is the set of entry `id`s in this blueprint,
 * used to validate that a !KeyOf target is self-contained.
 */
export function checkRef(
    ref: TaggedRef,
    definedIDs: ReadonlySet<string>,
): string | null {
    const { targetValue } = ref;

    if (ref.tag === "!KeyOf") {
        // A !KeyOf target must reference an `id` defined within THIS blueprint.
        if (definedIDs.has(targetValue)) {
            return null;
        }

        return `!KeyOf "${targetValue}" does not reference an entry defined in this blueprint`;
    }

    // !Find condition value — must resolve to a curated built-in.

    // Excluded scopes are explicitly blocked (checked before the allow-list).
    if (EXCLUDED_SCOPES.has(targetValue)) {
        return `external reference "${targetValue}" is not permitted (excluded scope)`;
    }

    // Curated scope mappings (managed field values)
    if (CURATED_REFS.scopeMappings.includes(targetValue as never)) {
        return null;
    }

    // Curated flows (slug values)
    if (CURATED_REFS.flows.includes(targetValue as never)) {
        return null;
    }

    // Default signing key (name value)
    if (targetValue === CURATED_REFS.defaultSigningKeyName) {
        return null;
    }

    return `external reference "${targetValue}" is not permitted (only curated built-ins may be referenced)`;
}

/**
 * Locate the YAML AST value node for `entries[i].attrs[key]`, so a `ref`-binned
 * attribute can be checked for a *tag* (the plain JSON projection loses tags:
 * an unresolved !Find / !KeyOf both look like null/string).
 *
 * Pure structural navigation; never throws (every step is guarded).
 *
 * @returns null if the path can't be resolved (callers treat that as "no node to inspect").
 */
export function attrValueNode(
    contents: Node | null,
    entryIndex: number,
    attrKey: string,
): Node | null {
    if (!isMap(contents)) return null;
    let entriesNode: Node | null = null;

    for (const pair of contents.items) {
        if (
            isPair(pair) &&
            isScalar(pair.key) &&
            pair.key.value === "entries"
        ) {
            entriesNode = (pair.value as Node) ?? null;
            break;
        }
    }

    if (!isSeq(entriesNode)) return null;
    const entryNode = entriesNode.items[entryIndex];
    if (!isMap(entryNode as Node)) return null;
    let attrsNode: Node | null = null;

    for (const pair of (entryNode as { items: unknown[] }).items) {
        if (isPair(pair) && isScalar(pair.key) && pair.key.value === "attrs") {
            attrsNode = (pair.value as Node) ?? null;
            break;
        }
    }

    if (!isMap(attrsNode)) return null;

    for (const pair of attrsNode.items) {
        if (isPair(pair) && isScalar(pair.key) && pair.key.value === attrKey) {
            return (pair.value as Node) ?? null;
        }
    }

    return null;
}

const REF_PERMITTED_TAGS: ReadonlySet<string> = new Set(["!Find", "!KeyOf"]);

/**
 * A `ref`-binned attribute REQUIRES its value to be a permitted reference: a
 * curated !Find or a !KeyOf to an id defined in this blueprint. A plain literal
 * (string/number) or a non-permitted tag is rejected here; the curated-only
 * restriction on the referenced target is enforced by the tag walk + checkRef.
 *
 * The value may be a single tagged node, or a sequence of tagged nodes (e.g.
 * `property_mappings: [!Find …, !Find …]`). An empty sequence is permitted
 * (clearing the relation).
 *
 * @returns a violation string, or null if permitted.
 */
export function checkRefAttr(node: Node | null): string | null {
    if (!isNode(node)) {
        return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
    }

    const tag = typeof node.tag === "string" ? node.tag : "";

    // A tagged node is a SINGLE reference (note: a `!Find` node is structurally
    // a YAMLSeq that carries the `!Find` tag — its tag must be inspected before
    // any isSeq() branch, or it would be misread as a plain list).
    if (tag !== "") {
        if (!REF_PERMITTED_TAGS.has(tag)) {
            return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
        }

        return null;
    }

    // An UNtagged sequence is a list of references (e.g. property_mappings):
    // each element must itself be a permitted single reference.
    if (isSeq(node)) {
        for (const item of node.items) {
            const itemTag =
                isNode(item) && typeof item.tag === "string" ? item.tag : "";

            if (
                typeof itemTag !== "string" ||
                !REF_PERMITTED_TAGS.has(itemTag)
            ) {
                return "every reference in the list must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
            }
        }

        return null;
    }

    // Untagged scalar / map → a plain literal, rejected.
    return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
}
