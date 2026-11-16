import { definePlugin, defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** The part of a source comment the comment rules read. */
interface CommentLike {
  type: string;
  value: string;
}

/** The message of `no-non-doc-comments`. */
export const nonDocMessage =
  "Only TSDoc blocks on declarations and tool directives are allowed. Rename or extract instead of explaining inline.";

/** The message of `require-description`. */
export const missingDescriptionMessage =
  "Add a reason after the directive, for example `-- why this is safe`.";

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
function isDocBlock(comment: CommentLike): boolean {
  return (
    comment.type === "Block" && comment.value.startsWith("*") && !comment.value.startsWith("**")
  );
}

/** Whether the comment is read by a tool rather than by people. */
function isToolDirective(comment: CommentLike): boolean {
  if (comment.type === "Line" && tripleSlashDirectivePattern.test(comment.value)) {
    return true;
  }
  const directiveText = comment.value.trim();
  return toolDirectivePrefixes.some((prefix) => directiveText.startsWith(prefix));
}

/** The comments that are neither a TSDoc block, a tool directive nor a shebang. */
export function findNonDocComments<T extends CommentLike>(comments: readonly T[]): T[] {
  return comments.filter(
    (comment) => comment.type !== "Shebang" && !isDocBlock(comment) && !isToolDirective(comment),
  );
}

const noNonDocComments = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Allow only TSDoc blocks and tool directive comments.",
    },
    messages: { nonDocComment: nonDocMessage },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of findNonDocComments(context.sourceCode.getAllComments())) {
          context.report({ node: comment, messageId: "nonDocComment" });
        }
      },
    };
  },
});

const disableDirectivePattern =
  /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?![\w-])([\s\S]*)$/;

/** Returns the reason after `--` in a disable directive, or an empty string. */
function directiveReason(comment: CommentLike): string {
  const match = disableDirectivePattern.exec(comment.value);
  if (match === null) {
    return "";
  }
  const separatorIndex = (match[1] ?? "").indexOf("--");
  return separatorIndex === -1 ? "" : (match[1] ?? "").slice(separatorIndex + 2).trim();
}

/** The disable directives that give no reason after `--`. */
export function findMissingDescriptions<T extends CommentLike>(comments: readonly T[]): T[] {
  return comments.filter(
    (comment) =>
      comment.type !== "Shebang" &&
      disableDirectivePattern.test(comment.value) &&
      directiveReason(comment) === "",
  );
}

const requireDescription = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a written reason after every disable directive.",
    },
    messages: { missingDescription: missingDescriptionMessage },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of findMissingDescriptions(context.sourceCode.getAllComments())) {
          context.report({ node: comment, messageId: "missingDescription" });
        }
      },
    };
  },
});

const asyncMatcherModifiers: ReadonlySet<string> = new Set(["rejects", "resolves"]);
const focusableTestFunctions: ReadonlySet<string> = new Set(["test", "it", "describe"]);
const onlyModifier: ReadonlySet<string> = new Set(["only"]);

/** The property name of a member access, for both `.name` and `["name"]`. */
function memberName(node: ESTree.MemberExpression): string | undefined {
  const property = node.property;
  if (!node.computed) {
    return property.type === "Identifier" ? property.name : undefined;
  }
  return property.type === "Literal" && typeof property.value === "string"
    ? property.value
    : undefined;
}

/** Whether the member accesses one of `names`. */
function isNamedMember(node: ESTree.MemberExpression, names: ReadonlySet<string>): boolean {
  const name = memberName(node);
  return name !== undefined && names.has(name);
}

/**
 * Whether the member chain below `node` goes through `expect(...).rejects` or
 * `expect(...).resolves`.
 */
function startsAsyncMatcherChain(node: ESTree.Node): boolean {
  let current = node;
  while (current.type === "MemberExpression") {
    if (isNamedMember(current, asyncMatcherModifiers)) {
      const expectCall = current.object;
      return (
        expectCall.type === "CallExpression" &&
        expectCall.callee.type === "Identifier" &&
        expectCall.callee.name === "expect"
      );
    }
    current = current.object;
  }
  return false;
}

/** Whether a promise produced at `node` is awaited or handed back to the caller. */
function isAwaitedOrReturned(node: ESTree.CallExpression): boolean {
  const parent = node.parent;
  if (parent.type === "AwaitExpression" || parent.type === "ReturnStatement") {
    return true;
  }
  return parent.type === "ArrowFunctionExpression" && parent.body === node;
}

const noUnawaitedAsyncMatcher = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `expect(...).rejects` and `.resolves` assertions to be awaited or returned.",
    },
    messages: {
      unawaited:
        "This async assertion is never awaited, so a failure is silently lost. `await` it or `return` it.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!startsAsyncMatcherChain(node.callee) || isAwaitedOrReturned(node)) {
          return;
        }
        context.report({ node, messageId: "unawaited" });
      },
    };
  },
});

/** The name a specifier imports, for both `{ test }` and `{ "test" as run }`. */
function importedName(specifier: ESTree.ImportSpecifier): string {
  const imported = specifier.imported;
  return imported.type === "Identifier" ? imported.name : imported.value;
}

/**
 * Records the local bindings for the focusable functions and the namespace
 * that one `bun:test` import declaration brings in.
 */
function collectBunTestBindings(
  declaration: ESTree.ImportDeclaration,
  functionNames: Set<string>,
  namespaceNames: Set<string>,
): void {
  if (declaration.source.value !== "bun:test") {
    return;
  }
  for (const specifier of declaration.specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier") {
      namespaceNames.add(specifier.local.name);
    } else if (
      specifier.type === "ImportSpecifier" &&
      focusableTestFunctions.has(importedName(specifier))
    ) {
      functionNames.add(specifier.local.name);
    }
  }
}

/**
 * Whether `node` names a focusable function imported from `bun:test`, either
 * directly (`test`) or through a namespace import (`bun.test`).
 */
function isBunTestFunction(
  node: ESTree.Node,
  functionNames: ReadonlySet<string>,
  namespaceNames: ReadonlySet<string>,
): boolean {
  if (node.type === "Identifier") {
    return functionNames.has(node.name);
  }
  return (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    namespaceNames.has(node.object.name) &&
    isNamedMember(node, focusableTestFunctions)
  );
}

const noFocusedBunTests = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow `.only` on `test`, `it` and `describe` imported from `bun:test`.",
    },
    messages: {
      focused:
        "A focused test skips every other test in the run. Remove `.only` before committing.",
    },
    schema: [],
  },
  create(context) {
    const functionNames = new Set<string>();
    const namespaceNames = new Set<string>();
    return {
      ImportDeclaration(node) {
        collectBunTestBindings(node, functionNames, namespaceNames);
      },
      MemberExpression(node) {
        if (
          isNamedMember(node, onlyModifier) &&
          isBunTestFunction(node.object, functionNames, namespaceNames)
        ) {
          context.report({ node, messageId: "focused" });
        }
      },
    };
  },
});

/** Project-local Oxlint rules, loaded as a jsPlugin under the `local` alias. */
export default definePlugin({
  meta: { name: "local" },
  rules: {
    "no-non-doc-comments": noNonDocComments,
    "require-description": requireDescription,
    "no-unawaited-async-matcher": noUnawaitedAsyncMatcher,
    "no-focused-bun-tests": noFocusedBunTests,
  },
});
