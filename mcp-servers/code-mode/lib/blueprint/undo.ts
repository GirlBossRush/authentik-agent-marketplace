/**
 * @file Undo snapshot + reversibility classification: the second read-only half
 * of the credential-free "prepare to apply" handoff.
 *
 * Before an operator applies a proposed blueprint, this module reads the CURRENT
 * live state of each object the blueprint would touch and emits a "restore
 * point" blueprint (YAML) that, re-applied, reverts a pure-config change. It also
 * classifies how cleanly the change can be undone:
 *
 *   - `clean`      pure attribute update of an existing object (same UUID): the
 *                  restore point sets the touched fields back to their current
 *                  values, leaving the object (and every reference to it) intact.
 *   - `lossy`      create-only: the object does not exist yet, so undo means
 *                  delete. A later recreate churns the UUID and any references, so
 *                  the data is not byte-for-byte recoverable.
 *   - `impossible` a delete (`state: absent`) or any crypto object, or any other
 *                  external side-effect: there is nothing this snapshot can do to
 *                  restore it. Always accompanied by a clear `notes` entry.
 *
 * The overall reversibility is the worst of any entry: any `impossible` wins,
 * else any `lossy`, else `clean`.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import { stringify } from "yaml";

import { isDestructiveEntry } from "#blueprint/policy";
import {
    findLiveObject,
    formatIdentifier,
    type ParsedEntry,
} from "#blueprint/live-lookup";
import type { Ak } from "#client";

/** How cleanly a proposed change can be reverted by the restore point. */
export type Reversibility = "clean" | "lossy" | "impossible";

/** The restore point plus its reversibility classification. */
export interface UndoSnapshot {
    /** A restore-point blueprint (YAML) capturing pre-apply live state. */
    blueprint: string;
    /** Worst-case reversibility across all entries (see module docs). */
    reversibility: Reversibility;
    /** Human-readable caveats, one per entry that can't be cleanly undone. */
    notes: string[];
}

/** A single entry of the emitted restore-point blueprint. */
interface RestoreEntry {
    model: string;
    identifiers: Record<string, unknown>;
    attrs: Record<string, unknown>;
}

/**
 * Build the undo snapshot for a proposed set of blueprint entries.
 *
 * For each entry, reads the object's current live state and — for a pure update
 * of an existing object — records a restore entry that sets exactly the touched
 * fields back to their current values. Classifies each entry and returns the
 * worst-case reversibility plus a note for every entry that can't be cleanly
 * undone.
 */
export async function buildUndoSnapshot(
    entries: ParsedEntry[],
    ak: Ak,
): Promise<UndoSnapshot> {
    const restoreEntries: RestoreEntry[] = [];
    const notes: string[] = [];
    let reversibility: Reversibility = "clean";

    const worsen = (next: Reversibility): void => {
        if (next === "impossible") reversibility = "impossible";
        else if (next === "lossy" && reversibility !== "impossible") {
            reversibility = "lossy";
        }
    };

    for (const entry of entries) {
        const id = formatIdentifier(entry.identifiers);

        // Deletes and crypto (and any other destructive op) cannot be undone by
        // re-applying a config snapshot — there is no live state to capture.
        if (isDestructiveEntry(entry.model, entry.state)) {
            worsen("impossible");
            notes.push(
                `${entry.model} (${id}): cannot be undone — destructive change (delete or crypto) or external side-effect`,
            );
            continue;
        }

        const lookup = await findLiveObject(entry, ak);
        const attrs = entry.attrs ?? {};

        if (lookup.kind !== "found") {
            // Create-only (or existence unconfirmed): applying the blueprint
            // creates the object, so undo is a delete. A later recreate churns
            // the UUID and any references.
            worsen("lossy");
            notes.push(
                `${entry.model} (${id}): create-only — undo is a delete; recreating later churns the object's UUID and any references`,
            );
            continue;
        }

        // Pure attribute update of an existing object (same UUID): the restore
        // point sets exactly the touched fields back to their current values.
        const live = lookup.live;
        const restoreAttrs: Record<string, unknown> = {};

        for (const key of Object.keys(attrs)) {
            restoreAttrs[key] = live[key];
        }
        restoreEntries.push({
            model: entry.model,
            identifiers: entry.identifiers,
            attrs: restoreAttrs,
        });
    }

    const blueprint = stringify({
        version: 1,
        metadata: { name: "undo-snapshot" },
        entries: restoreEntries,
    });

    return { blueprint, reversibility, notes };
}
