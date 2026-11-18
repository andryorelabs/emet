import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { currentExitCode } from "./exit-code";
import { checkStale, filterMapForGlobs, generateMap, mappedAreas, parseStamp, run } from "./map";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function sh(root: string, ...args: string[]): Promise<void> {
  const result = await Bun.$`git -C ${root} ${args}`.quiet();
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
}

function write(root: string, file: string, content: string): void {
  const full = path.join(root, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

async function commit(root: string, message: string): Promise<void> {
  await sh(root, "add", "-A");
  await sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
}

async function fixtureRepo(): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), "forge-map-"));
  roots.push(root);
  await sh(root, "init", "-q");
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "demo",
      scripts: { test: "bun test", lint: "biome check" },
      devDependencies: { "@types/bun": "^1", typescript: "^5" },
    }),
  );
  write(root, "bun.lock", "");
  write(root, "tsconfig.json", '{"compilerOptions":{"strict":true}}');
  write(root, "biome.json", "{}");
  write(root, "src/app.ts", "export {}");
  write(root, "src/app.test.ts", "export {}");
  write(root, "docs/readme.md", "# hi");
  await commit(root, "feat: init");
  write(root, "src/app.ts", "export const a = 1");
  await commit(root, "fix: tweak");
  return root;
}

describe("generateMap", () => {
  test("covers stack, structure, conventions, testing and hotspots with a stamp", async () => {
    const root = await fixtureRepo();
    const map = await generateMap(root);
    const head = (await Bun.$`git -C ${root} rev-parse HEAD`.text()).trim();
    expect(parseStamp(map)).toBe(head);
    for (const title of ["Stack", "Structure", "Conventions", "Testing", "Hotspots"]) {
      expect(map).toContain(`## ${title}`);
    }
    expect(map).toContain("package manager: bun");
    expect(map).toContain("- `src/` (2 files)");
    expect(map).toContain("Biome configured");
    expect(map).toContain("`strict` mode");
    expect(map).toContain("conventional commits");
    expect(map).toContain("Test command: `bun test`");
    expect(map).toContain("- `src/` (1 test files)");
    expect(map).toContain("- `src/app.ts` (2 commits)");
  });

  const ecosystems: readonly (readonly [string, readonly string[], string, string])[] = [
    ["go", ["go.mod"], "go test ./...", "Package manager: go"],
    ["cargo", ["Cargo.toml"], "cargo test", "Package manager: cargo"],
    ["uv", ["pyproject.toml", "uv.lock"], "uv run pytest", "Package manager: uv"],
    ["poetry", ["pyproject.toml", "poetry.lock"], "poetry run pytest", "Package manager: poetry"],
    ["pip", ["requirements.txt"], "pytest", "Package manager: pip"],
  ];
  for (const [name, files, command, stack] of ecosystems) {
    test(`names the ${name} test command and package manager`, async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "forge-map-"));
      roots.push(root);
      await sh(root, "init", "-q");
      for (const file of files) write(root, file, "");
      await commit(root, "feat: init");
      const map = await generateMap(root);
      expect(map).toContain(`Test command: \`${command}\``);
      expect(map).toContain(stack);
    });
  }

  test("omits tracked skill folders from structure and hotspots", async () => {
    const root = await fixtureRepo();
    write(root, ".claude/skills/demo/SKILL.md", "# demo");
    write(root, ".claude/skills/demo/scripts/run.test.ts", "export {}");
    await commit(root, "feat: track a skill");
    const map = await generateMap(root);
    expect(map).not.toContain(".claude/skills");
    expect(map).toContain("- `src/` (2 files)");
  });

  test("is deterministic for the same commit", async () => {
    const root = await fixtureRepo();
    expect(await generateMap(root)).toBe(await generateMap(root));
  });
});

describe("filterMapForGlobs", () => {
  test("keeps global sections and only the matching path bullets", async () => {
    const root = await fixtureRepo();
    const map = await generateMap(root);
    const filtered = filterMapForGlobs(map, ["docs/**"]);
    expect(filtered).toContain("## Stack");
    expect(filtered).toContain("- `docs/` (1 files)");
    expect(filtered).not.toContain("- `src/` (2 files)");
    expect(filtered).not.toContain("## Testing");
    expect(filtered).not.toContain("src/app.ts");
  });

  test("matches a file glob against directory bullets", async () => {
    const root = await fixtureRepo();
    const filtered = filterMapForGlobs(await generateMap(root), ["src/app.ts"]);
    expect(filtered).toContain("- `src/` (2 files)");
    expect(filtered).toContain("## Testing");
    expect(filtered).toContain("- `src/app.ts` (2 commits)");
  });
});

describe("checkStale", () => {
  test("missing map is stale", async () => {
    const root = await fixtureRepo();
    expect((await checkStale(root, "docs/agents/codebase.md", 10)).stale).toBe(true);
  });

  test("counts only commits touching mapped areas, ignoring the map itself", async () => {
    const root = await fixtureRepo();
    const mapPath = "docs/agents/codebase.md";
    write(root, mapPath, await generateMap(root));
    await commit(root, "docs: add map");
    expect(mappedAreas(await Bun.file(path.join(root, mapPath)).text())).toContain("src");
    expect((await checkStale(root, mapPath, 0)).stale).toBe(false);

    write(root, "src/app.ts", "export const a = 2");
    await commit(root, "fix: one");
    write(root, "src/app.ts", "export const a = 3");
    await commit(root, "fix: two");
    expect((await checkStale(root, mapPath, 2)).stale).toBe(false);
    expect((await checkStale(root, mapPath, 1)).stale).toBe(true);
  });

  test("unknown stamp is stale", async () => {
    const root = await fixtureRepo();
    write(
      root,
      "map.md",
      "<!-- forge-map commit=deadbeefdeadbeef -->\n## Structure\n\n- `src/` (1 files)\n",
    );
    const verdict = await checkStale(root, "map.md", 10);
    expect(verdict.stale).toBe(true);
    expect(verdict.reason).toContain("not in history");
  });
});

describe("generateMap on sparse repositories", () => {
  test.each([
    ["unparseable package.json", "{not json"],
    ["package.json holding a scalar", "3"],
  ])("%s is ignored instead of failing", async (_name, manifest) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "forge-map-"));
    roots.push(root);
    await sh(root, "init", "-q");
    write(root, "package.json", manifest);
    write(root, "README.md", "# hi");
    await commit(root, "feat: init");
    const map = await generateMap(root);
    expect(map).not.toContain("Test command");
    expect(map).toContain("- No test files found");
  });

  test("test directories are listed sorted, with root-level tests as `*`", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "forge-map-"));
    roots.push(root);
    await sh(root, "init", "-q");
    write(root, "src/b.test.ts", "export {}");
    write(root, "lib/a.test.ts", "export {}");
    write(root, "top.test.ts", "export {}");
    await commit(root, "feat: init");
    const map = await generateMap(root);
    const listed = ["- `*` (1 test files)", "- `lib/` (1 test files)", "- `src/` (1 test files)"];
    const positions = listed.map((line) => map.indexOf(line));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });

  test("a history of only lockfiles reports no hotspots", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "forge-map-"));
    roots.push(root);
    await sh(root, "init", "-q");
    write(root, "bun.lock", "");
    await commit(root, "chore: lock");
    expect(await generateMap(root)).toContain("- No history available");
  });
});

describe("run", () => {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  let logs: string[] = [];
  let errors: string[] = [];
  let written = "";
  let restoreFns: (() => void)[] = [];

  beforeEach(() => {
    logs = [];
    errors = [];
    written = "";
    process.exitCode = 0;
    const log = spyOn(console, "log").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    const error = spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(String(line));
    });
    const stdoutWrite = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
    restoreFns = [
      () => {
        log.mockRestore();
      },
      () => {
        error.mockRestore();
      },
      () => {
        stdoutWrite.mockRestore();
      },
    ];
  });

  afterEach(() => {
    for (const restore of restoreFns) restore();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode ?? 0;
  });

  test("--help prints usage", async () => {
    await run(["-h"]);
    expect(logs[0]).toContain("--stale");
    expect(currentExitCode()).toBe(0);
  });

  test("outside a git repository exits 2", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "forge-map-outside-"));
    roots.push(outside);
    process.chdir(realpathSync(outside));
    await run([]);
    expect(errors[0]).toContain("not inside a git repository");
    expect(currentExitCode()).toBe(2);
  });

  test("writes the map at the configured path, then --for filters it", async () => {
    const root = realpathSync(await fixtureRepo());
    process.chdir(root);
    await run([]);
    expect(logs[0]).toMatch(/^wrote docs\/agents\/codebase\.md \(commit [0-9a-f]{7}\)$/);
    const mapFile = path.join(root, "docs/agents/codebase.md");
    expect(parseStamp(readFileSync(mapFile, "utf8"))).not.toBeNull();

    await run(["--for", "src/*"]);
    expect(written).toContain("src");
    expect(written).not.toContain("docs/");
  });

  test("--for without globs exits 2 and --for without a map exits 1", async () => {
    const root = realpathSync(await fixtureRepo());
    process.chdir(root);
    await run(["--for", " , "]);
    expect(errors[0]).toContain("--for needs at least one glob");
    expect(currentExitCode()).toBe(2);
    process.exitCode = 0;
    await run(["--for", "src/*"]);
    expect(errors[1]).toContain("no map at docs/agents/codebase.md");
    expect(currentExitCode()).toBe(1);
  });

  test("--stale reports a missing map as stale (exit 1) and a fresh one as fresh (exit 0)", async () => {
    const root = realpathSync(await fixtureRepo());
    process.chdir(root);
    await run(["--stale"]);
    expect(logs[0]).toBe("stale: no map at docs/agents/codebase.md");
    expect(currentExitCode()).toBe(1);

    process.exitCode = 0;
    await run([]);
    await commit(root, "docs: add map");
    await run(["--stale", "--max", "5"]);
    expect(logs.at(-1)).toMatch(
      /^fresh: 0 commits touching mapped areas since [0-9a-f]{7} \(max 5\)$/,
    );
    expect(currentExitCode()).toBe(0);
  });

  test.each(["-1", "abc"])("--stale --max %s exits 2", async (rawMax) => {
    const root = realpathSync(await fixtureRepo());
    process.chdir(root);
    await run(["--stale", "--max", rawMax]);
    expect(errors[0]).toContain("--max must be a non-negative integer");
    expect(currentExitCode()).toBe(2);
  });

  test("--stale without --max uses the default budget", async () => {
    const root = realpathSync(await fixtureRepo());
    process.chdir(root);
    await run([]);
    await commit(root, "docs: add map");
    await run(["--stale"]);
    expect(logs.at(-1)).toMatch(/^fresh: .*\(max \d+\)$/);
  });
});
