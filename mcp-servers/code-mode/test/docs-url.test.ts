import { test } from "node:test";
import assert from "node:assert/strict";

import {
    resolveDocsURL,
    resolveIntegrationsURL,
    DOCS_CURRENT_ORIGIN,
    DOCS_NEXT_ORIGIN,
} from "#docs-url";

test("resolveDocsURL prefers AK_AGENT_DOCS_URL over everything", () => {
    assert.equal(
        resolveDocsURL(
            {
                AK_AGENT_DOCS_URL: "https://my.docs/",
                AK_DOCS_URL: "https://other",
            },
            "2026.8.0",
        ),
        "https://my.docs",
    );
});

test("resolveDocsURL falls back to AK_DOCS_URL", () => {
    assert.equal(
        resolveDocsURL({ AK_DOCS_URL: "https://team.docs" }, "2026.8.0-rc1"),
        "https://team.docs",
    );
});

test("resolveDocsURL derives current docs from a stable version", () => {
    assert.equal(resolveDocsURL({}, "2026.8.0"), DOCS_CURRENT_ORIGIN);
});

test("resolveDocsURL derives next docs from a prerelease version", () => {
    assert.equal(resolveDocsURL({}, "2026.8.0-rc1"), DOCS_NEXT_ORIGIN);
});

test("resolveDocsURL defaults to next when no version or override", () => {
    assert.equal(resolveDocsURL({}), DOCS_NEXT_ORIGIN);
});

test("resolveDocsURL honors PRE_RELEASE_ORIGIN / CURRENT_RELEASE_ORIGIN overrides", () => {
    assert.equal(
        resolveDocsURL({ CURRENT_RELEASE_ORIGIN: "https://cur" }, "2026.8.0"),
        "https://cur",
    );
    assert.equal(
        resolveDocsURL({ PRE_RELEASE_ORIGIN: "https://pre" }, "2026.8.0-rc1"),
        "https://pre",
    );
});

test("resolveIntegrationsURL defaults, with env override", () => {
    assert.equal(
        resolveIntegrationsURL({}),
        "https://integrations.goauthentik.io",
    );
    assert.equal(
        resolveIntegrationsURL({
            AK_AGENT_INTEGRATIONS_URL: "https://my.integrations/",
        }),
        "https://my.integrations",
    );
});
