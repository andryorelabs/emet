import { describe, expect, test } from "bun:test";

import { currentExitCode } from "./exit-code";
import { expectRejection } from "./expect-rejection";
import { present } from "./present";

async function assertionOutcome(assertion: Promise<void>): Promise<"passed" | "failed"> {
  return assertion.then(
    () => "passed",
    () => "failed",
  );
}

describe("expectRejection", () => {
  test("passes for a matching rejection and a rejection without a pattern", async () => {
    expect(await assertionOutcome(expectRejection(Promise.reject(new Error("boom")), /boom/))).toBe(
      "passed",
    );
    expect(await assertionOutcome(expectRejection(Promise.reject(new Error("any"))))).toBe(
      "passed",
    );
    expect(
      await assertionOutcome(expectRejection(Promise.reject(new TypeError("plain")), /plain/)),
    ).toBe("passed");
  });

  test("fails when the promise resolves or the message does not match", async () => {
    expect(await assertionOutcome(expectRejection(Promise.resolve(1)))).toBe("failed");
    expect(
      await assertionOutcome(expectRejection(Promise.reject(new Error("other")), /boom/)),
    ).toBe("failed");
  });
});

describe("present", () => {
  test("returns a defined value unchanged", () => {
    expect(present("value")).toBe("value");
    expect(present(0)).toBe(0);
  });

  test("throws naming the missing value for null and undefined", () => {
    expect(() => {
      present(undefined, "the ticket");
    }).toThrow("Expected the ticket to be present");
    expect(() => {
      present(null);
    }).toThrow("Expected value to be present");
  });
});

describe("currentExitCode", () => {
  test("reads the exit code and defaults an unset one to 0", () => {
    const original = process.exitCode;
    try {
      process.exitCode = undefined;
      expect(currentExitCode()).toBe(0);
      process.exitCode = 3;
      expect(currentExitCode()).toBe(3);
    } finally {
      process.exitCode = original;
    }
  });
});
