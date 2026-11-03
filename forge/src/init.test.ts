import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
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
  upsertForgeSection,
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
      branchPrefix: "forge",
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

  test("github: onPrOpen coordinator (label swap), onPrMerge automatic (closing keyword), stateLabels match forge init's own label creation", () => {
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

  test("every kind carries the same five canonical triage labels", () => {
    for (const tracker of ["linear", "github", "local"] as const) {
      const config = buildTrackerConfig({ ...base, tracker });
      expect(config.triageLabels).toEqual([
        "needs-triage",
        "needs-info",
        "ready-for-agent",
        "ready-for-human",
        "wontfix",
      ]);
      expect(config.readyLabel).toBe("ready-for-agent");
    }
  });
});

describe("filesystem-based detection", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "forge-init-test-"));
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
    const remoteRoot = mkdtempSync(path.join(os.tmpdir(), "forge-init-remote-"));
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

describe("upsertForgeSection", () => {
  test("appends to existing content without touching it", () => {
    const result = upsertForgeSection("# Mine\n\nuser text\n", "forge body");
    expect(result.startsWith("# Mine\n\nuser text\n")).toBe(true);
    expect(result).toContain("<!-- forge:begin -->\nforge body\n<!-- forge:end -->");
  });

  test("is idempotent and replaces a previous section, keeping surrounding text", () => {
    const once = upsertForgeSection("before\n", "v1");
    const twice = upsertForgeSection(once, "v1");
    expect(twice).toBe(once);
    const replaced = upsertForgeSection(`${once}\nafter\n`, "v2");
    expect(replaced.match(/forge:begin/g)).toHaveLength(1);
    expect(replaced).toContain("v2");
    expect(replaced).not.toContain("v1");
    expect(replaced.startsWith("before\n")).toBe(true);
    expect(replaced.endsWith("\nafter\n")).toBe(true);
  });

  test("creates the section in an empty file", () => {
    expect(upsertForgeSection("", "x")).toBe("<!-- forge:begin -->\nx\n<!-- forge:end -->\n");
  });
});

describe("forge init --tracker local end to end", () => {
  let repoRoot = "";
  const entry = path.resolve(import.meta.dir, "init.ts");

  setDefaultTimeout(30_000);

  beforeEach(async () => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "forge-init-local-"));
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
    const config = await Bun.file(path.join(repoRoot, "forge.config.json")).json();
    expect(config.landing.mode).toBe("merge");
    expect(config.ticket.idPattern).toBe(String.raw`^[a-z0-9-]+-\d{2,}$`);
    expect(config.ticket.branchPrefix).toBe("forge");
    expect(config.tracker.kind).toBe("local");
    expect(config.tracker.local).toBeUndefined();
    const gitignore = await Bun.file(path.join(repoRoot, ".gitignore")).text();
    expect(gitignore).toContain(".scratch/");
    expect(gitignore).not.toContain("!.forge/tickets/");
    const doc = await Bun.file(path.join(repoRoot, "docs", "agents", "issue-tracker.md")).text();
    expect(doc).toContain("forge tracker create-ticket --spec");
  });

  test("with a remote: pr landing", async () => {
    await Bun.$`git -C ${repoRoot} remote add origin https://example.invalid/x.git`.quiet();
    await runInit();
    const config = await Bun.file(path.join(repoRoot, "forge.config.json")).json();
    expect(config.landing.mode).toBe("pr");
  });

  test("re-running does not duplicate .scratch/ in .gitignore", async () => {
    await runInit();
    await runInit(["--force"]);
    const gitignore = await Bun.file(path.join(repoRoot, ".gitignore")).text();
    expect(gitignore.match(/\.scratch\//g)).toHaveLength(1);
  });
});
