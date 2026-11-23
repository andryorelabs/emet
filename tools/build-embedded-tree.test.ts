import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  GENERATED_PATH,
  findStaleFiles,
  listTreePaths,
  main,
  renderModule,
} from "./build-embedded-tree";

const repoRoot = path.join(import.meta.dir, "..");

/** Copies the tree sources and the generated module into a scratch root. */
function scratchRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "emet-tree-"));
  for (const file of [...listTreePaths(repoRoot), GENERATED_PATH]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(repoRoot, file), path.join(root, file));
  }
  return root;
}

describe("build-embedded-tree", () => {
  test("the committed module is current", async () => {
    expect(await findStaleFiles(repoRoot)).toEqual([]);
    expect(await main(["--check"], repoRoot)).toBe(0);
  });

  test("an edited tree file is reported by name", async () => {
    const root = scratchRoot();
    try {
      writeFileSync(path.join(root, "commands", "run.md"), "changed\n");
      const errors: string[] = [];
      expect(await main(["--check"], root, console.log, (message) => errors.push(message))).toBe(1);
      expect(errors.join("\n")).toContain("commands/run.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an added tree file is reported by name", async () => {
    const root = scratchRoot();
    try {
      writeFileSync(path.join(root, "commands", "extra.md"), "x\n");
      expect(await findStaleFiles(root)).toEqual(["commands/extra.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a removed tree file is reported by name", async () => {
    const root = scratchRoot();
    try {
      rmSync(path.join(root, "hooks", "hooks.json"));
      expect(await findStaleFiles(root)).toEqual(["hooks/hooks.json"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing module reports every tree file", async () => {
    const root = scratchRoot();
    try {
      rmSync(path.join(root, GENERATED_PATH));
      expect(await findStaleFiles(root)).toEqual(listTreePaths(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the entry point checks the committed module and exits 0", () => {
    const result = Bun.spawnSync([
      "bun",
      path.join(import.meta.dir, "build-embedded-tree.ts"),
      "--check",
    ]);
    expect(result.exitCode).toBe(0);
  });

  test("writing regenerates a stale module", async () => {
    const root = scratchRoot();
    try {
      writeFileSync(path.join(root, "commands", "run.md"), "changed\n");
      expect(await main([], root, () => undefined)).toBe(0);
      expect(await findStaleFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("renderModule is deterministic and names every tree path", () => {
    const rendered = renderModule(repoRoot);
    expect(rendered).toBe(renderModule(repoRoot));
    for (const file of listTreePaths(repoRoot)) expect(rendered).toContain(`  "${file}": `);
  });

  test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
    "a compiled host binary embeds a tree equal to the source tree",
    async () => {
      const workdir = mkdtempSync(path.join(os.tmpdir(), "emet-tree-bin-"));
      try {
        const entry = path.join(workdir, "probe.ts");
        const assets = path.join(repoRoot, "emet", "src", "assets");
        writeFileSync(
          entry,
          `import { embeddedTree } from ${JSON.stringify(assets)};\nconst tree = embeddedTree();\nconsole.log(JSON.stringify(Object.fromEntries(tree.list().map((file) => [file, tree.read(file)]))));\n`,
        );
        const outfile = path.join(workdir, "probe");
        const result = await Bun.build({
          entrypoints: [entry],
          compile: { target: "bun-linux-x64", outfile },
        });
        expect(result.success).toBe(true);
        const run = Bun.spawnSync([outfile], { cwd: workdir, env: { HOME: workdir } });
        expect(run.exitCode).toBe(0);
        const parsed: unknown = JSON.parse(run.stdout.toString());
        if (typeof parsed !== "object" || parsed === null) throw new Error("probe printed no tree");
        const embedded = new Map<string, unknown>(Object.entries(parsed));
        const expected = listTreePaths(repoRoot);
        expect([...embedded.keys()].toSorted()).toEqual(expected);
        for (const file of expected) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- sequential reads of a small fixed set
          expect(embedded.get(file)).toBe(await Bun.file(path.join(repoRoot, file)).text());
        }
      } finally {
        rmSync(workdir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
