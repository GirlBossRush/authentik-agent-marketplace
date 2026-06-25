/**
 * @file The supported-model registry and policy data for the blueprint
 * validator (v2 policy-enforcement point).
 *
 * Every supported model is declared ONCE in {@link MODELS}, carrying both its
 * read endpoint (how the diff/undo readers locate the live object) and its
 * per-attribute policy rules (how the validator gates each field). The three
 * lookups the rest of the subsystem consumes — {@link ALLOWED_MODELS},
 * {@link MODEL_ATTRS}, and {@link MODEL_LIST} — are DERIVED from it, so the
 * allow-list, the rules, and the endpoints can never drift apart.
 */

export type AttrBin = "pass" | "flag" | "force" | "cap" | "ref";

export interface AttrRule {
    bin: AttrBin;
    value?: unknown; // for "force"
    maxSeconds?: number; // for "cap"
}

/**
 * The read-only list endpoint that locates a model's live objects. Identifiers
 * not accepted as exact `filterParams` fall back to client-side matching; a
 * model whose endpoint exposes no exact filter sets `wideFetch` so the reader
 * requests the widest page and matches in-process.
 */
export interface ModelList {
    path: string;
    filterParams: readonly string[];
    wideFetch?: boolean;
}

/** A supported model: where to read it, and how each attribute is gated. */
export interface ModelPolicy {
    list: ModelList;
    attrs: Readonly<Record<string, AttrRule>>;
}

const TOKEN_MAX = 60 * 60 * 24; // 24h cap; adjust to admin global max when that exists (v3)

/**
 * The single source of truth for the supported onboarding models. Add a model
 * here — with BOTH its `list` endpoint and its `attrs` rules — and every derived
 * lookup below picks it up; there is nowhere else to update.
 */
export const MODELS: Readonly<Record<string, ModelPolicy>> = {
    "authentik_core.application": {
        list: { path: "/core/applications/", filterParams: ["slug"] },
        attrs: {
            name: { bin: "pass" },
            slug: { bin: "pass" },
            group: { bin: "pass" },
            meta_launch_url: { bin: "pass" },
            meta_description: { bin: "pass" },
            meta_publisher: { bin: "pass" },
            meta_icon: { bin: "pass" },
            // The provider binding MUST be a permitted reference (a !KeyOf to a
            // provider defined in this blueprint, or a curated !Find). `policies`
            // bindings remain disallowed (not listed). See the validator's ref check.
            provider: { bin: "ref" },
        },
    },
    "authentik_providers_oauth2.oauth2provider": {
        // No exact `name` filter exposed; match client-side on the results.
        list: { path: "/providers/oauth2/", filterParams: [], wideFetch: true },
        attrs: {
            name: { bin: "pass" },
            client_type: { bin: "flag" },
            redirect_uris: { bin: "flag" },
            property_mappings: { bin: "ref" }, // references; constrained to curated scope mappings by the validator
            // Relationship fields: only a permitted reference is accepted (curated
            // !Find to the default flow / default signing key, or an in-blueprint
            // !KeyOf). Plain literals and non-curated refs are rejected.
            authorization_flow: { bin: "ref" },
            invalidation_flow: { bin: "ref" },
            signing_key: { bin: "ref" },
            sub_mode: { bin: "force", value: "hashed_user_id" },
            issuer_mode: { bin: "force", value: "per_provider" },
            include_claims_in_id_token: { bin: "force", value: false },
            access_code_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
            access_token_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
        },
    },
    "authentik_providers_saml.samlprovider": {
        list: { path: "/providers/saml/", filterParams: [], wideFetch: true },
        attrs: {
            name: { bin: "pass" },
            acs_url: { bin: "flag" },
            audience: { bin: "flag" },
            sp_binding: { bin: "flag" },
            // Field names confirmed against authentik's SAMLProviderSerializer /
            // ProviderSerializer: authorization_flow + invalidation_flow (base),
            // signing_kp (the signing keypair), property_mappings.
            authorization_flow: { bin: "ref" },
            invalidation_flow: { bin: "ref" },
            signing_kp: { bin: "ref" },
            property_mappings: { bin: "ref" },
        },
    },
};

/** The set of permitted model names — derived from {@link MODELS}. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set(Object.keys(MODELS));

/** Per-model attribute rules — derived from {@link MODELS}. */
export const MODEL_ATTRS: Readonly<
    Record<string, Readonly<Record<string, AttrRule>>>
> = Object.fromEntries(
    Object.entries(MODELS).map(([model, { attrs }]) => [model, attrs]),
);

/** Per-model read endpoints — derived from {@link MODELS}. */
export const MODEL_LIST: Readonly<Record<string, ModelList>> =
    Object.fromEntries(
        Object.entries(MODELS).map(([model, { list }]) => [model, list]),
    );

/** Only references resolving to these built-ins are permitted (spec §3.3). */
export const CURATED_REFS = {
    flows: [
        "default-provider-authorization-explicit-consent",
        "default-provider-invalidation-flow",
    ],
    defaultSigningKeyName: "authentik Self-signed Certificate",
    scopeMappings: [
        "goauthentik.io/providers/oauth2/scope-openid",
        "goauthentik.io/providers/oauth2/scope-email",
        "goauthentik.io/providers/oauth2/scope-profile",
        "goauthentik.io/providers/oauth2/scope-offline_access",
    ],
} as const;

export const EXCLUDED_SCOPES: ReadonlySet<string> = new Set([
    "goauthentik.io/providers/oauth2/scope-authentik_api",
    "goauthentik.io/providers/oauth2/scope-entitlements",
]);

/** A blueprint entry that deletes any model or touches crypto is irreversible. */
export function isDestructiveEntry(
    model: string,
    state: string | undefined,
): boolean {
    return state === "absent" || model.startsWith("authentik_crypto.");
}
