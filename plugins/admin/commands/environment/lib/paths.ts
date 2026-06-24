/** @file Resolve paths relative to the agent plugin root. */

import { resolve } from "node:path";

/**
 * Resolve a path relative to the agent plugin root — `CLAUDE_PLUGIN_ROOT` when
 * installed as a plugin, otherwise the current working directory (local dev).
 *
 * @param paths Path segments to join onto the root.
 */
export function agentEnvPathBuilder(...paths: string[]): string {
    const root = process.env.CLAUDE_PLUGIN_ROOT ?? process.cwd();
    return resolve(root, ...paths);
}
