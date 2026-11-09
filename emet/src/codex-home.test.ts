import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { COMMIT_RULES, buildRunHome, hooksFileText, renderOverlayConfig } from "./codex-home";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
  scratch.push(dir);
  return dir;
}

function sourceHome(): string {
  const dir = tempDir();
  writeFileSync(path.join(dir, "auth.json"), '{"token":"secret"}');
  writeFileSync(path.join(dir, "config.toml"), 'model = "x"\n');
  return dir;
}

describe("COMMIT_RULES", () => {
  test("allows add and commit and forbids push", () => {
    expect(COMMIT_RULES).toContain('pattern = ["git", "add"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "commit"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "push"], decision = "forbidden"');
  });

  test("allows git -C forms, status, worktree and the emet coordination subcommands", () => {
    expect(COMMIT_RULES).toContain('pattern = ["git", "-C"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "status"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "worktree"], decision = "allow"');
    expect(COMMIT_RULES).toContain(
      'pattern = ["emet", ["dispatch", "review-run", "launch", "claims", "slots", "results", "handoff"]], decision = "allow"',
    );
  });

  test("never allows a bare git push prefix", () => {
    const allowLines = COMMIT_RULES.split("\n").filter((line) => line.includes('"allow"'));
    expect(allowLines.some((line) => line.includes('"push"'))).toBe(false);
  });
});

describe("renderOverlayConfig", () => {
  test("writes the marketplace, the enabled plugin, trusted dirs and the model", () => {
    const text = renderOverlayConfig({
      marketplacePath: "/opt/emet",
      trustedDirectories: ["/repo", '/odd "dir"'],
      model: "gpt-x",
      effort: "medium",
    });
    expect(text).toBe(
      [
        'model = "gpt-x"',
        'model_reasoning_effort = "medium"',
        "",
        "[marketplaces.emet-marketplace]",
        'source_type = "local"',
        'source = "/opt/emet"',
        "",
        '[plugins."emet@emet-marketplace"]',
        "enabled = true",
        "",
        '[projects."/repo"]',
        'trust_level = "trusted"',
        "",
        '[projects."/odd \\"dir\\""]',
        'trust_level = "trusted"',
        "",
      ].join("\n"),
    );
  });

  test("writes no trusted project, model or hook state when none is given", () => {
    const text = renderOverlayConfig({ marketplacePath: "/opt/emet", trustedDirectories: [] });
    expect(text).not.toContain("[projects.");
    expect(text).not.toContain("model");
    expect(text).not.toContain("hooks");
  });

  test("never writes the ultra effort", () => {
    const text = renderOverlayConfig({ trustedDirectories: [], effort: "ultra" });
    expect(text).not.toContain("ultra");
  });

  test("omits the marketplace and plugin tables without a marketplace path", () => {
    const text = renderOverlayConfig({ trustedDirectories: ["/r"] });
    expect(text).not.toContain("marketplaces");
    expect(text).not.toContain("plugins");
    expect(text).toContain('[projects."/r"]');
  });
});

describe("hooksFileText", () => {
  test("points PreToolUse and UserPromptSubmit at emet guard", () => {
    const text = hooksFileText();
    expect(text.startsWith("{")).toBe(true);
    expect(text).toContain('"PreToolUse"');
    expect(text).toContain('"UserPromptSubmit"');
    expect(text.split("EMET_AGENT_HOST=codex emet guard")).toHaveLength(3);
  });
});

describe("buildRunHome run id validation", () => {
  test("rejects a run id that would escape the runs directory", () => {
    const source = tempDir();
    expect(() => buildRunHome({ run: "../../x", repoRoot: tempDir(), sourceHome: source })).toThrow(
      "invalid run id",
    );
  });
});

describe("buildRunHome", () => {
  test("links auth only, writes config, rules and hooks, never copies secrets", () => {
    const source = sourceHome();
    const repoRoot = tempDir();
    const { codexHome } = buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    expect(codexHome).toBe(path.join(repoRoot, ".emet", "runs", "r1", "codex-home"));
    const authLink = path.join(codexHome, "auth.json");
    expect(lstatSync(authLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(authLink)).toBe(path.join(source, "auth.json"));
    expect(lstatSync(path.join(codexHome, "config.toml")).isFile()).toBe(true);
    expect(readFileSync(path.join(codexHome, "rules", "default.rules"), "utf8")).toBe(COMMIT_RULES);
    expect(readFileSync(path.join(codexHome, "hooks.json"), "utf8")).toBe(hooksFileText());
    const regularFiles = readdirSync(codexHome, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
    expect(regularFiles.join("")).not.toContain("secret");
  });

  test("never writes under the source home and rebuilds idempotently", () => {
    const source = sourceHome();
    const before = readdirSync(source, { recursive: true }).toSorted((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const repoRoot = tempDir();
    buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    expect(
      readdirSync(source, { recursive: true }).toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    ).toEqual(before);
    expect(readFileSync(path.join(source, "auth.json"), "utf8")).toBe('{"token":"secret"}');
  });

  test("skips links for files the source home lacks", () => {
    const source = tempDir();
    const { codexHome } = buildRunHome({ run: "r1", repoRoot: tempDir(), sourceHome: source });
    expect(readdirSync(codexHome).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "config.toml",
      "hooks.json",
      "rules",
    ]);
  });

  test("never copies a user table into the overlay config and leaves the source byte-identical", () => {
    const source = sourceHome();
    const userConfig = [
      'model = "user-model"',
      "",
      "[marketplaces.emet-marketplace]",
      'source_type = "local"',
      'source = "/opt/emet-plugin"',
      "",
      '[projects."/x"]',
      'trust_level = "trusted"',
      "",
      "[mcp_servers.private]",
      'command = "secret-server"',
      "",
    ].join("\n");
    writeFileSync(path.join(source, "config.toml"), userConfig);
    const repoRoot = tempDir();
    const { codexHome } = buildRunHome({
      run: "r1",
      repoRoot,
      sourceHome: source,
      trustedDirectories: [repoRoot],
      model: "gpt-run",
      effort: "high",
    });
    const overlayPath = path.join(codexHome, "config.toml");
    expect(lstatSync(overlayPath).isSymbolicLink()).toBe(false);
    const overlay = readFileSync(overlayPath, "utf8");
    expect(overlay).not.toContain('"/x"');
    expect(overlay).not.toContain("secret-server");
    expect(overlay).not.toContain("user-model");
    expect(overlay).toContain('source = "/opt/emet-plugin"');
    expect(overlay).toContain(`[projects.${JSON.stringify(repoRoot)}]`);
    expect(overlay).toContain('model = "gpt-run"');
    expect(overlay).toContain('model_reasoning_effort = "high"');
    expect(readFileSync(path.join(source, "config.toml"), "utf8")).toBe(userConfig);
  });

  test("replaces a config.toml symlink left by an older overlay without writing through it", () => {
    const source = sourceHome();
    const repoRoot = tempDir();
    const codexHome = path.join(repoRoot, ".emet", "runs", "r1", "codex-home");
    mkdirSync(codexHome, { recursive: true });
    symlinkSync(path.join(source, "config.toml"), path.join(codexHome, "config.toml"));
    buildRunHome({ run: "r1", repoRoot, sourceHome: source, trustedDirectories: [repoRoot] });
    expect(lstatSync(path.join(codexHome, "config.toml")).isSymbolicLink()).toBe(false);
    expect(readFileSync(path.join(source, "config.toml"), "utf8")).toBe('model = "x"\n');
  });

  test("links only the emet marketplace plugin cache when the source has it", () => {
    const source = sourceHome();
    const cache = path.join(source, "plugins", "cache", "emet-marketplace");
    mkdirSync(cache, { recursive: true });
    mkdirSync(path.join(source, "plugins", "cache", "other-marketplace"), { recursive: true });
    const { codexHome } = buildRunHome({ run: "r1", repoRoot: tempDir(), sourceHome: source });
    const linked = path.join(codexHome, "plugins", "cache", "emet-marketplace");
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(readlinkSync(linked)).toBe(cache);
    expect(lstatSync(path.join(codexHome, "plugins")).isSymbolicLink()).toBe(false);
    expect(readdirSync(path.join(codexHome, "plugins", "cache"))).toEqual(["emet-marketplace"]);
  });

  test("creates no plugin cache link when the source lacks it", () => {
    const { codexHome } = buildRunHome({
      run: "r1",
      repoRoot: tempDir(),
      sourceHome: sourceHome(),
    });
    expect(existsSync(path.join(codexHome, "plugins"))).toBe(false);
  });

  test("refuses to build inside the source home", () => {
    const source = tempDir();
    mkdirSync(path.join(source, ".emet"), { recursive: true });
    expect(() => buildRunHome({ run: "r1", repoRoot: source, sourceHome: source })).toThrow(
      "refusing to build a run home inside the source Codex home",
    );
  });
});
