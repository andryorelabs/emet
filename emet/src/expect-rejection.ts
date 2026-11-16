import { expect } from "bun:test";

/**
 * Asserts that a promise rejects, optionally with an error message matching a pattern.
 * Awaitable, unlike `expect(...).rejects`, whose matcher is typed as returning void.
 * @param promise The promise expected to reject.
 * @param pattern A pattern the rejection message must match.
 */
export async function expectRejection(promise: Promise<unknown>, pattern?: RegExp): Promise<void> {
  const outcome = await promise.then(
    () => ({ rejected: false as const }),
    (reason: unknown) => ({ rejected: true as const, reason }),
  );
  expect(outcome.rejected).toBe(true);
  if (pattern !== undefined && outcome.rejected) {
    const message =
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    expect(message).toMatch(pattern);
  }
}
