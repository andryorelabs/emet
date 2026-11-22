import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import {
  GUARD_COMMAND_PATTERN,
  describeStep,
  executeStep,
  parseUninstallOptions,
  planUninstall,
  CONSOLE_OUTPUT,
  realUninstallEnv,
  runCommand,
  runUninstall,
  withoutGuardHooks,
  type UninstallEnv,
  type UninstallOptions,
} from "./uninstall";

let homeDir = "";
let logged: string[] = [];
let asked: string[] = [];

const NOW = new Date("2026-11-22T10:11:12.345Z");
const DEFAULTS: UninstallOptions = { dryRun: false, yes: true, purge: false, json: false };

function fakeEnv(overrides: Partial<UninstallEnv> = {}): UninstallEnv {
  return {
    homeDir,
    stateDir: path.join(homeDir, ".local", "state", "emet"),
    run: () => Promise.resolve(0),
    commandExists: () => Promise.resolve(false),
    now: () => NOW,
    log: (line) => {
      logged.push(line);
    },
    tty: false,
    ask: (question) => {
      asked.push(question);
      return Promise.resolve("y");
    },
    ...overrides,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

function home(relative: string): string {
  return path.join(homeDir, relative);
}

function write(relative: string, content: string): void {
  mkdirSync(path.dirname(home(relative)), { recursive: true });
  writeFileSync(home(relative), content);
}

function sha(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function writeManifest(entries: Record<string, string>): void {
  write(".claude/emet/.install-manifest.json", `${JSON.stringify(entries, null, 2)}\n`);
}

const MANIFEST = ".claude/emet/.install-manifest.json";
const SETTINGS = ".claude/settings.json";
const WRAPPER = '#!/usr/bin/env bash\nexec bun "$HOME/.claude/emet/bin/emet.ts" "$@"\n';

function guardGroup(event: string): { hooks: { type: string; command: string }[] } {
  const command = `${homeDir}/.local/bin/emet guard${event === "PreToolUse" ? "" : ` --event ${event}`}`;
  return { hooks: [{ type: "command", command }] };
}

/** A full source install: two commands, an agent, a CLI file, the wrapper, the seven hooks. */
function fullInstall(): void {
  write(".claude/commands/emet/run.md", "run");
  write(".claude/agents/emet-worker.md", "worker");
  write(".claude/emet/bin/emet.ts", "cli");
  write(".local/bin/emet", WRAPPER);
  writeManifest({
    ".claude/agents/emet-worker.md": sha("worker"),
    ".claude/commands/emet/run.md": sha("run"),
    ".claude/emet/bin/emet.ts": sha("cli"),
    ".local/bin/emet": sha(WRAPPER),
  });
  write(SETTINGS, JSON.stringify(guardSettings([])));
}

/** settings.json with the seven guard hooks; `extraPreToolUse` joins the PreToolUse guard group. */
function guardSettings(extraPreToolUse: readonly { type: string; command: string }[]): unknown {
  const events = [
    "PreToolUse",
    "SubagentStop",
    "Stop",
    "Notification",
    "PermissionRequest",
    "SessionEnd",
    "UserPromptSubmit",
  ];
  const groupFor = (event: string): unknown => {
    const group = guardGroup(event);
    return event === "PreToolUse" ? { hooks: [...group.hooks, ...extraPreToolUse] } : group;
  };
  return {
    model: "opus",
    hooks: Object.fromEntries(events.map((event) => [event, [groupFor(event)]])),
  };
}

beforeEach(() => {
  homeDir = mkdtempSync(path.join(tmpdir(), "emet-uninstall-"));
  logged = [];
  asked = [];
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
});

describe("GUARD_COMMAND_PATTERN", () => {
  test("matches emet guard bare, by path and with flags, and nothing else", () => {
    expect(GUARD_COMMAND_PATTERN.test("emet guard")).toBe(true);
    expect(GUARD_COMMAND_PATTERN.test("/home/u/.local/bin/emet guard --event Stop")).toBe(true);
    expect(GUARD_COMMAND_PATTERN.test("emet guardian")).toBe(false);
    expect(GUARD_COMMAND_PATTERN.test("my-linter emet guard")).toBe(false);
  });
});

describe("S5: manifest files and shim", () => {
  test("deletes unchanged files and their .new, keeps and lists edited ones, removes the manifest", async () => {
    write(".claude/commands/emet/run.md", "run");
    write(".claude/commands/emet/run.md.new", "run v2");
    write(".claude/agents/emet-worker.md", "worker, edited");
    writeManifest({
      ".claude/agents/emet-worker.md": sha("worker"),
      ".claude/commands/emet/run.md": sha("run"),
      ".claude/commands/emet/gone.md": sha("gone"),
    });

    const result = await runUninstall(DEFAULTS, fakeEnv());

    expect(result.failed).toEqual([]);
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(false);
    expect(existsSync(home(".claude/commands/emet/run.md.new"))).toBe(false);
    expect(existsSync(home(".claude/commands/emet"))).toBe(false);
    expect(existsSync(home(".claude/commands"))).toBe(true);
    expect(readFileSync(home(".claude/agents/emet-worker.md"), "utf8")).toBe("worker, edited");
    expect(result.steps).toContainEqual({
      kind: "keep-edited",
      path: home(".claude/agents/emet-worker.md"),
    });
    expect(logged.some((line) => line.includes("keep") && line.includes("emet-worker.md"))).toBe(
      true,
    );
    expect(existsSync(home(MANIFEST))).toBe(false);
    expect(existsSync(home(".claude/emet"))).toBe(false);
  });

  test("removes the source wrapper shim", async () => {
    fullInstall();
    await runUninstall(DEFAULTS, fakeEnv());
    expect(existsSync(home(".local/bin/emet"))).toBe(false);
    expect(existsSync(home(".local/bin"))).toBe(true);
  });

  test("removes a symlink shim into the install", async () => {
    write(".claude/emet/bin/emet", "binary");
    writeManifest({ ".claude/emet/bin/emet": sha("binary") });
    mkdirSync(home(".local/bin"), { recursive: true });
    symlinkSync(home(".claude/emet/bin/emet"), home(".local/bin/emet"));

    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "remove-shim", path: home(".local/bin/emet") });
    await runUninstall(DEFAULTS, fakeEnv());
    expect(existsSync(home(".local/bin/emet"))).toBe(false);
  });

  test("recognizes a wrapper that points into the install even when its hash changed", async () => {
    write(".local/bin/emet", `${WRAPPER}# tweaked\n`);
    writeManifest({ ".local/bin/emet": sha(WRAPPER) });
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "remove-shim", path: home(".local/bin/emet") });
  });

  test("keeps a shim that does not point into the install", async () => {
    write(".local/bin/emet", "#!/bin/sh\nexec /opt/other/emet\n");
    mkdirSync(home("elsewhere"), { recursive: true });
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "keep-edited", path: home(".local/bin/emet") });
    await runUninstall(DEFAULTS, fakeEnv());
    expect(existsSync(home(".local/bin/emet"))).toBe(true);
  });

  test("keeps a symlink shim that points elsewhere", async () => {
    write("elsewhere/emet", "x");
    mkdirSync(home(".local/bin"), { recursive: true });
    symlinkSync(home("elsewhere/emet"), home(".local/bin/emet"));
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "keep-edited", path: home(".local/bin/emet") });
  });

  test("keeps a directory at the shim path", async () => {
    mkdirSync(home(".local/bin/emet"), { recursive: true });
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "keep-edited", path: home(".local/bin/emet") });
  });

  test("without a manifest prints the plugin uninstall command and touches no file", async () => {
    write(".claude/commands/emet/run.md", "run");
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toHaveLength(1);
    expect(steps[0]?.kind).toBe("note");
    expect(describeStep(steps[0] ?? { kind: "note", text: "" })).toContain(
      "claude plugin uninstall emet@emet-marketplace",
    );
    await runUninstall(DEFAULTS, fakeEnv());
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(true);
  });

  test("prints the Codex removal when codex is on PATH", async () => {
    const steps = await planUninstall(
      DEFAULTS,
      fakeEnv({ commandExists: (name) => Promise.resolve(name === "codex") }),
    );
    expect(steps).toContainEqual({
      kind: "note",
      text: "remove the Codex plugin with `codex plugin remove emet@emet-marketplace`",
    });
  });

  test("a malformed manifest fails naming its path", async () => {
    write(MANIFEST, "{nope");
    expect(await rejectionOf(planUninstall(DEFAULTS, fakeEnv()))).toContain(home(MANIFEST));
  });

  test("a manifest that is not an object fails naming its path", async () => {
    write(MANIFEST, "[]");
    expect(await rejectionOf(planUninstall(DEFAULTS, fakeEnv()))).toContain(home(MANIFEST));
  });

  test("a manifest entry escaping HOME fails naming its path", async () => {
    writeManifest({ "../outside": sha("x") });
    expect(await rejectionOf(planUninstall(DEFAULTS, fakeEnv()))).toContain(home(MANIFEST));
  });

  test("a manifest entry under a file is skipped; an unreadable entry path fails", async () => {
    write("plain", "x");
    writeManifest({ "plain/child.md": sha("x") });
    expect((await planUninstall(DEFAULTS, fakeEnv())).map((step) => step.kind)).toEqual([
      "remove-file",
    ]);
    writeManifest({ [`${"n".repeat(300)}.md`]: sha("x") });
    expect(await rejectionOf(planUninstall(DEFAULTS, fakeEnv()))).toContain("ENAMETOOLONG");
  });

  test("a file edited between plan and execution is kept and the step fails", () => {
    write(".claude/commands/emet/run.md", "edited later");
    const context = {
      manifestPath: home(MANIFEST),
      hashes: new Map([[home(".claude/commands/emet/run.md"), sha("run")]]),
      env: fakeEnv(),
    };
    expect(() => {
      executeStep({ kind: "remove-file", path: home(".claude/commands/emet/run.md") }, context);
    }).toThrow("edited since the plan");
    expect(() => {
      executeStep({ kind: "remove-file", path: home("not-listed") }, context);
    }).toThrow("not in the install manifest");
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(true);
  });

  test("revert-extra is a stub that fails visibly", () => {
    const context = { manifestPath: home(MANIFEST), hashes: new Map(), env: fakeEnv() };
    expect(() => {
      executeStep({ kind: "revert-extra", id: "context7" }, context);
    }).toThrow("not supported yet");
  });
});

describe("S6: guard hooks", () => {
  test("removes every emet guard hook, keeps a sibling user hook, and backs up first", async () => {
    fullInstall();
    write(SETTINGS, JSON.stringify(guardSettings([{ type: "command", command: "my-linter" }])));
    const before = readFileSync(home(SETTINGS), "utf8");

    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps).toContainEqual({ kind: "remove-hooks", settingsPath: home(SETTINGS), count: 7 });
    await runUninstall(DEFAULTS, fakeEnv());

    const after = readFileSync(home(SETTINGS), "utf8");
    expect(after).not.toContain("emet guard");
    expect(JSON.parse(after)).toEqual({
      model: "opus",
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "my-linter" }] }] },
    });
    const backup = home(`${SETTINGS}.pre-emet-guard-backup.20261122T101112Z`);
    expect(readFileSync(backup, "utf8")).toBe(before);
  });

  test("drops the hooks key when every event empties, keeps unrelated shapes", () => {
    expect(
      withoutGuardHooks({ hooks: { Stop: [{ hooks: [{ command: "emet guard --event Stop" }] }] } }),
    ).toEqual({});
    expect(
      withoutGuardHooks({
        hooks: { Odd: "x", Empty: [], Stop: ["raw", { matcher: "*" }] },
      }),
    ).toEqual({ hooks: { Odd: "x", Empty: [], Stop: ["raw", { matcher: "*" }] } });
    expect(withoutGuardHooks({ hooks: [] })).toEqual({ hooks: [] });
  });

  test("plans nothing for settings without guard hooks", async () => {
    write(SETTINGS, JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "other" }] }] } }));
    const steps = await planUninstall(DEFAULTS, fakeEnv());
    expect(steps.some((step) => step.kind === "remove-hooks")).toBe(false);
  });

  test("a malformed settings.json fails naming its path", async () => {
    write(SETTINGS, "{bad");
    expect(await rejectionOf(planUninstall(DEFAULTS, fakeEnv()))).toContain(home(SETTINGS));
  });

  test("settings.json that turned into a non-object fails the hooks step", async () => {
    fullInstall();
    const context = { manifestPath: home(MANIFEST), hashes: new Map(), env: fakeEnv() };
    write(SETTINGS, "[1]");
    expect(() => {
      executeStep({ kind: "remove-hooks", settingsPath: home(SETTINGS), count: 7 }, context);
    }).toThrow(home(SETTINGS));
    expect(await Promise.resolve(readFileSync(home(SETTINGS), "utf8"))).toBe("[1]");
  });
});

describe("S8: flags", () => {
  test("--dry-run lists files, shim and hooks and changes nothing", async () => {
    fullInstall();
    const settingsBefore = readFileSync(home(SETTINGS), "utf8");
    const result = await runUninstall({ ...DEFAULTS, dryRun: true }, fakeEnv());
    const kinds = new Set(result.steps.map((step) => step.kind));
    expect([...kinds].toSorted()).toEqual(["remove-file", "remove-hooks", "remove-shim"]);
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(true);
    expect(existsSync(home(".local/bin/emet"))).toBe(true);
    expect(existsSync(home(MANIFEST))).toBe(true);
    expect(readFileSync(home(SETTINGS), "utf8")).toBe(settingsBefore);
    expect(logged.length).toBe(result.steps.length);
  });

  test("no TTY and no --yes prints the plan and changes nothing", async () => {
    fullInstall();
    await runUninstall({ ...DEFAULTS, yes: false }, fakeEnv());
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(true);
    expect(logged.at(-1)).toContain("--yes");
    expect(asked).toEqual([]);
  });

  test("a TTY without --yes asks once and proceeds on yes", async () => {
    fullInstall();
    await runUninstall({ ...DEFAULTS, yes: false }, fakeEnv({ tty: true }));
    expect(asked).toHaveLength(1);
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(false);
  });

  test("a TTY answer other than yes aborts", async () => {
    fullInstall();
    await runUninstall(
      { ...DEFAULTS, yes: false },
      fakeEnv({ tty: true, ask: () => Promise.resolve("n") }),
    );
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(true);
    expect(logged.at(-1)).toContain("Aborted");
  });

  test("--purge removes stateDir and ~/.emet; without it both stay", async () => {
    write(".local/state/emet/journal.jsonl", "x");
    write(".emet/setup-notice-shown", "x");
    await runUninstall(DEFAULTS, fakeEnv());
    expect(existsSync(home(".local/state/emet"))).toBe(true);
    expect(existsSync(home(".emet"))).toBe(true);
    const result = await runUninstall({ ...DEFAULTS, purge: true }, fakeEnv());
    expect(result.steps.filter((step) => step.kind === "purge")).toHaveLength(2);
    expect(existsSync(home(".local/state/emet"))).toBe(false);
    expect(existsSync(home(".emet"))).toBe(false);
  });

  test("one failing step is reported and the others still run", async () => {
    fullInstall();
    write(SETTINGS, JSON.stringify({ hooks: { Stop: [guardGroup("Stop")] } }));
    const env = fakeEnv({
      now: () => {
        throw new Error("clock broke");
      },
    });
    const result = await runUninstall(DEFAULTS, env);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toContain("clock broke");
    expect(existsSync(home(".claude/commands/emet/run.md"))).toBe(false);
  });

  test("parses the four flags", () => {
    expect(parseUninstallOptions(["--dry-run", "--purge"])).toEqual({
      dryRun: true,
      yes: false,
      purge: true,
      json: false,
    });
    expect(parseUninstallOptions(["--yes", "--json"])).toMatchObject({ yes: true, json: true });
  });

  test("describes every step kind", () => {
    expect(describeStep({ kind: "revert-extra", id: "mascot" })).toBe("revert extra mascot");
    expect(describeStep({ kind: "purge", path: "/s" })).toBe("purge /s");
    expect(describeStep({ kind: "note", text: "hi" })).toBe("note: hi");
    expect(describeStep({ kind: "remove-shim", path: "/b" })).toBe("remove shim /b");
  });
});

describe("runCommand", () => {
  let out: string[] = [];
  let err: string[] = [];
  const output = {
    out: (line: string) => {
      out.push(line);
    },
    err: (line: string) => {
      err.push(line);
    },
  };

  beforeEach(() => {
    out = [];
    err = [];
  });

  test("--json --yes uninstalls and prints one sorted result", async () => {
    fullInstall();
    const code = await runCommand({ ...DEFAULTS, json: true }, fakeEnv(), output);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    const parsed: unknown = JSON.parse(out[0] ?? "");
    expect(isObject(parsed) ? parsed.failed : undefined).toEqual([]);
    expect(readdirSync(home(".local/bin"))).toEqual([]);
  });

  test("a malformed manifest exits 1 naming its path on stderr", async () => {
    write(MANIFEST, "{");
    expect(await runCommand(DEFAULTS, fakeEnv(), output)).toBe(1);
    expect(err.join("\n")).toContain(home(MANIFEST));
  });

  test("a failed step exits 1", async () => {
    fullInstall();
    chmodSync(home(".claude"), 0o555);
    let code: number;
    try {
      code = await runCommand(DEFAULTS, fakeEnv(), output);
    } finally {
      chmodSync(home(".claude"), 0o755);
    }
    expect(code).toBe(1);
    expect(readFileSync(home(SETTINGS), "utf8")).toContain("emet guard");
    expect(logged.some((line) => line.startsWith("failed: remove 7 emet guard"))).toBe(true);
  });
});

describe("emet uninstall", () => {
  test("--dry-run through the CLI prints the plan and changes nothing", () => {
    fullInstall();
    const entry = path.resolve(import.meta.dir, "../bin/emet.ts");
    const result = Bun.spawnSync(["bun", entry, "uninstall", "--dry-run"], {
      env: {
        ...process.env,
        HOME: homeDir,
        EMET_STATE_DIR: path.join(homeDir, "state"),
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`remove shim ${home(".local/bin/emet")}`);
    expect(existsSync(home(".local/bin/emet"))).toBe(true);
  });
});

describe("realUninstallEnv", () => {
  const originalLog = console.log;
  const originalError = console.error;
  let printed: string[] = [];

  beforeEach(() => {
    printed = [];
    console.log = (line: string) => {
      printed.push(`out:${line}`);
    };
    console.error = (line: string) => {
      printed.push(`err:${line}`);
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test("wires the host: run, commandExists, now, log and a silent ask", async () => {
    const { env, close } = await realUninstallEnv(false);
    try {
      expect(await env.run(["true"])).toBe(0);
      expect(await env.commandExists("sh")).toBe(true);
      expect(await env.commandExists("definitely-not-a-binary-xyz")).toBe(false);
      expect(env.now()).toBeInstanceOf(Date);
      expect(await env.ask("?")).toBe("");
      env.log("plain");
    } finally {
      close();
    }
    const json = await realUninstallEnv(true);
    json.env.log("to stderr");
    json.close();
    expect(json.env.tty).toBe(false);
    expect(printed).toEqual(["out:plain", "err:to stderr"]);
  });

  test("CONSOLE_OUTPUT writes stdout and stderr", () => {
    CONSOLE_OUTPUT.out("a");
    CONSOLE_OUTPUT.err("b");
    expect(printed).toEqual(["out:a", "err:b"]);
  });
});
