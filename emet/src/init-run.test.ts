import { afterEach, beforeEach, describe, expect, setDefaultTimeout, spyOn, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  defaultBootstrap,
  defaultSelfCheck,
  detectGoSelfCheck,
  detectJsSelfCheck,
  detectPackageManager,
  detectTrackerKind,
  detectTrunk,
  run,
  upsertEmetSection,
} from "./init";

setDefaultTimeout(60_000);

interface FakeGh {
  readonly view?: { readonly exit: number; readonly out: string };
  readonly list?: { readonly exit: number; readonly out: string };
  readonly label?: { readonly exit: number; readonly err: string };
}

function writeFakeGh(binDirectory: string, behaviour: FakeGh): string {
  const log = path.join(binDirectory, "gh.log");
  const view = behaviour.view ?? { exit: 1, out: "" };
  const list = behaviour.list ?? { exit: 1, out: "" };
  const label = behaviour.label ?? { exit: 0, err: "" };
  const script = [
    "#!/bin/sh",
    `echo "$@" >> "${log}"`,
    'case "$1 $2" in',
    `  "repo view") printf '%s' '${view.out}'; exit ${view.exit} ;;`,
    `  "issue list") printf '%s' '${list.out}'; exit ${list.exit} ;;`,
    `  "label create") printf '%s' '${label.err}' >&2; exit ${label.exit} ;;`,
    "esac",
    "exit 0",
    "",
  ].join("\n");
  const file = path.join(binDirectory, "gh");
  writeFileSync(file, script);
  chmodSync(file, 0o755);
  return log;
}

function writeFakeHost(binDirectory: string, name: string): void {
  const file = path.join(binDirectory, name);
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, 0o755);
}

describe("init in-process", () => {
  let repoRoot = "";
  let binDirectory = "";
  let originalCwd = "";
  let originalPath: string | undefined = undefined;
  let originalExitCode: typeof process.exitCode = undefined;
  let logLines: string[] = [];
  let errorLines: string[] = [];
  let logSpy: ReturnType<typeof spyOn<Console, "log">>;
  let errorSpy: ReturnType<typeof spyOn<Console, "error">>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalPath = process.env.PATH;
    originalExitCode = process.exitCode;
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-init-run-"));
    binDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-init-runbin-"));
    await Bun.$`git init -q -b main ${repoRoot}`.quiet();
    writeFakeHost(binDirectory, "claude");
    writeFakeHost(binDirectory, "codex");
    process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
    process.chdir(repoRoot);
    logLines = [];
    errorLines = [];
    logSpy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      logLines.push(parts.join(" "));
    });
    errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errorLines.push(parts.map(String).join(" "));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.chdir(originalCwd);
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    process.exitCode = originalExitCode ?? 0;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(binDirectory, { recursive: true, force: true });
  });

  const output = (): string => logLines.join("\n");
  const readRepoFile = (relative: string): string =>
    readFileSync(path.join(repoRoot, relative), "utf8");

  describe("pure helpers", () => {
    test("defaultBootstrap covers every ecosystem and is empty for unknown", () => {
      expect(defaultBootstrap("bun")).toEqual(["bun install --frozen-lockfile"]);
      expect(defaultBootstrap("go")).toEqual(["go mod download"]);
      expect(defaultBootstrap("cargo")).toEqual(["cargo fetch"]);
      expect(defaultBootstrap("pip")[0]).toContain("requirements.txt");
      expect(defaultBootstrap("unknown")).toEqual([]);
    });

    test("defaultSelfCheck covers js, go, cargo, python and unknown", () => {
      expect(defaultSelfCheck("bun")).toEqual(["bun run test"]);
      expect(defaultSelfCheck("pnpm")).toEqual(["pnpm run test"]);
      expect(defaultSelfCheck("npm")).toEqual(["npm run test"]);
      expect(defaultSelfCheck("yarn")).toEqual(["yarn run test"]);
      expect(defaultSelfCheck("go")).toEqual(["go build ./...", "go test ./..."]);
      expect(defaultSelfCheck("cargo")).toEqual(["cargo test", "cargo clippy -- -D warnings"]);
      expect(defaultSelfCheck("uv")).toEqual(["uv run pytest"]);
      expect(defaultSelfCheck("poetry")).toEqual(["poetry run pytest"]);
      expect(defaultSelfCheck("pip")).toEqual(["pytest"]);
      expect(defaultSelfCheck("unknown")).toEqual([]);
    });

    test("upsertEmetSection keeps a section that already carries the markers", () => {
      const section = "<!-- emet:begin -->\nbody\n<!-- emet:end -->";
      expect(upsertEmetSection("", section)).toBe(`${section}\n`);
    });
  });

  describe("detection", () => {
    test("detectPackageManager ignores a malformed package.json", async () => {
      await Bun.write(path.join(repoRoot, "package.json"), "{not json");
      expect(await detectPackageManager(repoRoot)).toBe("npm");
    });

    test("detectPackageManager ignores a non-string packageManager field", async () => {
      await Bun.write(path.join(repoRoot, "package.json"), '{"packageManager":3}');
      expect(await detectPackageManager(repoRoot)).toBe("npm");
    });

    test("detectTrunk reads origin/HEAD's symref", async () => {
      await Bun.$`git -C ${repoRoot} symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/develop`.quiet();
      expect(await detectTrunk(repoRoot)).toBe("develop");
    });

    test("detectTrunk is null without a symref", async () => {
      expect(await detectTrunk(repoRoot)).toBeNull();
    });

    test("detectJsSelfCheck returns nothing for a malformed package.json", async () => {
      await Bun.write(path.join(repoRoot, "package.json"), "{oops");
      expect(await detectJsSelfCheck(repoRoot, "bun")).toEqual([]);
    });

    test("detectGoSelfCheck adds make lint only when the Makefile declares it", async () => {
      expect(await detectGoSelfCheck(repoRoot)).toEqual(["go build ./...", "go test ./..."]);
      await Bun.write(path.join(repoRoot, "Makefile"), "lint:\n\techo hi\n");
      expect(await detectGoSelfCheck(repoRoot)).toContain("make lint");
    });

    test("detectTrackerKind: linear wins over everything", async () => {
      await Bun.write(
        path.join(repoRoot, ".mcp.json"),
        JSON.stringify({ mcpServers: { linear: { command: "x" } } }),
      );
      expect(await detectTrackerKind(repoRoot)).toBe("linear");
    });

    test("detectTrackerKind: github when issues are enabled and one exists", async () => {
      writeFakeGh(binDirectory, {
        view: { exit: 0, out: "true" },
        list: { exit: 0, out: '[{"number":1}]' },
      });
      expect(await detectTrackerKind(repoRoot)).toBe("github");
    });

    test("detectTrackerKind: falls through when gh repo view fails", async () => {
      writeFakeGh(binDirectory, { view: { exit: 1, out: "" } });
      expect(await detectTrackerKind(repoRoot)).toBeNull();
    });

    test("detectTrackerKind: falls through when issues are disabled", async () => {
      writeFakeGh(binDirectory, { view: { exit: 0, out: "false" } });
      expect(await detectTrackerKind(repoRoot)).toBeNull();
    });

    test("detectTrackerKind: falls through when gh issue list fails", async () => {
      writeFakeGh(binDirectory, { view: { exit: 0, out: "true" }, list: { exit: 1, out: "" } });
      expect(await detectTrackerKind(repoRoot)).toBeNull();
    });

    test("detectTrackerKind: falls through on unparsable or empty issue lists", async () => {
      writeFakeGh(binDirectory, {
        view: { exit: 0, out: "true" },
        list: { exit: 0, out: "not json" },
      });
      expect(await detectTrackerKind(repoRoot)).toBeNull();
      writeFakeGh(binDirectory, { view: { exit: 0, out: "true" }, list: { exit: 0, out: "[]" } });
      expect(await detectTrackerKind(repoRoot)).toBeNull();
    });

    test("detectTrackerKind: local when only .scratch/ exists", async () => {
      await Bun.$`mkdir -p ${path.join(repoRoot, ".scratch")}`.quiet();
      expect(await detectTrackerKind(repoRoot)).toBe("local");
    });
  });

  describe("run", () => {
    test("outside a git repository exits 2", async () => {
      const outside = mkdtempSync(path.join(os.tmpdir(), "emet-init-nogit-"));
      try {
        process.chdir(outside);
        await run([]);
        expect(process.exitCode).toBe(2);
        expect(errorLines.join("\n")).toContain("not inside a git repository");
      } finally {
        process.chdir(repoRoot);
        rmSync(outside, { recursive: true, force: true });
      }
    });

    test("an existing config blocks init without --force", async () => {
      await Bun.write(path.join(repoRoot, "emet.config.json"), "{}");
      await run([]);
      expect(process.exitCode).toBe(2);
      expect(errorLines.join("\n")).toContain("already exists");
      expect(readRepoFile("emet.config.json")).toBe("{}");
    });

    test("an invalid --tracker value reports through the error handler", async () => {
      await run(["--tracker", "jira"]);
      expect(errorLines.join("\n")).toContain("--tracker must be one of");
      expect(existsSync(path.join(repoRoot, "emet.config.json"))).toBe(false);
    });

    test("with nothing detected: github placeholder, TODO note and trunk warning", async () => {
      await run([]);
      expect(process.exitCode).toBe(originalExitCode);
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({
        tracker: { kind: "github" },
        repo: { trunk: "main" },
        commands: { selfCheck: [] },
        worktree: { bootstrap: [] },
      });
      const doc = readRepoFile("docs/agents/issue-tracker.md");
      expect(doc).toContain("no Linear MCP server, GitHub Issues usage");
      const text = output();
      expect(text).toContain("trunk: main (default — not detected)");
      expect(text).toContain("could not resolve origin/HEAD's symref");
      expect(text).toContain("Next: fill in every TODO(emet)");
      expect(text).toContain("docs/agents/emet.md: written");
    });

    test("github tracker creates the status labels and reports them", async () => {
      const log = writeFakeGh(binDirectory, {});
      await run(["--tracker", "github"]);
      const calls = readFileSync(log, "utf8");
      expect(calls).toContain("label create status:todo");
      expect(calls).toContain("label create status:in-progress");
      expect(calls).toContain("label create status:in-review");
      expect(output()).toContain("tracker: github (--tracker override)");
      expect(output()).not.toContain("could not create tracker.github status labels");
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({ preflight: { requiredCommands: ["gh"] } });
    });

    test("github label failures become a warning, not a failure", async () => {
      writeFakeGh(binDirectory, { label: { exit: 1, err: "boom" } });
      await run(["--tracker", "github"]);
      expect(process.exitCode).toBe(originalExitCode);
      expect(output()).toContain("could not create tracker.github status labels");
      expect(output()).toContain("status:todo: boom");
    });

    test("detects linear from .mcp.json and a pnpm workspace and a detected trunk", async () => {
      await Bun.write(
        path.join(repoRoot, ".mcp.json"),
        JSON.stringify({ mcpServers: { linear: { command: "linear-mcp" } } }),
      );
      await Bun.write(path.join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n");
      await Bun.write(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ scripts: { lint: "x", typecheck: "y" } }),
      );
      await Bun.$`git -C ${repoRoot} symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/develop`.quiet();
      await run([]);
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({
        tracker: { kind: "linear" },
        repo: { trunk: "develop" },
        commands: { selfCheck: ["npm run lint", "npm run typecheck"] },
        worktree: { bootstrap: ["npm ci"] },
      });
      expect(readRepoFile("docs/agents/domain.md")).toContain("monorepo signals");
      const text = output();
      expect(text).toContain("trunk: develop");
      expect(text).not.toContain("could not resolve origin/HEAD");
    });

    test("a workspaces field in package.json counts as a monorepo", async () => {
      await Bun.write(path.join(repoRoot, "package.json"), '{"workspaces":["apps/*"]}');
      await run(["--tracker", "local"]);
      expect(readRepoFile("docs/agents/domain.md")).toContain("monorepo signals");
    });

    test("a malformed package.json is not fatal and counts as single-context", async () => {
      await Bun.write(path.join(repoRoot, "package.json"), "{broken");
      await run(["--tracker", "local"]);
      expect(process.exitCode).toBe(originalExitCode);
      expect(readRepoFile("docs/agents/domain.md")).toContain("Single-context repo");
    });

    test("--force on an unparsable config rewrites it without carrying host keys", async () => {
      await Bun.write(path.join(repoRoot, "emet.config.json"), "{not json");
      await run(["--tracker", "local", "--force"]);
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({ tracker: { kind: "local" } });
      expect(config).not.toHaveProperty("agentHost");
    });

    test("--force on a non-object config rewrites it", async () => {
      await Bun.write(path.join(repoRoot, "emet.config.json"), "null");
      await run(["--tracker", "local", "--force"]);
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({ tracker: { kind: "local" } });
    });

    test("a go repo gets go self-check and bootstrap", async () => {
      await Bun.write(path.join(repoRoot, "go.mod"), "module x\n");
      await run(["--tracker", "local"]);
      const config: unknown = JSON.parse(readRepoFile("emet.config.json"));
      expect(config).toMatchObject({
        commands: { selfCheck: ["go build ./...", "go test ./..."] },
        worktree: { bootstrap: ["go mod download"] },
      });
    });

    test("--force keeps emet.md untouched without force and rewrites it with force", async () => {
      await run(["--tracker", "local"]);
      const docPath = path.join(repoRoot, "docs", "agents", "emet.md");
      writeFileSync(docPath, "hand edited\n");
      await run(["--tracker", "local", "--force"]);
      expect(readFileSync(docPath, "utf8")).not.toBe("hand edited\n");
      expect(output()).toContain("docs/agents/emet.md: written");
    });

    test("a shared doc with markers is updated in place; a legacy footer doc is skipped", async () => {
      const docsDirectory = path.join(repoRoot, "docs", "agents");
      await Bun.$`mkdir -p ${docsDirectory}`.quiet();
      writeFileSync(
        path.join(docsDirectory, "domain.md"),
        "mine\n<!-- emet:begin -->\nold\n<!-- emet:end -->\n",
      );
      writeFileSync(path.join(docsDirectory, "triage-labels.md"), "Generated by `emet init`\n");
      await run(["--tracker", "local"]);
      expect(output()).toContain("docs/agents/domain.md: updated");
      expect(output()).toContain("docs/agents/triage-labels.md: skipped-legacy");
      expect(readFileSync(path.join(docsDirectory, "triage-labels.md"), "utf8")).toBe(
        "Generated by `emet init`\n",
      );
      expect(readFileSync(path.join(docsDirectory, "domain.md"), "utf8")).not.toContain("old\n");
    });

    test("a non-local tracker appends the tickets un-ignore to a fresh .gitignore", async () => {
      await run(["--tracker", "linear"]);
      const gitignore = readRepoFile(".gitignore");
      expect(gitignore).toContain(".emet/*");
      expect(gitignore).toContain("!.emet/tickets/");
    });

    test("a non-local tracker appends to an existing .gitignore once", async () => {
      await Bun.write(path.join(repoRoot, ".gitignore"), "node_modules\n");
      await run(["--tracker", "linear"]);
      await run(["--tracker", "linear", "--force"]);
      const gitignore = readRepoFile(".gitignore");
      expect(gitignore.startsWith("node_modules\n")).toBe(true);
      expect(gitignore.match(/!\.emet\/tickets\//g)).toHaveLength(1);
    });

    test("a blanket .emet/ rule warns instead of editing .gitignore", async () => {
      await Bun.write(path.join(repoRoot, ".gitignore"), ".emet/\n");
      await run(["--tracker", "linear"]);
      expect(output()).toContain('blanket ".emet/" rule');
      expect(readRepoFile(".gitignore")).toBe(".emet/\n");
    });

    test("local tracker leaves a .gitignore alone when both rules exist", async () => {
      await Bun.write(path.join(repoRoot, ".gitignore"), ".emet/\n.scratch\n");
      await run(["--tracker", "local"]);
      expect(readRepoFile(".gitignore")).toBe(".emet/\n.scratch\n");
    });

    test("local tracker appends only the missing rule", async () => {
      await Bun.write(path.join(repoRoot, ".gitignore"), ".emet/*\n");
      await run(["--tracker", "local"]);
      const gitignore = readRepoFile(".gitignore");
      expect(gitignore).toContain(".scratch/");
      expect(gitignore.match(/^\.emet\/$/gm)).toBeNull();
    });

    test("dependency notes are printed when a probe is not satisfied", async () => {
      writeFakeGh(binDirectory, {});
      rmSync(path.join(binDirectory, "claude"));
      await run(["--tracker", "linear"]);
      expect(output()).toContain("Dependencies:");
    });
  });
});
