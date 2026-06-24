#!/usr/bin/env node
/**
 * @file SessionStart hook — inject the resolved authentik docs + integrations
 * base URLs into the session context so skills don't hardcode them. Offline
 * (env-only); the code-mode MCP's `docs` tool provides the version-accurate URL
 * when an instance is configured.
 */

import { parseEnvironment } from "./lib/parse.ts";
import {
    resolveDocsURLFromEnv,
    resolveIntegrationsURL,
} from "./lib/resolve.ts";

const env = parseEnvironment();
const docsURL = resolveDocsURLFromEnv(env);
const integrationsURL = resolveIntegrationsURL(env);

const additionalContext = [
    `authentik docs base URL: ${docsURL}`,
    `authentik integrations base URL: ${integrationsURL}`,
    `For authentik documentation, start at ${docsURL}/llms.txt (integrations: ${integrationsURL}/llms.txt),`,
    `follow the index to the relevant page, and fetch its .md. When an instance is configured, the`,
    `authentik-code-mode MCP's "docs" tool returns the version-accurate docs base URL.`,
].join(" ");

process.stdout.write(
    JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext,
        },
    }),
);
