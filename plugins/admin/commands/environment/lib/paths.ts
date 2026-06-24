/** @file Resolve `.env` file locations for the agent. */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

/**
 * Resolve a path relative to the directory Claude Code is running in (cwd).
 *
 * @param paths Path segments to join onto cwd.
 */
export function agentEnvPathBuilder(...paths: string[]): string {
    return resolve(process.cwd(), ...paths);
}

/**
 * Existing `.env` files from the directory Claude Code runs in (cwd) walking
 * upward to the enclosing repo root, in precedence order — **later wins**, so
 * the cwd `.env` is primary and ancestor `.env` files (e.g. the authentik
 * checkout root when Claude Code runs in a subdirectory) are fallbacks. The walk
 * stops at the first `.git` boundary, the home directory, or the filesystem root
 * so it never reaches a stray `~/.env`. For local authentik dev, cwd and the
 * checkout root are typically the same directory.
 */
export function agentEnvPaths(): string[] {
    const found: string[] = [];
    let dir = process.cwd();
    const home = homedir();

    while (true) {
        const candidate = resolve(dir, ".env");
        if (existsSync(candidate)) found.push(candidate);

        const parent = dirname(dir);
        const atRepoRoot = existsSync(resolve(dir, ".git"));
        if (atRepoRoot || dir === home || parent === dir) break;
        dir = parent;
    }

    // `found` is deepest-first (cwd first); reverse so cwd is applied last and wins.
    return found.reverse();
}
