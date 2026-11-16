import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { parseForESLint, type ParserOptions } from "@typescript-eslint/parser";
import type { ESLint, Linter, Rule } from "eslint";
import { configs as astroConfigs } from "eslint-plugin-astro";
import jsdocPlugin from "eslint-plugin-jsdoc";
import unicorn from "eslint-plugin-unicorn";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

import localPlugin from "./tools/oxlint/local-plugin.ts";

/**
 * ESLint is the companion linter for `.astro` files only. Oxlint
 * (`oxlint.config.ts`) lints every other file but cannot parse Astro
 * components, so this config applies the same project rule set to their
 * frontmatter, their templates and the client-side `<script>` blocks that
 * `eslint-plugin-astro`'s processor extracts as virtual files
 * (`Component.astro/1_1.ts`).
 */
const astroFiles = ["**/*.astro"];

/**
 * The client-side `<script>` blocks of `.astro` files, as TypeScript virtual
 * files. They are standalone modules, so the type-aware rules run on them.
 */
const astroScriptFiles = ["**/*.astro/*.ts"];

/**
 * The client-side `<script>` blocks written as JavaScript, which have no type
 * information.
 */
const astroJavaScriptFiles = ["**/*.astro/*.js"];

/**
 * The processor names a `<script>` block `Component.astro/1_1.ts`, a path
 * inside a directory that does not exist, so its relative imports would not
 * resolve. The block is typed as the sibling file `Component.astro.1_1.ts`
 * instead, next to the modules it imports.
 */
const astroScriptPathPattern = /\.astro\/(\d+_\d+\.ts)$/;

/**
 * The extracted `<script>` blocks are virtual files that no tsconfig
 * includes, so the project service types them with the Website's tsconfig as
 * the default project. `allowDefaultProject` rejects `**`, so each directory
 * depth gets its own glob.
 */
const astroScriptDefaultProjectGlobs = Array.from(
  { length: 8 },
  (_, depth) => `${"*/".repeat(depth)}*.astro.*.ts`,
);

/**
 * The typescript-eslint parser, with each extracted `<script>` block moved to
 * its sibling path before the project service types it.
 */
const astroScriptParser = {
  meta: { name: "astro-script-typescript-parser" },
  parseForESLint(
    code: string,
    parserOptions: ParserOptions = {},
  ): ReturnType<typeof parseForESLint> {
    const filePath = parserOptions.filePath?.replace(astroScriptPathPattern, ".astro.$1");
    return parseForESLint(
      code,
      filePath === undefined ? parserOptions : { ...parserOptions, filePath },
    );
  },
};

const astroAndScriptFiles = [...astroFiles, ...astroScriptFiles, ...astroJavaScriptFiles];

/**
 * The JSDoc content rules of the S4 baseline, plus the JSDoc rules Oxlint's
 * enabled categories turn on for every other file.
 */
const jsdocRules = {
  "jsdoc/check-property-names": "error",
  "jsdoc/check-tag-names": "error",
  "jsdoc/empty-tags": "error",
  "jsdoc/implements-on-classes": "error",
  "jsdoc/no-defaults": "error",
  "jsdoc/require-param-name": "error",
  "jsdoc/require-property": "error",
  "jsdoc/require-property-description": "error",
  "jsdoc/require-property-name": "error",
  "jsdoc/require-property-type": "error",
  "jsdoc/require-returns-description": "error",
  "jsdoc/require-yields": "error",
} satisfies Linter.RulesRecord;

/**
 * The unicorn rules Oxlint's correctness, suspicious and perf categories
 * enable for every other file, plus `no-abusive-eslint-disable` from the
 * eslint-comments hygiene set.
 */
const unicornRules = {
  "unicorn/consistent-function-scoping": "error",
  "unicorn/no-abusive-eslint-disable": "error",
  "unicorn/no-accessor-recursion": "error",
  "unicorn/no-array-fill-with-reference-type": "error",
  "unicorn/no-array-reverse": "error",
  "unicorn/no-array-sort": "error",
  "unicorn/no-await-in-promise-methods": "error",
  "unicorn/no-confusing-array-with": "error",
  "unicorn/no-empty-file": "error",
  "unicorn/no-instanceof-builtins": "error",
  "unicorn/no-invalid-fetch-options": "error",
  "unicorn/no-invalid-remove-event-listener": "error",
  "unicorn/no-new-array": "error",
  "unicorn/no-single-promise-in-promise-methods": "error",
  "unicorn/no-thenable": "error",
  "unicorn/no-unnecessary-await": "error",
  "unicorn/no-useless-error-capture-stack-trace": "error",
  "unicorn/no-useless-fallback-in-spread": "error",
  "unicorn/no-useless-length-check": "error",
  "unicorn/no-useless-spread": "error",
  "unicorn/prefer-add-event-listener": "error",
  "unicorn/prefer-array-find": "error",
  "unicorn/prefer-array-flat-map": "error",
  "unicorn/prefer-set-has": "error",
  "unicorn/prefer-set-size": "error",
  "unicorn/prefer-string-starts-ends-with": "error",
  "unicorn/require-module-specifiers": "error",
  "unicorn/require-post-message-target-origin": "error",
} satisfies Linter.RulesRecord;

/**
 * The S4 baseline rules that need no type information: explicit `any` is
 * banned and type-only imports are written as `import type`.
 */
const untypedBaselineRules = {
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-explicit-any": "error",
} satisfies Linter.RulesRecord;

/**
 * The type-aware S4 baseline rules beyond the `strictTypeChecked` and
 * `stylisticTypeChecked` presets.
 */
const typedBaselineRules = {
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/return-await": ["error", "in-try-catch"],
  "@typescript-eslint/no-unnecessary-condition": "error",
} satisfies Linter.RulesRecord;

/**
 * The project-local rules shared with Oxlint: comments are JSDoc blocks or tool
 * directives, and every disable directive gives a reason.
 */
const localRules = {
  "local/no-non-doc-comments": "error",
  "local/require-description": "error",
  "@eslint-community/eslint-comments/no-unlimited-disable": "error",
} satisfies Linter.RulesRecord;

/**
 * A rule of the Oxlint local plugin, written against the slice of the rule
 * context that Oxlint and ESLint share.
 */
type LocalRule = (typeof localPlugin.rules)[keyof typeof localPlugin.rules];

/**
 * The location a reported comment is shown at when the parser gave it none,
 * so a finding is never dropped.
 */
const fileStart = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

/**
 * Runs an Oxlint local rule under ESLint. The rule reads ESLint's own comment
 * objects, and each report is placed at the reported comment's location.
 */
function toEslintRule(localRule: LocalRule): Rule.RuleModule {
  return {
    meta: localRule.meta,
    create(context) {
      const comments = context.sourceCode.getAllComments();
      return localRule.create({
        sourceCode: { getAllComments: () => comments },
        report({ node, messageId }) {
          const comment = comments.find((candidate) => candidate === node);
          context.report({ loc: comment?.loc ?? fileStart, messageId });
        },
      });
    },
  };
}

/**
 * The Oxlint local plugin, adapted to ESLint so `.astro` files get the same
 * comment rules as every other file.
 */
const eslintLocalPlugin = {
  meta: localPlugin.meta,
  rules: Object.fromEntries(
    Object.entries(localPlugin.rules).map(([name, localRule]) => [name, toEslintRule(localRule)]),
  ),
} satisfies ESLint.Plugin;

export default defineConfig([
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: astroFiles,
    extends: [tseslint.configs.strict, tseslint.configs.stylistic],
  },
  /**
   * After the typescript-eslint presets, so `astro-eslint-parser` stays the
   * parser of `.astro` files instead of the preset's TypeScript parser.
   */
  {
    files: astroAndScriptFiles,
    extends: [astroConfigs["flat/recommended"]],
  },
  {
    files: astroFiles,
    extends: [astroConfigs["flat/jsx-a11y-recommended"]],
  },
  {
    files: astroScriptFiles,
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parser: astroScriptParser,
      parserOptions: {
        projectService: {
          allowDefaultProject: astroScriptDefaultProjectGlobs,
          defaultProject: "apps/site/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typedBaselineRules,
  },
  {
    files: astroAndScriptFiles,
    plugins: {
      jsdoc: jsdocPlugin,
      unicorn,
      local: eslintLocalPlugin,
      "@eslint-community/eslint-comments": eslintComments,
    },
    rules: {
      ...untypedBaselineRules,
      ...jsdocRules,
      ...unicornRules,
      ...localRules,
    },
  },
  {
    files: astroJavaScriptFiles,
    extends: [tseslint.configs.disableTypeChecked],
  },
  globalIgnores([
    "**/.astro/**",
    "**/dist/**",
    "**/node_modules/**",
    "coverage/**",
    ".claude/**",
    ".emet/**",
  ]),
]);
