import { createESLintPackageConfig } from "@goauthentik/eslint-config";

// @ts-check

const ESLintConfig = createESLintPackageConfig({
  ignorePatterns: ["**/out", "**/node_modules"],
});

export default ESLintConfig;
