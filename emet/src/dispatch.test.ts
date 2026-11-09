import { describe, expect, spyOn, test } from "bun:test";
import { run } from "./dispatch";

describe("dispatch stub", () => {
  test("prints usage and exits 2", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    expect(await run([])).toBe(2);
    expect(spy.mock.calls[0]?.[0]).toContain("usage: emet dispatch");
    spy.mockRestore();
  });
});
