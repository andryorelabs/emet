import { describe, expect, it } from "bun:test";

import { failureEnvelope, stringifySorted, successEnvelope } from "./envelope";
import { EmetError } from "./errors";

describe("successEnvelope", () => {
  it("carries the data and a null error", () => {
    expect(successEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 }, error: null });
  });
});

describe("failureEnvelope", () => {
  it("keeps the code, message and fix of an EmetError", () => {
    const thrown = new EmetError("config-invalid", "bad config", "fix the config");
    expect(failureEnvelope(thrown)).toEqual({
      ok: false,
      data: null,
      error: { code: "config-invalid", message: "bad config", fix: "fix the config" },
    });
  });

  it("maps a plain Error to an internal error", () => {
    const envelope = failureEnvelope(new Error("boom"), { partial: true });
    expect(envelope.ok).toBe(false);
    expect(envelope.data).toEqual({ partial: true });
    expect(envelope.error?.code).toBe("internal");
    expect(envelope.error?.message).toBe("boom");
  });

  it("stringifies a non-Error thrown value", () => {
    expect(failureEnvelope("oops").error?.message).toBe("oops");
  });
});

describe("stringifySorted", () => {
  it("sorts object keys at every depth", () => {
    const text = stringifySorted({ b: { d: 1, c: 2 }, a: [{ z: 1, y: 2 }] });
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
    expect(text.indexOf('"c"')).toBeLessThan(text.indexOf('"d"'));
    expect(text.indexOf('"y"')).toBeLessThan(text.indexOf('"z"'));
  });

  it("is stable for equal values with different key order", () => {
    expect(stringifySorted({ a: 1, b: 2 })).toBe(stringifySorted({ b: 2, a: 1 }));
  });

  it("passes primitives through", () => {
    expect(stringifySorted(null)).toBe("null");
    expect(stringifySorted("x")).toBe('"x"');
  });
});
