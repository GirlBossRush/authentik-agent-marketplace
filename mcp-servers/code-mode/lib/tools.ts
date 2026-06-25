/** @file The code-mode tools: search, execute, validate, prepare. */

import type { OpenAPIV3 } from "openapi-types";

import {
    validateBlueprint,
    type BlueprintValidation,
} from "#blueprint/validate";
import { prepareApply, type PrepareResult } from "#blueprint/prepare";
import { createAk } from "#client";
import type { AKConfig } from "#config";
import { runInSandbox, type SandboxResult } from "#sandbox";
import { searchOperations, type OperationHit } from "#schema";

export interface CreateToolsDeps {
    spec: OpenAPIV3.Document;
    config: AKConfig;
}

export function createTools({ spec, config }: CreateToolsDeps) {
    const search = ({
        query,
        limit,
    }: {
        query: string;
        limit?: number;
    }): { operations: OperationHit[] } => ({
        operations: searchOperations(spec, query, limit),
    });

    const execute = async ({
        code,
    }: {
        code: string;
    }): Promise<SandboxResult> => {
        const ak = createAk(config, { allowWrites: false });

        return runInSandbox(code, ak, {});
    };

    const validate = ({ content }: { content: string }): BlueprintValidation =>
        validateBlueprint(content);

    // Propose-only: prepare runs the read-only pipeline (validate + diff + undo
    // + flags + apply command). The MCP never holds a write/apply credential, so
    // the diff/undo reads go through a read-only ak (allowWrites: false).
    const prepare = ({
        content,
    }: {
        content: string;
    }): Promise<PrepareResult> =>
        prepareApply(content, createAk(config, { allowWrites: false }));

    return { search, execute, validate, prepare };
}
