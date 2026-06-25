/**
 * @file Validate a proposed authentik Blueprint without applying it — the v2
 * policy-enforcement point.
 *
 * This is the orchestrator. It owns the top-level flow (raw scans → parse →
 * per-entry attribute binning → whole-document tag walk) and delegates the hard
 * parts:
 *   - the allow-lists and per-attribute rules live in {@link "#blueprint/policy"};
 *   - the default-deny YAML-tag walk lives in {@link "#blueprint/tags"};
 *   - curate-checking a reference target lives in {@link "#blueprint/refs"};
 *   - parsing a token-validity duration lives in {@link "#blueprint/duration"}.
 *
 * It never throws on hostile or malformed input: a parse or walk error becomes a
 * violation, not an exception.
 */

import { parseDocument, isNode, type Document, type Node } from "yaml";

import { ALLOWED_MODELS, MODEL_ATTRS } from "#blueprint/policy";
import { collectTaggedRefs } from "#blueprint/tags";
import { checkRef, checkRefAttr, attrValueNode } from "#blueprint/refs";
import { parseTokenDuration } from "#blueprint/duration";

export interface FlagItem {
    entryIndex: number;
    model: string;
    attr: string;
    value: unknown;
}

export interface BlueprintValidation {
    ok: boolean;
    violations: string[];
    flags: FlagItem[];
}

export function validateBlueprint(content: string): BlueprintValidation {
    const violations: string[] = [];
    const flags: FlagItem[] = [];

    // --- Forbidden tag: !Env (raw scan before parse) ---
    if (/!Env\b/.test(content)) {
        violations.push("forbidden tag !Env (can read environment/secrets)");
    }

    // --- Multi-document rejection (raw scan) ---
    // authentik uses single-document YAML load; a `---` separator means a
    // second document is present that would be silently ignored by parse().
    if (/\n---(\s|$)/.test(content)) {
        violations.push(
            "multi-document YAML is not permitted; supply a single document",
        );

        return { ok: false, violations, flags };
    }

    // --- Parse with tag preservation ---
    let pdoc: Document;

    try {
        pdoc = parseDocument(content, { logLevel: "silent" });
    } catch (err) {
        return {
            ok: false,
            violations: [`unparseable YAML: ${(err as Error).message}`],
            flags,
        };
    }

    if (pdoc.errors.length > 0) {
        return {
            ok: false,
            violations: pdoc.errors.map((e) => `YAML error: ${e.message}`),
            flags,
        };
    }

    // Parse errors handled; get plain JSON for value checks
    let doc: unknown;

    try {
        doc = pdoc.toJSON() as unknown;
    } catch (err) {
        return {
            ok: false,
            violations: [`unparseable YAML: ${(err as Error).message}`],
            flags,
        };
    }

    const entries = (doc as { entries?: unknown })?.entries;

    if (!Array.isArray(entries)) {
        violations.push("blueprint has no `entries` list");

        return { ok: false, violations, flags };
    }

    // --- Collect the set of entry `id`s for self-contained !KeyOf checks ---
    const definedIDs = new Set<string>();

    for (const entry of entries) {
        const id = (entry as { id?: unknown })?.id;

        if (typeof id === "string" && id !== "") {
            definedIDs.add(id);
        }
    }

    entries.forEach((entry: unknown, i: number) => {
        const raw = entry as Record<string, unknown>;

        const rawModel = typeof raw?.model === "string" ? raw.model : "";

        if (!rawModel) {
            violations.push(`entry ${i}: missing model`);

            return;
        }

        // Normalize model name to lowercase
        const model = rawModel.toLowerCase();

        // --- Allow-list check ---
        if (!ALLOWED_MODELS.has(model)) {
            violations.push(
                `entry ${i}: model "${model}" is not in the allow-list (only curated models are permitted)`,
            );

            return; // skip attr checking for unknown model
        }

        // --- attrs must be a plain object ---
        const rawAttrs = raw.attrs;

        if (
            rawAttrs === null ||
            typeof rawAttrs !== "object" ||
            Array.isArray(rawAttrs)
        ) {
            violations.push(
                `entry ${i}: attrs must be a plain object, got ${Array.isArray(rawAttrs) ? "array" : typeof rawAttrs}`,
            );

            return;
        }

        const attrs = rawAttrs as Record<string, unknown>;
        const modelRules = MODEL_ATTRS[model];

        for (const [key, val] of Object.entries(attrs)) {
            // client_secret and other obvious secret fields are always denied
            if (
                key === "client_secret" ||
                key === "token" ||
                key === "password" ||
                key === "key_data"
            ) {
                violations.push(
                    `entry ${i}: secret field "${key}" must be omitted (auto-generated)`,
                );
                continue;
            }

            const rule = modelRules?.[key];

            if (rule === undefined) {
                // Attribute not in the allow-list for this model
                violations.push(
                    `entry ${i}: attribute "${key}" is not permitted for model "${model}"`,
                );
                continue;
            }

            switch (rule.bin) {
                case "pass":
                    // Always fine
                    break;

                case "flag":
                    flags.push({ entryIndex: i, model, attr: key, value: val });
                    break;

                case "force": {
                    // A forced attribute must be a plain untagged literal. The
                    // plain-JSON projection loses tags: an unresolved
                    // `!KeyOf <id>` projects to the bare string `<id>`, so a
                    // decoy entry whose `id` equals the forced literal would
                    // sail past the JSON comparison — yet at apply time
                    // authentik resolves the reference to a PK, NOT the safe
                    // forced value. Reject any tag BEFORE the JSON comparison.
                    const fnode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );

                    if (
                        isNode(fnode) &&
                        typeof fnode.tag === "string" &&
                        fnode.tag !== ""
                    ) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a plain untagged literal (a forced/capped attribute may not be a reference), got tag "${fnode.tag}"`,
                        );
                        break;
                    }

                    // Value must deep-equal the policy's required value
                    if (JSON.stringify(val) !== JSON.stringify(rule.value)) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be ${JSON.stringify(rule.value)} (policy-enforced), got ${JSON.stringify(val)}`,
                        );
                    }
                    break;
                }

                case "ref": {
                    // Relationship field: REQUIRE a permitted reference (curated
                    // !Find or in-blueprint !KeyOf), rejecting plain literals and
                    // non-permitted tags. The referenced target's curated-only
                    // restriction is enforced separately by the tag walk.
                    const refNode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );
                    const msg = checkRefAttr(refNode);

                    if (msg !== null) {
                        violations.push(
                            `entry ${i}: attribute "${key}" ${msg}`,
                        );
                    }
                    break;
                }

                case "cap": {
                    // Same soundness guard as `force`: a capped attribute must
                    // be a plain untagged literal, never a reference. The
                    // plain-JSON projection loses tags, so an unresolved tag
                    // could project to a value that passes the numeric cap yet
                    // resolves to something else entirely at apply time.
                    const cnode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );

                    if (
                        isNode(cnode) &&
                        typeof cnode.tag === "string" &&
                        cnode.tag !== ""
                    ) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a plain untagged literal (a forced/capped attribute may not be a reference), got tag "${cnode.tag}"`,
                        );
                        break;
                    }
                    // Value must be a non-negative number ≤ maxSeconds.
                    const maxSec = rule.maxSeconds ?? Infinity;
                    const num = parseTokenDuration(val);

                    if (num === null || num < 0 || num > maxSec) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a non-negative value of at most ${maxSec}s`,
                        );
                    }
                    break;
                }
            }
        }
    });

    // --- Tagged reference checking: walk the full document AST ---
    // Default-deny on tags. Never throw on hostile/malformed input: any error
    // becomes a violation, never an exception.
    try {
        if (isNode(pdoc.contents)) {
            const { refs, violations: tagViolations } = collectTaggedRefs(
                pdoc.contents,
            );
            violations.push(...tagViolations);

            for (const ref of refs) {
                const msg = checkRef(ref, definedIDs);

                if (msg !== null) {
                    violations.push(msg);
                }
            }
        }
    } catch (err) {
        violations.push(
            `tag validation failed: ${(err as Error).message ?? String(err)}`,
        );
    }

    return { ok: violations.length === 0, violations, flags };
}
