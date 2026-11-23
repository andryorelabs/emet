import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { embeddedTree } from "./assets";
import { readInstallState, runSelf, selfInstall, type SelfDeps } from "./self-install";

const VERSION = "9.8.7";

let sandbox = "";
let home = "";
let executable = "";
let output: string[] = [];
let errors: string[] = [];
let setupCalls: string[] = [];

function deps(overrides: Partial<SelfDeps> = {}): SelfDeps {
  return {
    home,
    executablePath: executable,
    compiled: true,
    version: VERSION,
    tree: embeddedTree,
    interactive: false,
    pathEnv: `${home}/.local/bin:/usr/bin`,
    runSetup: (emetBin) => {
      setupCalls.push(emetBin);
      return Promise.resolve(0);
    },
    now: () => new Date("2026-11-23T10:00:00.000Z"),
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
    ...overrides,
  };
}

const install = (overrides: Partial<Parameters<typeof selfInstall>[0]> = {}, extra = {}) =>
  selfInstall({ dryRun: false, force: false, ...overrides }, deps(extra));

function shimPath(): string {
  return path.join(home, ".local/bin/emet");
}

function versionedBinary(version = VERSION): string {
  return path.join(home, ".local/share/emet/versions", version, "emet");
}

function snapshotTree(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of new Bun.Glob("**/*").scanSync({
      cwd: directory,
      dot: true,
      onlyFiles: false,
      followSymlinks: false,
    })) {
      const absolute = path.join(directory, entry);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) files.set(entry, `link:${readlinkSync(absolute)}`);
      else if (stat.isFile()) files.set(entry, `${stat.mtimeMs}:${readFileSync(absolute, "utf8")}`);
    }
  };
  walk(root);
  return files;
}

function enablePlugin(): void {
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  writeFileSync(
    path.join(home, ".claude/settings.json"),
    JSON.stringify({ enabledPlugins: { "emet@emet-marketplace": true } }),
  );
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), "emet-self-install-"));
  home = path.join(sandbox, "home");
  mkdirSync(home);
  executable = path.join(sandbox, "emet-download");
  writeFileSync(executable, "#!/bin/sh\necho fake emet\n");
  output = [];
  errors = [];
  setupCalls = [];
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("selfInstall", () => {
  test("places the versioned binary, the symlink, the Claude files and the state file", async () => {
    expect(await install()).toBe(0);

    expect(readFileSync(versionedBinary(), "utf8")).toBe("#!/bin/sh\necho fake emet\n");
    expect(statSync(versionedBinary()).mode & 0o777).toBe(0o755);
    expect(lstatSync(shimPath()).isSymbolicLink()).toBe(true);
    expect(readlinkSync(shimPath())).toBe(versionedBinary());
    expect(existsSync(path.join(home, ".claude/commands/emet/run.md"))).toBe(true);
    expect(existsSync(path.join(home, ".claude/emet/.install-manifest.json"))).toBe(true);
    expect(readInstallState(home)).toEqual({
      version: VERSION,
      installedAt: "2026-11-23T10:00:00.000Z",
      hosts: ["claude"],
      binary: versionedBinary(),
      mode: "standalone",
    });
    expect(output.join("\n")).toContain(`emet ${VERSION} installed`);
    expect(errors).toEqual([]);
  });

  test("writes nothing when settings.json is invalid JSON", async () => {
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const settingsPath = path.join(home, ".claude/settings.json");
    writeFileSync(settingsPath, "{ broken");

    const failure = await install().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(failure)).toContain("settings.json");

    expect(readFileSync(settingsPath, "utf8")).toBe("{ broken");
    expect(existsSync(shimPath())).toBe(false);
    expect(existsSync(path.join(home, ".local/share"))).toBe(false);
  });

  test("a second run changes nothing", async () => {
    expect(await install()).toBe(0);
    const before = snapshotTree(home);
    expect(await install({}, { now: () => new Date("2027-01-01T00:00:00.000Z") })).toBe(0);
    expect(snapshotTree(home)).toEqual(before);
    expect(readInstallState(home)?.installedAt).toBe("2026-11-23T10:00:00.000Z");
  });

  test("accepts latest and the running version, and refuses another version", async () => {
    expect(await install({ version: "latest", dryRun: true })).toBe(0);
    expect(await install({ version: VERSION, dryRun: true })).toBe(0);
    expect(await install({ version: "1.2.3" })).toBe(1);
    expect(errors.join("\n")).toContain("emet self update 1.2.3");
    expect(await install({ version: "nope" })).toBe(2);
    expect(errors.join("\n")).toContain('"nope"');
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });

  test("repoints a symlink that already points into the versions directory", async () => {
    mkdirSync(path.dirname(shimPath()), { recursive: true });
    symlinkSync(versionedBinary("0.0.1"), shimPath());
    expect(await install()).toBe(0);
    expect(readlinkSync(shimPath())).toBe(versionedBinary());
  });

  test("refuses a regular file at ~/.local/bin/emet and writes nothing", async () => {
    mkdirSync(path.dirname(shimPath()), { recursive: true });
    writeFileSync(shimPath(), "#!/bin/sh\n");
    expect(await install({ force: true })).toBe(1);
    expect(errors.join("\n")).toContain("is a regular file");
    expect(errors.join("\n")).toContain("emet uninstall");
    expect(readFileSync(shimPath(), "utf8")).toBe("#!/bin/sh\n");
    expect(existsSync(path.join(home, ".local/share"))).toBe(false);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
  });

  test("refuses a dangling symlink that points outside the versions directory", async () => {
    mkdirSync(path.dirname(shimPath()), { recursive: true });
    symlinkSync(path.join(sandbox, "gone"), shimPath());
    expect(await install()).toBe(1);
    expect(errors.join("\n")).toContain("dangling symlink");
    expect(readlinkSync(shimPath())).toBe(path.join(sandbox, "gone"));
    expect(existsSync(path.join(home, ".local/share"))).toBe(false);
  });

  test("refuses a symlink to a foreign file", async () => {
    mkdirSync(path.dirname(shimPath()), { recursive: true });
    const foreign = path.join(sandbox, "other-emet");
    writeFileSync(foreign, "other");
    symlinkSync(foreign, shimPath());
    expect(await install()).toBe(1);
    expect(errors.join("\n")).toContain(`symlink to ${foreign}`);
    expect(readlinkSync(shimPath())).toBe(foreign);
  });

  test("refuses a directory at ~/.local/bin/emet", async () => {
    mkdirSync(shimPath(), { recursive: true });
    expect(await install()).toBe(1);
    expect(errors.join("\n")).toContain("is not a file or symlink");
  });

  test("an unreadable ~/.local/bin path is an error, not a refusal", async () => {
    mkdirSync(path.join(home, ".local"), { recursive: true });
    writeFileSync(path.join(home, ".local/bin"), "not a directory");
    const outcome = await install().catch((error: unknown) => error);
    expect(String(outcome)).toContain("ENOTDIR");
  });

  test("refuses when the emet plugin is installed and writes nothing", async () => {
    enablePlugin();
    const before = snapshotTree(home);
    expect(await install()).toBe(1);
    expect(snapshotTree(home)).toEqual(before);
    const message = errors.join("\n");
    expect(message).toContain("claude plugin uninstall emet@emet-marketplace");
    expect(message).toContain("--force");
  });

  test("names the Codex removal command when the Codex plugin is installed", async () => {
    mkdirSync(path.join(home, ".codex"), { recursive: true });
    writeFileSync(
      path.join(home, ".codex/config.toml"),
      '[plugins."emet@emet-marketplace"]\nenabled = true\n',
    );
    expect(await install()).toBe(1);
    expect(errors.join("\n")).toContain("codex plugin remove emet@emet-marketplace");
  });

  test("--force proceeds when the plugin is installed", async () => {
    enablePlugin();
    expect(await install({ force: true })).toBe(0);
    expect(readlinkSync(shimPath())).toBe(versionedBinary());
  });

  test("--dry-run lists every write for every host and writes nothing", async () => {
    expect(await install({ dryRun: true })).toBe(0);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
    const listed = output.join("\n");
    expect(listed).toContain(`would write: ${versionedBinary()}`);
    expect(listed).toContain(`would write: ${shimPath()}`);
    expect(listed).toContain(`would write: ${path.join(home, ".local/share/emet/install.json")}`);
    expect(listed).toContain(`would write: ${path.join(home, ".claude/commands/emet/run.md")}`);
    expect(listed).toContain("codex:");
    expect(setupCalls).toEqual([]);
  });

  test("--dry-run after an install lists nothing to write", async () => {
    expect(await install()).toBe(0);
    output = [];
    expect(await install({ dryRun: true })).toBe(0);
    expect(output.join("\n")).not.toContain("would write:");
    expect(output.join("\n")).toContain("nothing to write");
  });

  test("runs emet setup only on an interactive terminal", async () => {
    expect(await install()).toBe(0);
    expect(setupCalls).toEqual([]);
    expect(await install({}, { interactive: true })).toBe(0);
    expect(setupCalls).toEqual([shimPath()]);
  });

  test("a failing emet setup is a warning, not a failed install", async () => {
    const result = await install({}, { interactive: true, runSetup: () => Promise.resolve(3) });
    expect(result).toBe(0);
    expect(errors.join("\n")).toContain("emet setup exited 3");
  });

  test("warns when ~/.local/bin is not on PATH", async () => {
    expect(await install({}, { pathEnv: "/usr/bin" })).toBe(0);
    expect(output.join("\n")).toContain('export PATH="$HOME/.local/bin:$PATH"');
  });

  test("from source without --from refuses and points at --from", async () => {
    expect(await install({}, { compiled: false })).toBe(2);
    expect(errors.join("\n")).toContain("--from <checkout>");
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });

  test("--from hands off to the source install", async () => {
    expect(await install({ from: sandbox })).toBe(1);
    expect(errors.join("\n")).toContain(`--from ${sandbox}`);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });
});

describe("readInstallState", () => {
  test("is null when no state file exists", () => {
    expect(readInstallState(home)).toBeNull();
  });

  test("is null for a state file that is not valid JSON or has the wrong shape", () => {
    const statePath = path.join(home, ".local/share/emet/install.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, "{not json");
    expect(readInstallState(home)).toBeNull();
    writeFileSync(statePath, JSON.stringify({ version: "1.0.0", hosts: ["vim"] }));
    expect(readInstallState(home)).toBeNull();
    writeFileSync(statePath, "[]");
    expect(readInstallState(home)).toBeNull();
  });
});

describe("runSelf", () => {
  test("install parses the version and flags", async () => {
    expect(await runSelf(["install", "latest", "--dry-run", "--force"], deps())).toBe(0);
    expect(output.join("\n")).toContain("would write:");
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });

  test("install --from takes the next token as the checkout", async () => {
    expect(await runSelf(["install", "--from", sandbox], deps())).toBe(1);
    expect(errors.join("\n")).toContain(`--from ${sandbox}`);
  });

  test("rejects a missing --from value, an unknown flag and a second version", async () => {
    expect(await runSelf(["install", "--from"], deps())).toBe(2);
    expect(await runSelf(["install", "--bogus"], deps())).toBe(2);
    expect(await runSelf(["install", "1.0.0", "2.0.0"], deps())).toBe(2);
    expect(errors.join("\n")).toContain("--bogus");
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });

  test("update hands off to the updater", async () => {
    expect(await runSelf(["update", "latest"], deps())).toBe(0);
    expect(output.join("\n")).toContain("not a standalone install");
  });

  test("an unknown or missing subcommand prints usage", async () => {
    expect(await runSelf([], deps())).toBe(2);
    expect(await runSelf(["remove"], deps())).toBe(2);
    expect(errors.join("\n")).toContain("usage: emet self install");
  });
});
