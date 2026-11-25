import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { plugin as shadcn } from "@shadcn/lint";
import { parseForESLint, type ParserOptions } from "@typescript-eslint/parser";
import type { ESLint, Linter, Rule } from "eslint";
import { configs as astroConfigs } from "eslint-plugin-astro";
import jsdocPlugin from "eslint-plugin-jsdoc";
import unicorn from "eslint-plugin-unicorn";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

import {
  findMissingDescriptions,
  findNonDocComments,
  missingDescriptionMessage,
  nonDocMessage,
} from "./tools/oxlint/local-plugin.ts";
import { lintPolicy, ruleOptions } from "./tools/oxlint/policy.ts";

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
 * The rules an ESLint plugin carries, or none when it has no `rules` map.
 */
function rulesOf(plugin: object): Readonly<Record<string, unknown>> {
  return "rules" in plugin && typeof plugin.rules === "object" && plugin.rules !== null
    ? Object.fromEntries(Object.entries(plugin.rules))
    : {};
}

/**
 * Maps the policy's rules in one Oxlint scope onto the ESLint plugin that
 * carries them, dropping the rules the plugin does not have.
 */
function mapPolicyRules(
  scope: string,
  eslintScope: string,
  pluginRules: Readonly<Record<string, unknown>>,
  include: (ruleName: string) => boolean = () => true,
): Linter.RulesRecord {
  const mapped: Linter.RulesRecord = {};
  for (const ruleName of Object.keys(lintPolicy.rules)) {
    const [ruleScope, shortName] = ruleName.split("/");
    if (
      ruleScope === scope &&
      shortName !== undefined &&
      shortName in pluginRules &&
      include(shortName)
    ) {
      mapped[`${eslintScope}/${shortName}`] = "error";
    }
  }
  return mapped;
}

const untypedTypescriptRules: ReadonlySet<string> = new Set([
  "consistent-type-imports",
  "no-explicit-any",
]);

/**
 * The policy's TypeScript rules that need no type information.
 */
const untypedBaselineRules = mapPolicyRules(
  "typescript",
  "@typescript-eslint",
  rulesOf(tseslint.plugin),
  (ruleName) => untypedTypescriptRules.has(ruleName),
);

/**
 * The policy's type-aware TypeScript rules, with the options Oxlint applies.
 */
const typedBaselineRules: Linter.RulesRecord = {
  ...mapPolicyRules(
    "typescript",
    "@typescript-eslint",
    rulesOf(tseslint.plugin),
    (ruleName) => !untypedTypescriptRules.has(ruleName),
  ),
  "@typescript-eslint/return-await": ["error", ...ruleOptions["typescript/return-await"].slice(1)],
};

/**
 * The policy's JSDoc content rules.
 */
const policyJsdocRules = mapPolicyRules("jsdoc", "jsdoc", rulesOf(jsdocPlugin));

/**
 * The policy's unicorn rules.
 */
const policyUnicornRules = mapPolicyRules("unicorn", "unicorn", rulesOf(unicorn));

/**
 * The project-local comment rules of the policy, plus the unlimited-disable
 * ban from the eslint-comments hygiene set.
 */
const localRules: Linter.RulesRecord = {
  ...Object.fromEntries(
    Object.keys(lintPolicy.rules)
      .filter((ruleName) => ruleName.startsWith("local/"))
      .map((ruleName) => [ruleName, "error"]),
  ),
  "@eslint-community/eslint-comments/no-unlimited-disable": "error",
};

/**
 * The location a reported comment is shown at when the parser gave it none,
 * so a finding is never dropped.
 */
const fileStart = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

/**
 * Builds an ESLint rule that reports each comment the shared finder returns.
 */
function commentRule(
  messageId: string,
  message: string,
  findComments: typeof findNonDocComments,
): Rule.RuleModule {
  return {
    meta: { type: "suggestion", schema: [], messages: { [messageId]: message } },
    create(context) {
      return {
        Program() {
          for (const comment of findComments(context.sourceCode.getAllComments())) {
            context.report({ loc: comment.loc ?? fileStart, messageId });
          }
        },
      };
    },
  };
}

/**
 * The comment rules of the Oxlint local plugin, run under ESLint so `.astro`
 * files get the same comment rules as every other file.
 */
const eslintLocalPlugin = {
  meta: { name: "local" },
  rules: {
    "no-non-doc-comments": commentRule("nonDocComment", nonDocMessage, findNonDocComments),
    "require-description": commentRule(
      "missingDescription",
      missingDescriptionMessage,
      findMissingDescriptions,
    ),
  },
} satisfies ESLint.Plugin;

/**
 * The Website's `.astro` and `.tsx` files, where the `shadcn/*` rules apply.
 * The vendored ui layer (`apps/site/src/components/ui`) is exempt: it is
 * generated by `shadcn add` and re-synced, never hand-edited (ADR-0045).
 */
const siteShadcnFiles = ["apps/site/**/*.astro", "apps/site/**/*.astro/*.ts", "apps/site/**/*.tsx"];

/**
 * The `.tsx` files of the Website, which ESLint parses for the `shadcn/*`
 * rules only; Oxlint lints them for everything else.
 */
const siteTsxFiles = ["apps/site/**/*.tsx"];

/**
 * CSS properties `shadcn/no-inline-styles` lets stay inline: only custom
 * properties, which feed values into stylesheet rules and cannot be static
 * classes.
 */
const shadcnAllowedInlineProperties = ["--*"];

/**
 * The `shadcn/*` rules, at `error`.
 */
const shadcnRules = {
  "shadcn/no-restyle": ["error", { allow: ["layout"] }],
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": "error",
  "shadcn/no-inline-styles": ["error", { allow: shadcnAllowedInlineProperties }],
  "shadcn/no-unknown-classes": "error",
  "shadcn/require-static-classes": "error",
} satisfies Linter.RulesRecord;

/**
 * The Website's `.astro` files that still style themselves with hook classes
 * declared in plain stylesheets and `<style>` blocks. Until each is migrated
 * to shadcn wrappers, the three rules that flag those hooks are off for the
 * files listed here and nowhere else: a new `.astro` file gets every `shadcn/*`
 * rule, and a ticket that migrates a file removes it from this list.
 */
const siteLegacyAstroPaths = [
  "apps/site/src/components/code/CodeBlock.astro",
  "apps/site/src/components/docs/DocsFooter.astro",
  "apps/site/src/components/docs/DocsHeader.astro",
  "apps/site/src/components/docs/DocsPageTitle.astro",
  "apps/site/src/components/docs/DocsSearch.astro",
  "apps/site/src/components/docs/PageActions.astro",
  "apps/site/src/components/home/About.astro",
  "apps/site/src/components/home/AnnouncementPill.astro",
  "apps/site/src/components/home/Closing.astro",
  "apps/site/src/components/home/Faq.astro",
  "apps/site/src/components/home/FeatureRows.astro",
  "apps/site/src/components/home/Features.astro",
  "apps/site/src/components/home/Hero.astro",
  "apps/site/src/components/home/HowItWorks.astro",
  "apps/site/src/components/home/Showcase.astro",
  "apps/site/src/components/home/Stats.astro",
  "apps/site/src/components/home/WaveDiagram.astro",
  "apps/site/src/components/home/bento/scenes/ApprovalScene.astro",
  "apps/site/src/components/home/bento/scenes/CiScene.astro",
  "apps/site/src/components/home/bento/scenes/FlagsScene.astro",
  "apps/site/src/components/home/bento/scenes/ReviewScene.astro",
  "apps/site/src/components/home/bento/scenes/TrackerScene.astro",
  "apps/site/src/components/home/bento/scenes/WorkersScene.astro",
  "apps/site/src/components/home/graphics/Fireflies.astro",
  "apps/site/src/components/home/graphics/PaintingStreams.astro",
  "apps/site/src/components/home/graphics/PixelMascot.astro",
  "apps/site/src/components/home/graphics/Valley.astro",
  "apps/site/src/components/site/GithubStars.astro",
  "apps/site/src/components/site/LanguageSwitcher.astro",
  "apps/site/src/components/site/MobileMenu.astro",
  "apps/site/src/components/site/SearchButton.astro",
  "apps/site/src/components/site/SiteFooter.astro",
  "apps/site/src/components/site/SiteHeader.astro",
  "apps/site/src/components/site/ThemeSelect.astro",
  "apps/site/src/layouts/BaseLayout.astro",
  "apps/site/src/seo/NotFoundDocument.astro",
];

const siteLegacyAstroFiles = siteLegacyAstroPaths.flatMap((path) => [path, `${path}/*.ts`]);

const shadcnLegacyAstroOverrides = {
  "shadcn/no-unknown-classes": "off",
  "shadcn/no-inline-styles": "off",
  "shadcn/no-raw-colors": "off",
} satisfies Linter.RulesRecord;

export default defineConfig([
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: siteTsxFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: siteShadcnFiles,
    plugins: { shadcn },
    rules: shadcnRules,
  },
  {
    files: siteLegacyAstroFiles,
    rules: shadcnLegacyAstroOverrides,
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
      ...policyJsdocRules,
      ...policyUnicornRules,
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
    "apps/site/src/components/ui/**",
  ]),
]);
