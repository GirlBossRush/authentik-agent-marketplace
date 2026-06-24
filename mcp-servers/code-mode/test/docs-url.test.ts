import { test } from "node:test";
import assert from "node:assert/strict";

import {
    resolveDocsUrl,
    resolveIntegrationsUrl,
    DOCS_CURRENT_ORIGIN,
    DOCS_NEXT_ORIGIN,
} from "#docs-url";

test("resolveDocsUrl prefers AK_AGENT_DOCS_URL over everything", () => {
    assert.equal(
        resolveDocsUrl(
            {
                AK_AGENT_DOCS_URL: "https://my.docs/",
                AK_DOCS_URL: "https://other",
            },
            "2026.8.0",
        ),
        "https://my.docs",
    );
});

test("resolveDocsUrl falls back to AK_DOCS_URL", () => {
    assert.equal(
        resolveDocsUrl({ AK_DOCS_URL: "https://team.docs" }, "2026.8.0-rc1"),
        "https://team.docs",
    );
});

test("resolveDocsUrl derives current docs from a stable version", () => {
    assert.equal(resolveDocsUrl({}, "2026.8.0"), DOCS_CURRENT_ORIGIN);
});

test("resolveDocsUrl derives next docs from a prerelease version", () => {
    assert.equal(resolveDocsUrl({}, "2026.8.0-rc1"), DOCS_NEXT_ORIGIN);
});

test("resolveDocsUrl defaults to next when no version or override", () => {
    assert.equal(resolveDocsUrl({}), DOCS_NEXT_ORIGIN);
});

test("resolveDocsUrl honors PRE_RELEASE_ORIGIN / CURRENT_RELEASE_ORIGIN overrides", () => {
    assert.equal(
        resolveDocsUrl({ CURRENT_RELEASE_ORIGIN: "https://cur" }, "2026.8.0"),
        "https://cur",
    );
    assert.equal(
        resolveDocsUrl({ PRE_RELEASE_ORIGIN: "https://pre" }, "2026.8.0-rc1"),
        "https://pre",
    );
});

test("resolveIntegrationsUrl defaults, with env override", () => {
    assert.equal(
        resolveIntegrationsUrl({}),
        "https://integrations.goauthentik.io",
    );
    assert.equal(
        resolveIntegrationsUrl({
            AK_AGENT_INTEGRATIONS_URL: "https://my.integrations/",
        }),
        "https://my.integrations",
    );
});
