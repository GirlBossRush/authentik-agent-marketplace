/**
 * @file Default-deny YAML-tag walker. Walks a parsed Blueprint AST, rejecting
 * every YAML tag except the curated `!Find` / `!KeyOf` references and extracting
 * those references' targets so the validator can curate-check them.
 */

import { isMap, isSeq, isPair, isScalar, isNode, type Node } from "yaml";

import { isObject } from "#predicates";

/**
 * Default-deny allow-list of YAML tags this validator understands AND can prove
 * safe. ANY node carrying a non-empty tag outside this set is rejected; we
 * enumerate only permitted tags, never dangerous ones. This structurally
 * closes whole classes of bypass (!FindObject, !Context, !Format, !Env, …).
 *
 * yaml v2 normalizes a local tag like `!Find` to the resolved form `!Find`
 * (handle/suffix); we compare against that exact string.
 */
const PERMITTED_TAGS: ReadonlySet<string> = new Set(["!Find", "!KeyOf"]);

/**
 * A tagged reference whose target we must curate-check.
 *  - For !Find: one entry per condition value (the scalar at index 1 of each
 *    [field, value] pair), each AND-combined server-side, so EVERY one matters.
 *  - For !KeyOf: the scalar id, which must reference an `id` defined within this
 *    same blueprint (self-contained).
 */
export interface TaggedRef {
    tag: "!Find" | "!KeyOf";
    /** The resolved target string (scope slug, flow slug, signing-key name, or KeyOf id). */
    targetValue: string;
}

/**
 * Walk a yaml v2 Document AST, enforcing default-deny on tags and extracting
 * the curate-checkable target values from permitted (!Find / !KeyOf) nodes.
 *
 * Returns the collected refs and any structural violations found. NEVER throws:
 * every index access is guarded with isSeq/isScalar/isMap/isPair first, and the
 * caller additionally wraps this in try/catch.
 *
 * Note: yaml v2 uses .items on both YAMLMap (Pair objects) and YAMLSeq (child
 * nodes). Use the isMap/isSeq/isPair helpers — there is no "pairs" property.
 */
export function collectTaggedRefs(node: Node | null | undefined): {
    refs: TaggedRef[];
    violations: string[];
} {
    const refs: TaggedRef[] = [];
    const violations: string[] = [];
    if (!isNode(node)) return { refs, violations };

    /** The resolved YAML tag on a node, or "" if untagged/absent. */
    function nodeTag(n: unknown): string {
        return isObject(n) && typeof n.tag === "string" ? n.tag : "";
    }

    /**
     * Validate and extract a !Find node. The ONLY understood shape mirrors
     * authentik's `Find.__init__`:
     *   !Find [ <model>, [field, scalar], [field, scalar], ... ]
     * - must be a sequence
     * - first item is the model name (scalar)
     * - each remaining item is a [field, scalar] pair (a 2-element sequence
     *   whose value at index 1 is a scalar)
     * Any deviation is a hard reject; we extract every condition value (all are
     * AND-combined server-side) so each is curate-checked.
     */
    function extractFind(n: Node): void {
        if (!isSeq(n)) {
            violations.push(
                "!Find must be a sequence [model, [field, value], ...]",
            );

            return;
        }

        const items = n.items;

        if (items.length < 2) {
            violations.push(
                "!Find must have a model and at least one [field, value] condition",
            );

            return;
        }

        const modelNode = items[0];

        // Default-deny: the understood `!Find` resolves at apply time
        // (common.py `Find._get_instance` `.resolve()`s any YAMLTag in the
        // model name and in BOTH halves of every condition). A nested tag here
        // is attacker-controlled lookup/IO (e.g. !Context model, !File field) —
        // reject any non-empty tag in the model / field / value positions. The
        // understood `!Find` contains ONLY plain, untagged scalars.
        if (nodeTag(modelNode) !== "") {
            violations.push(
                `!Find model name must be a plain untagged scalar, got tag "${nodeTag(modelNode)}"`,
            );

            return;
        }

        if (!(isScalar(modelNode) && typeof modelNode.value === "string")) {
            violations.push("!Find model name must be a scalar string");

            return;
        }

        // Each remaining item is a condition: [field, scalar].
        for (let i = 1; i < items.length; i++) {
            const cond = items[i];

            if (!isSeq(cond)) {
                violations.push(
                    "!Find condition must be a [field, value] sequence",
                );

                return;
            }

            if (cond.items.length !== 2) {
                violations.push(
                    "!Find condition must be exactly [field, value]",
                );

                return;
            }

            const fieldNode = cond.items[0];
            const valNode = cond.items[1];

            // Default-deny tags on BOTH items of the condition (field + value).
            if (nodeTag(fieldNode) !== "") {
                violations.push(
                    `!Find condition field must be a plain untagged scalar, got tag "${nodeTag(fieldNode)}"`,
                );

                return;
            }

            if (nodeTag(valNode) !== "") {
                violations.push(
                    `!Find condition value must be a plain untagged scalar, got tag "${nodeTag(valNode)}"`,
                );

                return;
            }

            if (!(isScalar(fieldNode) && typeof fieldNode.value === "string")) {
                violations.push(
                    "!Find condition field must be a scalar string",
                );

                return;
            }

            if (!isScalar(valNode)) {
                violations.push("!Find condition value must be a scalar");

                return;
            }

            if (typeof valNode.value !== "string") {
                violations.push(
                    "!Find condition value must be a scalar string",
                );

                return;
            }
            refs.push({ tag: "!Find", targetValue: valNode.value });
        }
    }

    function walk(n: Node | null | undefined): void {
        if (!isNode(n)) return;

        const tag = typeof n.tag === "string" ? n.tag : "";

        if (tag !== "") {
            if (!PERMITTED_TAGS.has(tag)) {
                // Default-deny: any unrecognized/unsafe tag is a hard reject.
                violations.push(
                    `tag "${tag}" is not permitted (only !Find and !KeyOf are allowed)`,
                );

                // Do not recurse into the rejected node — its shape is untrusted.
                return;
            }

            if (tag === "!Find") {
                extractFind(n);

                // extractFind already validated the shape and recursed where safe.
                return;
            }

            if (tag === "!KeyOf") {
                if (isScalar(n) && typeof n.value === "string") {
                    refs.push({ tag: "!KeyOf", targetValue: n.value });
                } else {
                    violations.push(
                        "!KeyOf must be a scalar id referencing an entry in this blueprint",
                    );
                }

                return;
            }
        }

        // walk and recurse are mutually recursive; function declarations hoist,
        // so this call is safe at runtime regardless of textual order.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        recurse(n);
    }

    function recurse(n: Node): void {
        if (isMap(n)) {
            for (const pair of n.items) {
                if (isPair(pair)) {
                    walk(pair.key as Node);
                    walk(pair.value as Node);
                }
            }
        } else if (isSeq(n)) {
            for (const item of n.items) {
                walk(item as Node);
            }
        } else if (isPair(n)) {
            walk(n.key as Node);
            walk(n.value as Node);
        }
    }

    walk(node);

    return { refs, violations };
}
