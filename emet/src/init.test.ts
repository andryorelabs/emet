import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CONFIG_SCHEMA_URL,
  buildForgeConfig,
  buildTrackerConfig,
  deriveIdPrefix,
  defaultBootstrap,
  defaultSelfCheck,
  detectGoSelfCheck,
  detectJsSelfCheck,
  detectPackageManager,
  detectTrackerKind,
  detectTrunk,
  hasLinearMcpServer,
  parseInitArguments,
  substituteTemplate,
  upsertEmetSection,
  type DetectedRepoInfo,
} from "./init";

describe("deriveIdPrefix", () => {
  test("takes the first three letters, uppercased", () => {
    expect(deriveIdPrefix("nfkit")).toBe("NFK");
    expect(deriveIdPrefix("le-petit-prince")).toBe("LEP");
  });

  test("strips non-letters before taking the prefix", () => {
    expect(deriveIdPrefix("a-1-b")).toBe("AB");
  });

  test("falls back to TICKET for a basename with no letters", () => {
    expect(deriveIdPrefix("1234")).toBe("TICKET");
    expect(deriveIdPrefix("")).toBe("TICKET");
  });
});

describe("substituteTemplate", () => {
  test("replaces every known placeholder", () => {
    expect(substituteTemplate("hello {{NAME}}, you are {{ROLE}}", { NAME: "x", ROLE: "y" })).toBe(
      "hello x, you are y",
    );
  });

  test("throws on an unresolved placeholder", () => {
    expect(() => substituteTemplate("hello {{MISSING}}", {})).toThrow(
      /unknown placeholder \{\{MISSING\}\}/,
    );
  });
});

describe("parseInitArguments", () => {
  test("defaults to force: false, no tracker override", () => {
    expect(parseInitArguments([])).toEqual({ force: false, trackerOverride: null });
  });

  test("parses --force", () => {
    expect(parseInitArguments(["--force"])).toEqual({ force: true, trackerOverride: null });
  });

  test("parses --tracker <kind>", () => {
    expect(parseInitArguments(["--tracker", "github"])).toEqual({
      force: false,
      trackerOverride: "github",
    });
  });

  test("rejects an unknown --tracker value", () => {
    expect(() => parseInitArguments(["--tracker", "jira"])).toThrow(
      /--tracker must be one of linear\|github\|local/,
    );
  });
});

describe("buildForgeConfig", () => {
  test("materializes every field from the detected info", () => {
    const detected: DetectedRepoInfo = {
      repoName: "nfkit",
      packageManager: "bun",
      trunk: "main",
      trunkWasDetected: true,
      tracker: "local",
      idPrefix: "NFK",
      selfCheck: ["bun run check"],
    };
    const config = buildForgeConfig(detected);
    expect(config.repo).toEqual({ trunk: "main", remote: "origin" });
    expect(config.ticket).toEqual({
      idPattern: String.raw`^[a-z0-9-]+-\d{2,}$`,
      branchPrefix: "emet",
    });
    expect(config.landing.mode).toBe("pr");
    expect(config.version).toBe(1);
    expect(config.concurrency.waveSize).toBeGreaterThan(0);
    expect(config.tracker).toEqual({ kind: "local" });
    expect(config.preflight.requiredCommands).toEqual([]);
  });

  test("local with no remote defaults landing.mode to merge", () => {
    const detected: DetectedRepoInfo = {
      repoName: "nfkit",
      packageManager: "bun",
      trunk: "main",
      trunkWasDetected: true,
      tracker: "local",
      idPrefix: "NFK",
      selfCheck: [],
      hasRemote: false,
    };
    expect(buildForgeConfig(detected).landing.mode).toBe("merge");
    expect(buildForgeConfig({ ...detected, hasRemote: true }).landing.mode).toBe("pr");
    expect(buildForgeConfig({ ...detected, tracker: "github" }).landing.mode).toBe("pr");
  });

  test("seeds preflight.requiredCommands with gh for a github tracker", () => {
    const detected: DetectedRepoInfo = {
      repoName: "nfkit",
      packageManager: "bun",
      trunk: "main",
      trunkWasDetected: true,
      tracker: "github",
      idPrefix: "NFK",
      selfCheck: [],
    };
    expect(buildForgeConfig(detected).preflight.requiredCommands).toEqual(["gh"]);
  });
});

describe("buildTrackerConfig", () => {
  const base: DetectedRepoInfo = {
    repoName: "nfkit",
    packageManager: "bun",
    trunk: "main",
    trunkWasDetected: true,
    tracker: "local",
    idPrefix: "NFK",
    selfCheck: [],
  };

  test("linear: onPrOpen/onPrMerge automatic, no per-kind sub-object", () => {
    const tracker = buildTrackerConfig({ ...base, tracker: "linear" });
    expect(tracker.kind).toBe("linear");
    expect(tracker.transitions).toEqual({
      onStart: "worker",
      onPrOpen: "automatic",
      onPrMerge: "automatic",
    });
    expect(tracker.github).toBeUndefined();
    expect(tracker.local).toBeUndefined();
  });

  test("github: onPrOpen coordinator (label swap), onPrMerge automatic (closing keyword), stateLabels match emet init's own label creation", () => {
    const tracker = buildTrackerConfig({ ...base, tracker: "github" });
    expect(tracker.kind).toBe("github");
    expect(tracker.transitions).toEqual({
      onStart: "worker",
      onPrOpen: "coordinator",
      onPrMerge: "automatic",
    });
    expect(tracker.github).toEqual({
      priorityLabels: {},
      stateLabels: {
        todo: "status:todo",
        "in-progress": "status:in-progress",
        "in-review": "status:in-review",
      },
    });
  });

  test("local: every transition is coordinator and no local.idPrefix is written", () => {
    const tracker = buildTrackerConfig({ ...base, tracker: "local", idPrefix: "NFK" });
    expect(tracker.kind).toBe("local");
    expect(tracker.transitions).toEqual({
      onStart: "coordinator",
      onPrOpen: "coordinator",
      onPrMerge: "coordinator",
    });
    expect(tracker.local).toBeUndefined();
  });

  test("no kind writes the deprecated readyLabel, triageLabels or prReference", () => {
    for (const tracker of ["linear", "github", "local"] as const) {
      const config = buildTrackerConfig({ ...base, tracker });
      expect(config).not.toHaveProperty("readyLabel");
      expect(config).not.toHaveProperty("triageLabels");
      expect(config).not.toHaveProperty("prReference");
    }
  });
});

describe("filesystem-based detection", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-init-test-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  test("detectPackageManager: bun.lock wins", async () => {
    await Bun.write(path.join(repoRoot, "bun.lock"), "");
    expect(await detectPackageManager(repoRoot)).toBe("bun");
  });

  test("detectPackageManager: pnpm-lock.yaml -> pnpm", async () => {
    await Bun.write(path.join(repoRoot, "pnpm-lock.yaml"), "");
    expect(await detectPackageManager(repoRoot)).toBe("pnpm");
  });

  test("detectPackageManager: package-lock.json -> npm", async () => {
    await Bun.write(path.join(repoRoot, "package-lock.json"), "");
    expect(await detectPackageManager(repoRoot)).toBe("npm");
  });

  test("detectPackageManager: bare package.json -> npm", async () => {
    await Bun.write(path.join(repoRoot, "package.json"), "{}");
    expect(await detectPackageManager(repoRoot)).toBe("npm");
  });

  test("detectPackageManager: packageManager field when no lockfile", async () => {
    await Bun.write(path.join(repoRoot, "package.json"), '{"packageManager":"pnpm@9.1.0"}');
    expect(await detectPackageManager(repoRoot)).toBe("pnpm");
  });

  test("detectPackageManager: yarn.lock -> yarn", async () => {
    await Bun.write(path.join(repoRoot, "yarn.lock"), "");
    expect(await detectPackageManager(repoRoot)).toBe("yarn");
  });

  test("detectPackageManager: uv.lock -> uv, poetry.lock -> poetry", async () => {
    await Bun.write(path.join(repoRoot, "pyproject.toml"), "[project]\n");
    await Bun.write(path.join(repoRoot, "uv.lock"), "");
    expect(await detectPackageManager(repoRoot)).toBe("uv");
    rmSync(path.join(repoRoot, "uv.lock"));
    await Bun.write(path.join(repoRoot, "poetry.lock"), "");
    expect(await detectPackageManager(repoRoot)).toBe("poetry");
  });

  test("detectPackageManager: requirements.txt and setup.py -> pip", async () => {
    await Bun.write(path.join(repoRoot, "requirements.txt"), "");
    expect(await detectPackageManager(repoRoot)).toBe("pip");
    rmSync(path.join(repoRoot, "requirements.txt"));
    await Bun.write(path.join(repoRoot, "setup.py"), "");
    expect(await detectPackageManager(repoRoot)).toBe("pip");
  });

  test("detectPackageManager: go.mod with no package.json -> go", async () => {
    await Bun.write(path.join(repoRoot, "go.mod"), "module example.com/x\n");
    expect(await detectPackageManager(repoRoot)).toBe("go");
  });

  test("detectPackageManager: Cargo.toml -> cargo", async () => {
    await Bun.write(path.join(repoRoot, "Cargo.toml"), "[package]\n");
    expect(await detectPackageManager(repoRoot)).toBe("cargo");
  });

  test("detectPackageManager: pyproject.toml -> pip", async () => {
    await Bun.write(path.join(repoRoot, "pyproject.toml"), "[project]\n");
    expect(await detectPackageManager(repoRoot)).toBe("pip");
  });

  test("detectPackageManager: nothing recognizable -> unknown", async () => {
    expect(await detectPackageManager(repoRoot)).toBe("unknown");
  });

  test("hasLinearMcpServer: true when a server key mentions linear", async () => {
    await Bun.write(
      path.join(repoRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { "linear-server": { command: "npx", args: ["mcp-remote"] } } }),
    );
    expect(await hasLinearMcpServer(repoRoot)).toBe(true);
  });

  test("hasLinearMcpServer: true when only the args mention linear", async () => {
    await Bun.write(
      path.join(repoRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          issues: { command: "npx", args: ["mcp-remote", "https://mcp.linear.app/sse"] },
        },
      }),
    );
    expect(await hasLinearMcpServer(repoRoot)).toBe(true);
  });

  test("hasLinearMcpServer: false with no .mcp.json", async () => {
    expect(await hasLinearMcpServer(repoRoot)).toBe(false);
  });

  test("hasLinearMcpServer: false when present but unrelated", async () => {
    await Bun.write(
      path.join(repoRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { supabase: { command: "bun", args: ["run", "mcp.ts"] } } }),
    );
    expect(await hasLinearMcpServer(repoRoot)).toBe(false);
  });

  test("hasLinearMcpServer: false on malformed JSON, never throws", async () => {
    await Bun.write(path.join(repoRoot, ".mcp.json"), "{not json");
    expect(await hasLinearMcpServer(repoRoot)).toBe(false);
  });

  test("detectTrunk: null outside a git repository", async () => {
    expect(await detectTrunk(repoRoot)).toBeNull();
  });

  test("detectTrunk: null when origin/HEAD symref is unset, even inside a repo", async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet();
    expect(await detectTrunk(repoRoot)).toBeNull();
  });

  test("detectTrunk: resolves the trunk from a real origin/HEAD symref, regardless of the current branch", async () => {
    const remoteRoot = mkdtempSync(path.join(os.tmpdir(), "emet-init-remote-"));
    try {
      await Bun.$`git -C ${remoteRoot} init --quiet --bare --initial-branch=main`.quiet();
      await Bun.$`git -C ${repoRoot} init --quiet --initial-branch=main`.quiet();
      await Bun.$`git -C ${repoRoot} config user.email test@example.com`.quiet();
      await Bun.$`git -C ${repoRoot} config user.name test`.quiet();
      await Bun.$`git -C ${repoRoot} commit --quiet --allow-empty -m init`.quiet();
      await Bun.$`git -C ${repoRoot} remote add origin ${remoteRoot}`.quiet();
      await Bun.$`git -C ${repoRoot} push --quiet origin main`.quiet();
      await Bun.$`git -C ${repoRoot} remote set-head origin main`.quiet();
      await Bun.$`git -C ${repoRoot} checkout --quiet -b some-feature-branch`.quiet();

      expect(await detectTrunk(repoRoot)).toBe("main");
    } finally {
      rmSync(remoteRoot, { recursive: true, force: true });
    }
  });

  test('detectJsSelfCheck: prefers a single "check" script', async () => {
    await Bun.write(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ scripts: { check: "x", lint: "y", typecheck: "z" } }),
    );
    expect(await detectJsSelfCheck(repoRoot, "bun")).toEqual(["bun run check"]);
  });

  test('detectJsSelfCheck: falls back to lint+typecheck when no "check" script', async () => {
    await Bun.write(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ scripts: { lint: "y", typecheck: "z" } }),
    );
    expect(await detectJsSelfCheck(repoRoot, "pnpm")).toEqual([
      "pnpm run lint",
      "pnpm run typecheck",
    ]);
  });

  test('detectJsSelfCheck: npm uses "npm run", not "npm run run"', async () => {
    await Bun.write(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ scripts: { check: "x" } }),
    );
    expect(await detectJsSelfCheck(repoRoot, "npm")).toEqual(["npm run check"]);
  });

  test("detectJsSelfCheck: empty when neither script exists", async () => {
    await Bun.write(path.join(repoRoot, "package.json"), JSON.stringify({ scripts: {} }));
    expect(await detectJsSelfCheck(repoRoot, "bun")).toEqual([]);
  });

  test("detectJsSelfCheck: empty with no package.json at all", async () => {
    expect(await detectJsSelfCheck(repoRoot, "bun")).toEqual([]);
  });

  test("detectGoSelfCheck: the fixed pair with no Makefile", async () => {
    expect(await detectGoSelfCheck(repoRoot)).toEqual(["go build ./...", "go test ./..."]);
  });

  test('detectGoSelfCheck: adds "make lint" only if the Makefile declares that target', async () => {
    await Bun.write(path.join(repoRoot, "Makefile"), "lint:\n\tgolangci-lint run\n");
    expect(await detectGoSelfCheck(repoRoot)).toEqual([
      "go build ./...",
      "go test ./...",
      "make lint",
    ]);
  });

  test("detectGoSelfCheck: a Makefile without a lint target does not add it", async () => {
    await Bun.write(path.join(repoRoot, "Makefile"), "build:\n\tgo build ./...\n");
    expect(await detectGoSelfCheck(repoRoot)).toEqual(["go build ./...", "go test ./..."]);
  });

  test("detectTrackerKind: null when there is no Linear MCP server, issue usage or .scratch/", async () => {
    expect(await detectTrackerKind(repoRoot)).toBeNull();
  });

  test("detectTrackerKind: local when .scratch/ exists", async () => {
    await Bun.$`mkdir -p ${path.join(repoRoot, ".scratch", "feature")}`.quiet();
    expect(await detectTrackerKind(repoRoot)).toBe("local");
  });

  test("detectTrackerKind: linear takes priority over any GitHub signal", async () => {
    await Bun.write(
      path.join(repoRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { "linear-server": { command: "npx", args: [] } } }),
    );
    expect(await detectTrackerKind(repoRoot)).toBe("linear");
  });
});

describe("issue-tracker templates carry the v2 spec and ticket blocks", () => {
  const templatesDirectory = path.resolve(import.meta.dir, "..", "templates");

  for (const kind of ["github", "linear", "local"] as const) {
    test(`${kind}: documents Global Constraints, Review Focus and Interfaces`, async () => {
      const content = await Bun.file(
        path.join(templatesDirectory, `issue-tracker-${kind}.md.tpl`),
      ).text();
      expect(content).toContain("## Global Constraints");
      expect(content).toContain("## Review Focus");
      expect(content).toContain("## Interfaces");
      expect(content).toContain("Covers:");
    });
  }
});

describe("ecosystem defaults", () => {
  test("defaultSelfCheck is non-empty per ecosystem", () => {
    expect(defaultSelfCheck("cargo")).toEqual(["cargo test", "cargo clippy -- -D warnings"]);
    expect(defaultSelfCheck("uv")).toEqual(["uv run pytest"]);
    expect(defaultSelfCheck("poetry")).toEqual(["poetry run pytest"]);
    expect(defaultSelfCheck("pip")).toEqual(["pytest"]);
    expect(defaultSelfCheck("go")).toEqual(["go build ./...", "go test ./..."]);
    expect(defaultSelfCheck("unknown")).toEqual([]);
  });

  test("defaultBootstrap matches the spec per ecosystem", () => {
    expect(defaultBootstrap("bun")).toEqual(["bun install --frozen-lockfile"]);
    expect(defaultBootstrap("pnpm")).toEqual(["pnpm install --frozen-lockfile"]);
    expect(defaultBootstrap("yarn")).toEqual(["yarn install --immutable"]);
    expect(defaultBootstrap("npm")).toEqual(["npm ci"]);
    expect(defaultBootstrap("uv")).toEqual(["uv sync"]);
    expect(defaultBootstrap("poetry")).toEqual(["poetry install"]);
    expect(defaultBootstrap("go")).toEqual(["go mod download"]);
    expect(defaultBootstrap("cargo")).toEqual(["cargo fetch"]);
    expect(defaultBootstrap("pip")).not.toEqual([]);
  });
});

describe("upsertEmetSection", () => {
  test("appends to existing content without touching it", () => {
    const result = upsertEmetSection("# Mine\n\nuser text\n", "emet body");
    expect(result.startsWith("# Mine\n\nuser text\n")).toBe(true);
    expect(result).toContain("<!-- emet:begin -->\nemet body\n<!-- emet:end -->");
  });

  test("is idempotent and replaces a previous section, keeping surrounding text", () => {
    const once = upsertEmetSection("before\n", "v1");
    const twice = upsertEmetSection(once, "v1");
    expect(twice).toBe(once);
    const replaced = upsertEmetSection(`${once}\nafter\n`, "v2");
    expect(replaced.match(/emet:begin/g)).toHaveLength(1);
    expect(replaced).toContain("v2");
    expect(replaced).not.toContain("v1");
    expect(replaced.startsWith("before\n")).toBe(true);
    expect(replaced.endsWith("\nafter\n")).toBe(true);
  });

  test("creates the section in an empty file", () => {
    expect(upsertEmetSection("", "x")).toBe("<!-- emet:begin -->\nx\n<!-- emet:end -->\n");
  });
});

function readIfPresent(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("emet init --tracker local end to end", () => {
  let repoRoot = "";
  const entry = path.resolve(import.meta.dir, "init.ts");

  setDefaultTimeout(30_000);

  beforeEach(async () => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-init-local-"));
    await Bun.$`git init -q -b main ${repoRoot}`.quiet();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  async function runInit(extra: readonly string[] = []): Promise<void> {
    const result = await Bun.$`bun ${entry} --tracker local ${extra}`
      .cwd(repoRoot)
      .nothrow()
      .quiet();
    expect(result.exitCode).toBe(0);
  }

  test("no remote: merge landing, local id pattern, .scratch/ ignored, no tickets un-ignore", async () => {
    await runInit();
    const config: unknown = await Bun.file(path.join(repoRoot, "emet.config.json")).json();
    expect(config).toMatchObject({
      landing: { mode: "merge" },
      ticket: { idPattern: String.raw`^[a-z0-9-]+-\d{2,}$`, branchPrefix: "emet" },
      tracker: { kind: "local" },
    });
    expect(config).not.toHaveProperty("tracker.local");
    const gitignore = await Bun.file(path.join(repoRoot, ".gitignore")).text();
    expect(gitignore).toContain(".scratch/");
    expect(gitignore).not.toContain("!.emet/tickets/");
    const doc = await Bun.file(path.join(repoRoot, "docs", "agents", "issue-tracker.md")).text();
    expect(doc).toContain("emet tracker create-ticket --spec");
  });

  test("writes only new names: no file contains the legacy product name", async () => {
    await runInit();
    const written = [
      "emet.config.json",
      ".gitignore",
      ...readdirSync(path.join(repoRoot, "docs", "agents")).map((name) => `docs/agents/${name}`),
    ];
    expect(existsSync(path.join(repoRoot, "docs", "agents", "emet.md"))).toBe(true);
    for (const relative of written) {
      const content = readFileSync(path.join(repoRoot, relative), "utf8");
      expect(content.toLowerCase()).not.toContain("forge");
    }
    const config: unknown = await Bun.file(path.join(repoRoot, "emet.config.json")).json();
    expect(config).toMatchObject({
      $schema: CONFIG_SCHEMA_URL,
    });
  });

  test("a legacy forge.config.json blocks init without --force", async () => {
    await Bun.write(path.join(repoRoot, "forge.config.json"), "{}");
    const result = await Bun.$`bun ${entry} --tracker local`.cwd(repoRoot).nothrow().quiet();
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("forge.config.json already exists");
  });

  test("a legacy forge:begin section in a shared doc is replaced, not duplicated", async () => {
    const docPath = path.join(repoRoot, "docs", "agents", "domain.md");
    await Bun.write(docPath, "mine\n<!-- forge:begin -->\nold\n<!-- forge:end -->\n");
    await runInit();
    const doc = await Bun.file(docPath).text();
    expect(doc).not.toContain("forge:begin");
    expect(doc.match(/emet:begin/g)).toHaveLength(1);
    expect(doc.startsWith("mine\n")).toBe(true);
  });

  test("a legacy .forge/ ignore rule is kept and .emet/ is still ignored", async () => {
    await Bun.write(path.join(repoRoot, ".gitignore"), ".forge/\n");
    await runInit();
    const gitignore = await Bun.file(path.join(repoRoot, ".gitignore")).text();
    expect(gitignore).toContain(".forge/");
    expect(gitignore).toContain(".emet/");
  });

  test("with a remote: pr landing", async () => {
    await Bun.$`git -C ${repoRoot} remote add origin https://example.invalid/x.git`.quiet();
    await runInit();
    const config: unknown = await Bun.file(path.join(repoRoot, "emet.config.json")).json();
    expect(config).toMatchObject({ landing: { mode: "pr" } });
  });

  async function runInitWithFakeHosts(
    agentHost: "codex" | "claude",
  ): Promise<{ stdout: string; claudeCalls: string; codexCalls: string }> {
    const fakeBin = mkdtempSync(path.join(os.tmpdir(), "emet-init-fakebin-"));
    const claudeLog = path.join(fakeBin, "claude.log");
    const codexLog = path.join(fakeBin, "codex.log");
    for (const [name, log] of [
      ["claude", claudeLog],
      ["codex", codexLog],
    ] as const) {
      const script = path.join(fakeBin, name);
      writeFileSync(script, `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
      chmodSync(script, 0o755);
    }
    writeFileSync(
      path.join(repoRoot, "emet.config.json"),
      `${JSON.stringify({ version: 1, agentHost })}\n`,
    );
    try {
      const result = await Bun.$`bun ${entry} --tracker local --force`
        .cwd(repoRoot)
        .env({ ...process.env, PATH: `${fakeBin}:${process.env["PATH"] ?? ""}` })
        .nothrow()
        .quiet();
      expect(result.exitCode).toBe(0);
      return {
        stdout: result.stdout.toString(),
        claudeCalls: readIfPresent(claudeLog),
        codexCalls: readIfPresent(codexLog),
      };
    } finally {
      rmSync(fakeBin, { recursive: true, force: true });
    }
  }

  test("an existing Codex config probes codex and never calls or names claude", async () => {
    const { stdout, claudeCalls, codexCalls } = await runInitWithFakeHosts("codex");
    expect(claudeCalls).toBe("");
    expect(codexCalls).toContain("plugin list");
    expect(stdout.toLowerCase()).not.toContain("claude plugin");
  });

  test("--force keeps agentHost and the codex section of an existing Codex config", async () => {
    writeFileSync(
      path.join(repoRoot, "emet.config.json"),
      `${JSON.stringify({ version: 1, agentHost: "codex", codex: { sandbox: "read-only" } })}\n`,
    );
    const result = await Bun.$`bun ${entry} --tracker local --force`
      .cwd(repoRoot)
      .nothrow()
      .quiet();
    expect(result.exitCode).toBe(0);
    const config: unknown = await Bun.file(path.join(repoRoot, "emet.config.json")).json();
    expect(config).toMatchObject({ agentHost: "codex", codex: { sandbox: "read-only" } });
  });

  test("--force on a Claude config writes no agentHost key", async () => {
    writeFileSync(path.join(repoRoot, "emet.config.json"), `${JSON.stringify({ version: 1 })}\n`);
    await Bun.$`bun ${entry} --tracker local --force`.cwd(repoRoot).nothrow().quiet();
    const text = await Bun.file(path.join(repoRoot, "emet.config.json")).text();
    expect(text).not.toContain('"agentHost"');
  });

  test("an existing Claude config still probes claude plugin list", async () => {
    const { claudeCalls, codexCalls } = await runInitWithFakeHosts("claude");
    expect(claudeCalls).toContain("plugin list");
    expect(codexCalls).toBe("");
  });

  test("re-running does not duplicate .scratch/ in .gitignore", async () => {
    await runInit();
    await runInit(["--force"]);
    const gitignore = await Bun.file(path.join(repoRoot, ".gitignore")).text();
    expect(gitignore.match(/\.scratch\//g)).toHaveLength(1);
  });
});
