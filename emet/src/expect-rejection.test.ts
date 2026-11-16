import { describe, expect, test } from "bun:test";

import { expectRejection } from "./expect-rejection";

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
