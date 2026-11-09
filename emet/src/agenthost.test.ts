import { describe, expect, test } from "bun:test";
import { claudeHost, resolveAgentHost, type HostRegistry } from "./agenthost";
import { codexHost, registerCodexHost } from "./agenthost-codex";
import { DEFAULT_FORGE_CONFIG } from "./config";
import { agentHostOfConfig } from "./dependencies";

describe("resolveAgentHost", () => {
  test("returns the Claude adapter for claude", () => {
    expect(resolveAgentHost("claude")).toBe(claudeHost);
  });

  test("returns the Codex adapter for codex with no prior registration", () => {
    expect(resolveAgentHost("codex")).toBe(codexHost);
  });

  test("throws unknown agent host for an unregistered name", () => {
    expect(() => resolveAgentHost("codex", {})).toThrow("unknown agent host");
  });

  test("resolves from an injected registry", () => {
    expect(resolveAgentHost("codex", { codex: claudeHost })).toBe(claudeHost);
  });

  test("registering Codex twice into a registry is idempotent", () => {
    const registry: HostRegistry = { claude: claudeHost };
    registerCodexHost(registry);
    registerCodexHost(registry);
    expect(resolveAgentHost("codex", registry)).toBe(codexHost);
    expect(resolveAgentHost("claude", registry)).toBe(claudeHost);
  });
});

describe("agentHostOfConfig", () => {
  test("is Claude when agentHost is unset", () => {
    expect(agentHostOfConfig(DEFAULT_FORGE_CONFIG)).toBe(claudeHost);
  });

  test("is Codex for agentHost codex without any registration", () => {
    expect(agentHostOfConfig({ ...DEFAULT_FORGE_CONFIG, agentHost: "codex" })).toBe(codexHost);
  });
});
