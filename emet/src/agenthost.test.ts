import { describe, expect, test } from "bun:test";
import { claudeHost, resolveAgentHost } from "./agenthost";

describe("resolveAgentHost", () => {
  test("returns the Claude adapter for claude", () => {
    expect(resolveAgentHost("claude")).toBe(claudeHost);
  });

  test("throws unknown agent host for an unregistered name", () => {
    expect(() => resolveAgentHost("codex")).toThrow("unknown agent host");
  });

  test("resolves from an injected registry", () => {
    expect(resolveAgentHost("codex", { codex: claudeHost })).toBe(claudeHost);
  });
});
