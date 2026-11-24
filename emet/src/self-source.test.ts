import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { embeddedTree } from "./assets";
import type { SelfDeps } from "./self-install";
import { type SourceInstallOptions, sourceInstall } from "./self-source";

let root = "";
let home = "";
let checkout = "";
let binDirectory = "";
let logs: string[] = [];
let errors: string[] = [];
let bunInstalls: { bun: string; cwd: string; copied: boolean }[] = [];
let bunInstallExit = 0;

function put(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function depsWith(pathEnv: string): SelfDeps {
  return {
    home,
    executablePath: path.join(home, "emet"),
    compiled: false,
    version: "1.2.3",
    tree: embeddedTree,
    interactive: false,
    pathEnv,
    runSetup: () => Promise.resolve(0),
    now: () => new Date(0),
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
}

/** Source install options whose `bun install` is recorded, never run. */
function options(overrides: Partial<SourceInstallOptions> = {}): SourceInstallOptions {
  return {
    from: checkout,
    dryRun: false,
    runBunInstall: (bun, cwd) => {
      bunInstalls.push({ bun, cwd, copied: existsSync(path.join(cwd, "bin", "emet.ts")) });
      return Promise.resolve(bunInstallExit);
    },
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "emet-self-source-"));
  home = path.join(root, "home dir é");
  checkout = path.join(root, "checkout");
  binDirectory = path.join(root, "fakebin");
  logs = [];
  errors = [];
  bunInstalls = [];
  bunInstallExit = 0;
  mkdirSync(home, { recursive: true });
  put(path.join(binDirectory, "bun"), "#!/bin/sh\n");
  put(path.join(checkout, "emet", "bin", "emet.ts"), "console.log('emet');\n");
  put(path.join(checkout, "emet", "src", "a.ts"), "export const a = 1;\n");
  put(path.join(checkout, "emet", "node_modules", "dep", "index.js"), "x\n");
  put(path.join(checkout, "emet", "reference", "r.md"), "ref ${CLAUDE_PLUGIN_ROOT}\n");
  put(path.join(checkout, "commands", "run.md"), "run ${CLAUDE_PLUGIN_ROOT}\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("sourceInstall", () => {
  test("copies the source, installs the adapter, writes the wrapper and the state", async () => {
    const code = await sourceInstall(options(), depsWith(binDirectory));
    expect(code).toBe(0);
    const installed = path.join(home, ".claude", "emet");
    expect(readFileSync(path.join(installed, "src", "a.ts"), "utf8")).toBe("export const a = 1;\n");
    expect(existsSync(path.join(installed, "node_modules"))).toBe(false);
    expect(readFileSync(path.join(installed, "reference", "r.md"), "utf8")).toBe(
      "ref $HOME/.claude\n",
    );
    expect(existsSync(path.join(home, ".claude", "commands", "emet", "run.md"))).toBe(true);
    const wrapper = path.join(home, ".local", "bin", "emet");
    expect(readFileSync(wrapper, "utf8")).toContain('exec bun "$HOME/.claude/emet/bin/emet.ts"');
    expect(lstatSync(wrapper).mode & 0o111).not.toBe(0);
    const state = JSON.parse(
      readFileSync(path.join(home, ".local", "share", "emet", "install.json"), "utf8"),
    ) as unknown;
    expect(state).toMatchObject({
      mode: "source",
      version: "1.2.3",
      binary: wrapper,
      hosts: ["claude"],
    });
  });

  test("runs bun install in the install root after copying the source", async () => {
    expect(await sourceInstall(options(), depsWith(binDirectory))).toBe(0);
    expect(bunInstalls).toEqual([
      {
        bun: path.join(binDirectory, "bun"),
        cwd: path.join(home, ".claude", "emet"),
        copied: true,
      },
    ]);
  });

  test("by default it spawns the bun found on PATH with install in the install root", async () => {
    const marker = path.join(root, "bun-args");
    const fakeBun = path.join(binDirectory, "bun");
    writeFileSync(fakeBun, `#!/bin/sh\necho "$@ $PWD" > "${marker}"\n`);
    chmodSync(fakeBun, 0o755);
    const { runBunInstall: _recorded, ...withoutRunner } = options();
    expect(await sourceInstall(withoutRunner, depsWith(binDirectory))).toBe(0);
    expect(readFileSync(marker, "utf8")).toBe(
      `install --silent ${realpathSync(path.join(home, ".claude", "emet"))}\n`,
    );
  });

  test("a failing bun install fails the install and says where to rerun it", async () => {
    bunInstallExit = 7;
    expect(await sourceInstall(options(), depsWith(binDirectory))).toBe(1);
    expect(errors.join("\n")).toContain(
      `bun install exited 7 in ${path.join(home, ".claude", "emet")}`,
    );
  });

  test("the wrapper runs the installed copy", async () => {
    await sourceInstall(options(), depsWith(binDirectory));
    const bun = process.execPath;
    const result = Bun.spawnSync([path.join(home, ".local", "bin", "emet")], {
      env: { HOME: home, PATH: `${path.dirname(bun)}:/usr/bin:/bin` },
    });
    expect(result.stdout.toString()).toBe("emet\n");
  });

  test("a second run writes nothing", async () => {
    await sourceInstall(options(), depsWith(binDirectory));
    logs = [];
    const code = await sourceInstall(options(), depsWith(binDirectory));
    expect(code).toBe(0);
    expect(logs).toContain("nothing to write; the install is current");
  });

  test("without bun it fails with a message and writes nothing", async () => {
    const code = await sourceInstall(options(), depsWith(path.join(root, "empty")));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("bun was not found");
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });

  test("--dry-run lists the writes and writes nothing", async () => {
    const code = await sourceInstall(options({ dryRun: true }), depsWith(binDirectory));
    expect(code).toBe(0);
    expect(logs.some((line) => line.includes("would write") && line.includes("a.ts"))).toBe(true);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
    expect(bunInstalls).toEqual([]);
  });

  test("a checkout without emet/bin/emet.ts is rejected", async () => {
    const code = await sourceInstall(
      options({ from: path.join(root, "nope") }),
      depsWith(binDirectory),
    );
    expect(code).toBe(2);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
  });

  test("a foreign file or symlink at the wrapper path is refused", async () => {
    const wrapper = path.join(home, ".local", "bin", "emet");
    put(wrapper, "#!/bin/sh\necho other\n");
    expect(await sourceInstall(options(), depsWith(binDirectory))).toBe(1);
    rmSync(wrapper);
    symlinkSync("/usr/bin/true", wrapper);
    expect(await sourceInstall(options(), depsWith(binDirectory))).toBe(1);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
  });
});
