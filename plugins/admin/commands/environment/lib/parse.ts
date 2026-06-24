import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { agentEnvPathBuilder } from "./paths.ts";

/**
 * Attempt to load environment variables from the specified `.env` file.
 *
 * @param envFilePath The path to the `.env` file to load
 * @throws {Error} If the file exists but cannot be parsed
 */
export function tryLoadEnvFile(envFilePath: string): NodeJS.Dict<string> {
    if (existsSync(envFilePath)) {
        console.error(`Loading environment from ${envFilePath}`);

        try {
            const contents = readFileSync(envFilePath, "utf-8");

            return parseEnv(contents);
        } catch (cause) {
            throw new Error(
                `Failed to parse environment file at ${envFilePath}`,
                { cause },
            );
        }
    }

    return {};
}

/**
 * Load environment variables from the specified `.env` files, with the repo-level `.env` taking
 * precedence. Variables from all files are merged together, with later files overriding earlier
 * ones. The resulting environment is combined with `process.env`, with the loaded variables taking
 * precedence.
 *
 * @param envPaths Additional paths to `.env` files to load, in order of increasing precedence
 *
 * @returns An object containing the merged environment variables
 */
export function parseEnvironment<T extends object = object>(
    ...envPaths: string[]
): NodeJS.ProcessEnv & T {
    const paths: string[] = [agentEnvPathBuilder(".env"), ...envPaths];

    const envs = paths.map((path) => tryLoadEnvFile(path.toString()));

    return Object.assign({}, process.env, ...envs) as NodeJS.ProcessEnv & T;
}
