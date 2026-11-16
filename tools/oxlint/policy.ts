/**
 * The shared lint policy. `oxlint.config.ts` turns it into Oxlint rules and
 * `eslint.config.ts` maps it onto the ESLint companion that lints `.astro`
 * files, so both linters enforce one list. Names use Oxlint's scopes:
 * `typescript/` for typescript-eslint rules and `eslint/` for core rules.
 */

/**
 * Rules that make a floating, mis-handled or lost promise a build failure. An
 * unhandled rejection fails silently, so each of these is an error.
 */
export const promiseSafetyRules = [
  "typescript/no-floating-promises",
  "typescript/no-misused-promises",
  "typescript/await-thenable",
  "typescript/require-await",
  "typescript/prefer-promise-reject-errors",
  "typescript/use-unknown-in-catch-callback-variable",
] as const;

/**
 * Rules that stop `any` from leaking out of untyped boundaries (JSON, catch
 * clauses, third-party types) into typed code, where it would switch off the
 * checker without a visible cast.
 */
export const noUnsafeAnyRules = [
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-return",
  "typescript/no-unsafe-argument",
] as const;

/**
 * Rules that keep control flow and thrown values exhaustive and explicit:
 * every union member is handled, only `Error` values are thrown, and dead
 * conditions are removed instead of left as noise.
 */
export const exhaustivenessRules = [
  "typescript/only-throw-error",
  "typescript/switch-exhaustiveness-check",
  "typescript/no-unnecessary-condition",
  "typescript/return-await",
  "typescript/unbound-method",
] as const;

/**
 * Every rule of the typescript-eslint `strictTypeChecked` preset that Oxlint
 * implements. Extension rules that Oxlint ships under the `eslint` scope are
 * listed under that scope.
 */
export const strictRules = [
  "typescript/await-thenable",
  "typescript/ban-ts-comment",
  "eslint/no-array-constructor",
  "typescript/no-array-delete",
  "typescript/no-base-to-string",
  "typescript/no-confusing-void-expression",
  "typescript/no-deprecated",
  "typescript/no-duplicate-enum-values",
  "typescript/no-duplicate-type-constituents",
  "typescript/no-dynamic-delete",
  "typescript/no-empty-object-type",
  "typescript/no-explicit-any",
  "typescript/no-extra-non-null-assertion",
  "typescript/no-extraneous-class",
  "typescript/no-floating-promises",
  "typescript/no-for-in-array",
  "typescript/no-implied-eval",
  "typescript/no-invalid-void-type",
  "typescript/no-meaningless-void-operator",
  "typescript/no-misused-new",
  "typescript/no-misused-promises",
  "typescript/no-misused-spread",
  "typescript/no-mixed-enums",
  "typescript/no-namespace",
  "typescript/no-non-null-asserted-nullish-coalescing",
  "typescript/no-non-null-asserted-optional-chain",
  "typescript/no-non-null-assertion",
  "typescript/no-redundant-type-constituents",
  "typescript/no-require-imports",
  "typescript/no-this-alias",
  "typescript/no-unnecessary-boolean-literal-compare",
  "typescript/no-unnecessary-condition",
  "typescript/no-unnecessary-template-expression",
  "typescript/no-unnecessary-type-arguments",
  "typescript/no-unnecessary-type-assertion",
  "typescript/no-unnecessary-type-conversion",
  "typescript/no-useless-default-assignment",
  "typescript/no-unsafe-enum-assignment",
  "typescript/no-unnecessary-type-constraint",
  "typescript/no-unnecessary-type-parameters",
  "typescript/no-unsafe-argument",
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-declaration-merging",
  "typescript/no-unsafe-enum-comparison",
  "typescript/no-unsafe-function-type",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-return",
  "typescript/no-unsafe-unary-minus",
  "eslint/no-unused-expressions",
  "eslint/no-unused-vars",
  "eslint/no-useless-constructor",
  "typescript/no-wrapper-object-types",
  "typescript/only-throw-error",
  "typescript/prefer-as-const",
  "typescript/prefer-literal-enum-member",
  "typescript/prefer-namespace-keyword",
  "typescript/prefer-promise-reject-errors",
  "typescript/prefer-reduce-type-parameter",
  "typescript/prefer-return-this-type",
  "typescript/related-getter-setter-pairs",
  "typescript/require-await",
  "typescript/restrict-plus-operands",
  "typescript/restrict-template-expressions",
  "typescript/return-await",
  "typescript/triple-slash-reference",
  "typescript/unbound-method",
  "typescript/unified-signatures",
  "typescript/use-unknown-in-catch-callback-variable",
] as const;

/**
 * Every rule of the typescript-eslint `stylisticTypeChecked` preset that
 * Oxlint implements.
 */
export const stylisticRules = [
  "typescript/adjacent-overload-signatures",
  "typescript/array-type",
  "typescript/ban-tslint-comment",
  "typescript/class-literal-property-style",
  "typescript/consistent-generic-constructors",
  "typescript/consistent-indexed-object-style",
  "typescript/consistent-type-assertions",
  "typescript/consistent-type-definitions",
  "typescript/dot-notation",
  "typescript/no-confusing-non-null-assertion",
  "eslint/no-empty-function",
  "typescript/no-inferrable-types",
  "typescript/non-nullable-type-assertion-style",
  "typescript/prefer-find",
  "typescript/prefer-for-of",
  "typescript/prefer-function-type",
  "typescript/prefer-includes",
  "typescript/prefer-nullish-coalescing",
  "typescript/prefer-optional-chain",
  "typescript/prefer-regexp-exec",
  "typescript/prefer-string-starts-ends-with",
] as const;

/**
 * Rules for API hygiene: no deprecated calls, no template literals that print
 * `[object Object]`, no explicit `any`, and type-only imports written as
 * `import type` so the emitted JavaScript matches `verbatimModuleSyntax`.
 */
export const apiHygieneRules = [
  "typescript/no-deprecated",
  "typescript/restrict-template-expressions",
  "typescript/no-explicit-any",
  "typescript/consistent-type-imports",
] as const;

/**
 * The JSDoc content rules: tags are known, tag bodies are present where needed
 * and absent where not, and defaults live in code, not in prose.
 */
export const jsdocContentRules = [
  "jsdoc/check-tag-names",
  "jsdoc/empty-tags",
  "jsdoc/implements-on-classes",
  "jsdoc/no-defaults",
  "jsdoc/require-param-name",
  "jsdoc/require-property-name",
  "jsdoc/require-returns-description",
] as const;

/**
 * Rules for comments and the suppression system. A blanket `eslint-disable`
 * hides every rule in a file, so it is banned, the local rule requires a
 * reason on every directive that remains, and every other comment is a TSDoc
 * block or a tool directive.
 */
export const suppressionRules = [
  "unicorn/no-abusive-eslint-disable",
  "local/require-description",
  "local/no-non-doc-comments",
] as const;

/**
 * Rules that stop a test run from passing by not running its tests: a focused
 * test skips its siblings, a disabled test is never executed, and an async
 * matcher that is not awaited cannot fail. `local/no-focused-bun-tests` covers
 * `.only` on the functions imported from `bun:test`.
 */
export const testIntegrityRules = [
  "jest/no-focused-tests",
  "jest/no-disabled-tests",
  "jest/no-identical-title",
  "local/no-unawaited-async-matcher",
  "local/no-focused-bun-tests",
] as const;

/**
 * Builds a rule map that sets every listed rule to `error`.
 */
function errorRules(ruleNames: readonly string[]): Record<string, "error"> {
  return Object.fromEntries(ruleNames.map((ruleName) => [ruleName, "error"]));
}

/**
 * Rules whose setting carries options, so they are not a plain `"error"`.
 * `oxlint.config.ts` applies them over the policy.
 */
export const ruleOptions: { "typescript/return-await": ["error", "in-try-catch"] } = {
  "typescript/return-await": ["error", "in-try-catch"],
};

/**
 * The lint policy: `rules` apply to every file and `testRules` to test files
 * only. Every entry is an error.
 */
export const lintPolicy: {
  readonly rules: Readonly<Record<string, "error">>;
  readonly testRules: Readonly<Record<string, "error">>;
} = {
  rules: errorRules([
    ...promiseSafetyRules,
    ...noUnsafeAnyRules,
    ...exhaustivenessRules,
    ...strictRules,
    ...stylisticRules,
    ...apiHygieneRules,
    ...jsdocContentRules,
    ...suppressionRules,
  ]),
  testRules: errorRules(testIntegrityRules),
};
