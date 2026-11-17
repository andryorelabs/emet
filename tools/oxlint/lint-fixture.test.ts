import { describe, expect, test } from "bun:test";

import { createLocalRuleLinter, parseDiagnosticMessages } from "./lint-fixture.ts";

describe("parseDiagnosticMessages", () => {
  test("keeps only the messages of the named rule", () => {
    const report = JSON.stringify({
      diagnostics: [
        { code: "local(no-thing)", message: "first" },
        { code: "eslint(other)", message: "ignored" },
        { code: "local(no-thing)", message: "second" },
      ],
    });
    expect(parseDiagnosticMessages(report, "", "no-thing")).toEqual(["first", "second"]);
  });

  test("returns no messages for an empty report", () => {
    expect(parseDiagnosticMessages('{"diagnostics":[]}', "", "no-thing")).toEqual([]);
  });

  test("throws with both streams when oxlint prints no JSON", () => {
    expect(() => parseDiagnosticMessages("not json", "boom", "no-thing")).toThrow(
      /oxlint printed no JSON report\.\nstdout: not json\nstderr: boom/,
    );
  });

  test.each(["null", "[]", '{"diagnostics":"none"}', '{"other":1}'])(
    "throws when the report %s has no diagnostics list",
    (report) => {
      expect(() => parseDiagnosticMessages(report, "", "no-thing")).toThrow(
        /oxlint report has no diagnostics/,
      );
    },
  );
});

describe("createLocalRuleLinter", () => {
  test("lints source with one local rule and numbers its fixtures", async () => {
    const linter = await createLocalRuleLinter("no-non-doc-comments");
    try {
      expect(await linter.lint("// a note\nexport const value = 1;\n")).toHaveLength(1);
      expect(await linter.lint("export const value = 1;\n")).toEqual([]);
    } finally {
      await linter.dispose();
    }
  });
});
