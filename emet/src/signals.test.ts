import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { onInterrupt } from "./signals";

class ExitSignal extends Error {
  readonly exitCode: number | string | null | undefined;

  constructor(exitCode: number | string | null | undefined) {
    super("exit");
    this.exitCode = exitCode;
  }
}

function interrupt(): number | string | null | undefined {
  try {
    const handler = process.listeners("SIGINT").at(-1);
    handler?.("SIGINT");
  } catch (error) {
    if (error instanceof ExitSignal) return error.exitCode;
    throw error;
  }
  return undefined;
}

describe("onInterrupt", () => {
  const originalExit = process.exit.bind(process);

  beforeEach(() => {
    process.exit = mock((code?: number | string | null): never => {
      throw new ExitSignal(code);
    });
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("runs the cleanup then exits 130 on SIGINT", () => {
    const calls: string[] = [];
    const dispose = onInterrupt(() => calls.push("cleanup"));
    const code = interrupt();
    dispose();
    expect(calls).toEqual(["cleanup"]);
    expect(code).toBe(130);
  });

  it("exits 130 without a cleanup", () => {
    const dispose = onInterrupt();
    const code = interrupt();
    dispose();
    expect(code).toBe(130);
  });

  it("still exits 130 when the cleanup throws", () => {
    const dispose = onInterrupt(() => {
      throw new Error("cleanup failed");
    });
    const code = interrupt();
    dispose();
    expect(code).toBe(130);
  });

  it("removes the handler on dispose", () => {
    const before = process.listenerCount("SIGINT");
    const dispose = onInterrupt();
    expect(process.listenerCount("SIGINT")).toBe(before + 1);
    dispose();
    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});
