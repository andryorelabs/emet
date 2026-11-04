/** A source comment as exposed by the Oxlint plugin API. */
interface SourceComment {
  type: "Line" | "Block" | "Shebang";
  value: string;
}

/** The slice of the Oxlint rule context this plugin uses. */
interface RuleContext {
  sourceCode: { getAllComments(): SourceComment[] };
  report(descriptor: { node: SourceComment; messageId: string }): void;
}

/** The slice of the Oxlint rule shape this plugin defines. */
interface LocalRule {
  meta: {
    type: "suggestion";
    docs: { description: string };
    messages: Record<string, string>;
    schema: [];
  };
  create(context: RuleContext): { Program(): void };
}

/**
 * Prefixes of comments that tools read. They are exempt from
 * `no-non-doc-comments` because removing them changes tool behavior.
 */
const toolDirectivePrefixes: readonly string[] = [
  "oxlint-disable",
  "oxlint-enable",
  "eslint-disable",
  "eslint-enable",
  "eslint ",
  "global ",
  "globals ",
  "@ts-expect-error",
  "@ts-ignore",
  "@ts-nocheck",
  "@ts-check",
  "istanbul ignore",
  "c8 ignore",
  "v8 ignore",
  "oxfmt-ignore",
  "prettier-ignore",
  "#__PURE__",
  "@__PURE__",
  "#__NO_SIDE_EFFECTS__",
  "@__NO_SIDE_EFFECTS__",
];

const tripleSlashDirectivePattern = /^\/\s*<(reference|amd-module|amd-dependency)\b/;

/** A TSDoc block is a block comment opened with exactly two asterisks. */
function isDocBlock(comment: SourceComment): boolean {
  return (
    comment.type === "Block" && comment.value.startsWith("*") && !comment.value.startsWith("**")
  );
}

/** Whether the comment is read by a tool rather than by people. */
function isToolDirective(comment: SourceComment): boolean {
  if (comment.type === "Line" && tripleSlashDirectivePattern.test(comment.value)) {
    return true;
  }
  const directiveText = comment.value.trim();
  return toolDirectivePrefixes.some((prefix) => directiveText.startsWith(prefix));
}

const noNonDocComments: LocalRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Allow only TSDoc blocks and tool directive comments.",
    },
    messages: {
      nonDocComment:
        "Only TSDoc blocks on declarations and tool directives are allowed. Rename or extract instead of explaining inline.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === "Shebang" || isDocBlock(comment) || isToolDirective(comment)) {
            continue;
          }
          context.report({ node: comment, messageId: "nonDocComment" });
        }
      },
    };
  },
};

const disableDirectivePattern =
  /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?![\w-])([\s\S]*)$/;

/** Returns the reason after `--` in a disable directive, or an empty string. */
function directiveReason(comment: SourceComment): string {
  const match = disableDirectivePattern.exec(comment.value);
  if (match === null) {
    return "";
  }
  const separatorIndex = (match[1] ?? "").indexOf("--");
  return separatorIndex === -1 ? "" : (match[1] ?? "").slice(separatorIndex + 2).trim();
}

const requireDescription: LocalRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a written reason after every disable directive.",
    },
    messages: {
      missingDescription: "Add a reason after the directive, for example `-- why this is safe`.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (
            comment.type !== "Shebang" &&
            disableDirectivePattern.test(comment.value) &&
            directiveReason(comment) === ""
          ) {
            context.report({ node: comment, messageId: "missingDescription" });
          }
        }
      },
    };
  },
};

/** Project-local Oxlint rules, loaded as a jsPlugin under the `local` alias. */
export default {
  meta: { name: "local" },
  rules: {
    "no-non-doc-comments": noNonDocComments,
    "require-description": requireDescription,
  },
};
