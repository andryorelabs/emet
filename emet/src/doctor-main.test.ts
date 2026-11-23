import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkSelfCheckCommand, createEnvironmentProbes, run } from "./doctor";
import { computeAutoMaxLiveWorkers, readHostResources } from "./resources";
import * as skills from "./skills";

let root: string;
let home: string;
let binDirectory: string;
let homedirSpy: Mock<typeof os.homedir>;
const savedEnvironment: Record<string, string | undefined> = {};
const OVERRIDDEN = ["HOME", "PATH", "XDG_STATE_HOME", "EMET_STATE_DIR", "CODEX_HOME"] as const;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "doctor-main-")));
  home = path.join(root, "home");
  binDirectory = path.join(root, "bin");
  mkdirSync(home);
  mkdirSync(binDirectory);
  symlinkSync(Bun.which("git") ?? "/usr/bin/git", path.join(binDirectory, "git"));
  for (const name of OVERRIDDEN) savedEnvironment[name] = process.env[name];
  process.env.HOME = home;
  homedirSpy = spyOn(os, "homedir").mockReturnValue(home);
  process.env.XDG_STATE_HOME = path.join(root, "state");
  delete process.env.EMET_STATE_DIR;
  delete process.env.CODEX_HOME;
});

afterEach(() => {
  homedirSpy.mockRestore();
  for (const name of OVERRIDDEN) {
    const saved = savedEnvironment[name];
    if (saved === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = saved;
  }
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

function writeExecutable(name: string, body: string): void {
  const file = path.join(binDirectory, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

async function runDoctor(argv: string[]): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (line: unknown) => void lines.push(String(line));
  try {
    await run(argv);
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

function writeHomeFile(relativePath: string, content: string): string {
  const file = path.join(home, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function makePlainDirectory(): string {
  const plain = path.join(root, "plain");
  mkdirSync(plain);
  return plain;
}

describe("doctor run() home-level sections", () => {
  test("reports settings advisories, dead guard hooks, legacy state and install drift", async () => {
    writeHomeFile(
      ".claude/settings.json",
      JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ command: "/nowhere/emet guard" }] }] },
      }),
    );
    writeHomeFile(".claude/emet/edited.txt", "now");
    writeHomeFile(
      ".claude/emet/.install-manifest.json",
      JSON.stringify({
        ".claude/emet/edited.txt": createHash("sha256").update("before").digest("hex"),
      }),
    );
    mkdirSync(path.join(root, "state", "forge"), { recursive: true });

    const output = await runDoctor([makePlainDirectory()]);

    expect(output).toContain("Settings advisories");
    expect(output).toContain('model is not "opusplan"');
    expect(output).toContain("Dead guard hooks");
    expect(output).toContain("warning: PreToolUse: /nowhere/emet guard");
    expect(output).toContain("Legacy state:");
    expect(output).toContain(path.join(root, "state", "forge"));
    expect(output).toContain("Install drift");
    expect(output).toContain("~/.claude/emet/edited.txt was edited since install");
  }, 60_000);

  test("reports a double install when the plugin and the manifest both exist", async () => {
    writeHomeFile(".claude/emet/.install-manifest.json", "{}");
    const pluginSpy = spyOn(skills, "listInstalledPlugins").mockReturnValue([
      { id: "emet@market", version: "1.0.0", enabled: true, installPath: `${root}/plugin` },
    ]);

    const output = await runDoctor([makePlainDirectory()]);
    pluginSpy.mockRestore();

    expect(output).toContain("Double install:");
    expect(output).toContain("installed standalone and as a plugin");
  }, 60_000);

  test("warns about untrusted emet hooks on the Codex host and skips a missing config", async () => {
    const repo = makePlainDirectory();
    writeFileSync(path.join(repo, "emet.config.json"), JSON.stringify({ agentHost: "codex" }));
    process.env.CODEX_HOME = path.join(home, ".codex");
    process.env.PATH = binDirectory;

    const missingConfig = await runDoctor([repo]);
    expect(missingConfig).not.toContain("Codex hooks:");

    writeHomeFile(".codex/config.toml", '[plugins."emet@emet-marketplace"]\nenabled = true\n');
    const untrusted = await runDoctor([repo]);
    expect(untrusted).toContain("Codex hooks:");
    expect(untrusted).toContain("warning: Codex has not trusted the emet plugin hooks");
  }, 60_000);

  test("reports missing external CLI flags and a failing exit code", async () => {
    process.env.PATH = binDirectory;

    const output = await runDoctor([makePlainDirectory()]);

    expect(output).toContain("External CLI flags (verified via --help):");
    expect(process.exitCode).toBe(1);
  }, 60_000);
});

function makeGitRepo(name: string, config: object): string {
  const repo = path.join(root, name);
  mkdirSync(repo);
  Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
  writeFileSync(path.join(repo, "emet.config.json"), JSON.stringify(config));
  return repo;
}

const baseConfig = {
  version: 1,
  repo: { trunk: "main", remote: "origin" },
  ticket: { idPattern: "^X-\\d+$", branchPrefix: "x" },
  landing: { unit: "wave" },
};

function writeAllDocs(repo: string): void {
  const docs = path.join(repo, "docs", "agents");
  mkdirSync(docs, { recursive: true });
  for (const name of ["emet.md", "issue-tracker.md", "triage-labels.md", "domain.md"]) {
    writeFileSync(path.join(docs, name), "# fine\n");
  }
}

describe("doctor run() repo reports", () => {
  const autoCap = computeAutoMaxLiveWorkers(readHostResources());
  test.skipIf(autoCap < 2)(
    "a clean repo prints OK with the pinned worker note and warnings as notes",
    async () => {
      const repo = makeGitRepo("clean", { ...baseConfig, concurrency: { maxLiveWorkers: 1 } });
      writeAllDocs(repo);
      writeFileSync(path.join(repo, "CONTEXT.md"), "legacy");
      writeFileSync(path.join(repo, "package.json"), "{}");

      const output = await runDoctor([repo]);

      expect(output).toContain(`${repo}: OK`);
      expect(output).toContain("note: concurrency.maxLiveWorkers is pinned at 1");
      expect(output).toContain("note: rename CONTEXT.md to GLOSSARY.md");
      expect(output).toContain("1/1 repos clean");
    },
    60_000,
  );

  test("a dirty repo lists every kind of finding", async () => {
    const repo = makeGitRepo("dirty", {
      ...baseConfig,
      tracker: { kind: "linear" },
      commands: { selfCheck: ["bun run nothing", "definitely-not-a-binary-xyz"] },
    });
    mkdirSync(path.join(repo, "docs", "agents"), { recursive: true });
    writeFileSync(path.join(repo, "docs", "agents", "emet.md"), "TODO(emet): fill me in\n");
    writeFileSync(path.join(repo, "package.json"), '{"scripts":{}}');
    writeFileSync(path.join(repo, "CONTEXT.md"), "legacy");
    writeExecutable("claude", "exit 0");
    process.env.PATH = `${binDirectory}:${process.env.PATH}`;

    const output = await runDoctor([repo]);

    expect(output).toContain("  - missing docs/agents/issue-tracker.md");
    expect(output).toContain("commands.selfCheck:");
    expect(output).toContain("tracker.team");
    expect(output).toContain("  - warning: rename CONTEXT.md to GLOSSARY.md");
    expect(output).toContain("  - docs/agents/emet.md:1: TODO(emet): fill me in");
    expect(output).toContain("  - note: tracker: linear");
    expect(output).toContain("0/1 repos clean");
    expect(process.exitCode).toBe(1);
  }, 60_000);

  test("a github tracker without gh on PATH is an unsatisfied dependency", async () => {
    const repo = makeGitRepo("github", { ...baseConfig, tracker: { kind: "github" } });
    writeAllDocs(repo);
    process.env.PATH = binDirectory;

    const output = await runDoctor([repo]);

    expect(output).toContain("  - dependency:");
    expect(output).toContain("0/1 repos clean");
  }, 60_000);

  test("the merge-commit probe maps the gh answer to true, false or undefined", async () => {
    const repo = makeGitRepo("probe", baseConfig);
    process.env.PATH = binDirectory;
    const probe = createEnvironmentProbes().repoMergeCommitAllowed;
    expect(probe).toBeDefined();

    writeExecutable("gh", "echo true");
    expect(await probe?.(repo)).toBe(true);
    writeExecutable("gh", "echo false");
    expect(await probe?.(repo)).toBe(false);
    writeExecutable("gh", "echo maybe");
    expect(await probe?.(repo)).toBeUndefined();
  });

  test("the ruleset probe maps the gh answer to the allowed merge methods", async () => {
    const repo = makeGitRepo("ruleset-probe", baseConfig);
    process.env.PATH = binDirectory;
    const probe = createEnvironmentProbes().trunkAllowedMergeMethods;
    expect(probe).toBeDefined();

    writeExecutable("gh", `echo '["squash"]'`);
    expect(await probe?.(repo, "develop")).toEqual(["squash"]);
    writeExecutable("gh", "echo null");
    expect(await probe?.(repo, "develop")).toBeUndefined();
    writeExecutable("gh", "exit 1");
    expect(await probe?.(repo, "develop")).toBeUndefined();
  });

  test("a clean repo with no notes prints a bare OK line", async () => {
    const repo = makeGitRepo("bare-clean", baseConfig);
    writeAllDocs(repo);
    writeFileSync(path.join(repo, "package.json"), "{}");

    const output = await runDoctor([repo]);

    expect(output).toContain(`${repo}: OK\n`);
    expect(output).toContain("1/1 repos clean");
  }, 60_000);

  test("a clean repo with verify.browser and no agent-browser prints an optional line", async () => {
    const repo = makeGitRepo("browser-clean", {
      ...baseConfig,
      verify: { browser: { startCommand: "bun run dev", url: "http://localhost:4321" } },
    });
    writeAllDocs(repo);
    writeFileSync(path.join(repo, "package.json"), "{}");
    process.env.PATH = binDirectory;

    const output = await runDoctor([repo]);

    expect(output).toContain(`${repo}: OK\n  - optional:`);
    expect(output).toContain("agent-browser");
    expect(output).toContain("1/1 repos clean");
  }, 60_000);

  test("a dirty repo with verify.browser and no agent-browser still lists the optional line", async () => {
    const repo = makeGitRepo("browser-dirty", {
      ...baseConfig,
      verify: { browser: { startCommand: "bun run dev", url: "http://localhost:4321" } },
    });
    process.env.PATH = binDirectory;

    const output = await runDoctor([repo]);

    expect(output).toContain("  - missing docs/agents/issue-tracker.md");
    expect(output).toContain("  - optional:");
    expect(output).toContain("0/1 repos clean");
  }, 60_000);

  test("a leftover legacy slots directory is reported as a note", async () => {
    const repo = makeGitRepo("slots", baseConfig);
    mkdirSync(path.join(repo, ".git", "forge", "slots", "1"), { recursive: true });
    const originalDirectory = process.cwd();
    process.chdir(repo);
    try {
      const output = await runDoctor([repo]);
      expect(output).toContain("still has entries");
    } finally {
      process.chdir(originalDirectory);
    }
  }, 60_000);

  test("an unreadable user settings file yields no advisories", async () => {
    writeHomeFile(".claude/settings.json", "{ not json");
    const output = await runDoctor([makePlainDirectory()]);
    expect(output).not.toContain("Settings advisories");
  }, 60_000);

  test("a merge-landing local repo skips the gh flag check", async () => {
    const repo = makeGitRepo("merge", { ...baseConfig, landing: { unit: "wave", mode: "merge" } });
    process.env.PATH = binDirectory;
    const output = await runDoctor([repo]);
    expect(output).not.toContain("gh issue view");
  }, 60_000);
});

describe("doctor run() error handling", () => {
  test("an unexpected failure is logged", async () => {
    const originalError = console.error;
    const logged: unknown[] = [];
    console.error = (value: unknown) => void logged.push(value);
    const originalLog = console.log;
    console.log = () => {
      throw new Error("boom");
    };
    const plain = makePlainDirectory();
    process.exitCode = undefined;
    try {
      await run([plain]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    expect(String(logged[0])).toContain("boom");
  }, 60_000);
});

describe("checkSelfCheckCommand package manager parsing", () => {
  test("a flag before run and an inline directory option are understood", async () => {
    const sub = path.join(root, "sub");
    mkdirSync(sub);
    writeFileSync(path.join(sub, "package.json"), JSON.stringify({ scripts: { lint: "x" } }));
    expect(await checkSelfCheckCommand(root, "bun --silent --cwd=sub run lint", null)).toBeNull();
    expect(await checkSelfCheckCommand(root, "bun --cwd=sub run missing", null)).toContain(
      'script "missing", which doesn\'t exist',
    );
  });

  test("a package-manager invocation with no script falls back to the PATH check", async () => {
    writeExecutable("bun", "exit 0");
    process.env.PATH = binDirectory;
    expect(await checkSelfCheckCommand(root, "bun run", null)).toBeNull();
    expect(await checkSelfCheckCommand(root, "bun install", null)).toBeNull();
  });

  test("a malformed package.json is unreadable", async () => {
    writeFileSync(path.join(root, "package.json"), "{ nope");
    expect(await checkSelfCheckCommand(root, "bun --cwd . run lint", null)).toContain(
      "has no readable package.json",
    );
  });

  test("a package.json that is not an object is unreadable", async () => {
    writeFileSync(path.join(root, "package.json"), '"text"');
    expect(await checkSelfCheckCommand(root, "npm --prefix . run lint", null)).toContain(
      "has no readable package.json",
    );
  });

  test("a package.json without scripts has no scripts", async () => {
    writeFileSync(path.join(root, "package.json"), "{}");
    expect(await checkSelfCheckCommand(root, "bun --dir . run lint", null)).toContain(
      "doesn't exist",
    );
  });

  test("an empty command is reported", async () => {
    expect(await checkSelfCheckCommand(root, "   ", null)).toBe(
      "empty command in commands.selfCheck",
    );
  });
});

describe("createEnvironmentProbes", () => {
  test("helpText returns null for an empty or unknown command", async () => {
    const probes = createEnvironmentProbes();
    expect(await probes.helpText([])).toBeNull();
    expect(await probes.helpText(["definitely-not-a-real-binary-xyz", "--help"])).toBeNull();
  });

  test("helpText returns output text, and null for silent failures", async () => {
    writeExecutable("noisy", "echo usage text >&2; exit 2");
    writeExecutable("silent", "exit 2");
    writeExecutable("fine", "echo ok");
    const probes = createEnvironmentProbes();
    expect(await probes.helpText([path.join(binDirectory, "noisy")])).toContain("usage text");
    expect(await probes.helpText([path.join(binDirectory, "silent")])).toBeNull();
    expect(await probes.helpText([path.join(binDirectory, "fine")])).toContain("ok");
  });

  test("git probes read the remote url and resolve refs inside a repo, null elsewhere", async () => {
    const repo = path.join(root, "repo");
    mkdirSync(repo);
    const git = (...args: string[]) => Bun.spawnSync(["git", "-C", repo, ...args]);
    git("init", "-q");
    git("remote", "add", "origin", "https://github.com/acme/widgets.git");
    git("-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    const probes = createEnvironmentProbes();
    expect(await probes.remoteUrl(repo, "origin")).toBe("https://github.com/acme/widgets.git");
    expect(await probes.remoteUrl(repo, "nope")).toBeNull();
    expect(await probes.resolveRef(repo, "HEAD")).toMatch(/^[0-9a-f]{40}$/);
    expect(await probes.resolveRef(repo, "no-such-ref")).toBeNull();
    expect(await probes.remoteUrl(path.join(root, "missing-dir"), "origin")).toBeNull();
  });

  test("ghRepoNameWithOwner returns the gh output and null when gh fails", async () => {
    writeExecutable("gh", "echo acme/widgets");
    process.env.PATH = `${binDirectory}:${process.env.PATH}`;
    const probes = createEnvironmentProbes();
    expect(await probes.ghRepoNameWithOwner(root)).toBe("acme/widgets");
    writeExecutable("gh", "exit 1");
    expect(await probes.ghRepoNameWithOwner(root)).toBeNull();
  });

  test("worktreeBaseRef prefers repo settings and skips unreadable or non-object files", async () => {
    const repo = path.join(root, "repo");
    mkdirSync(path.join(repo, ".claude"), { recursive: true });
    const probes = createEnvironmentProbes();
    expect(await probes.worktreeBaseRef(repo)).toBeNull();
    writeHomeFile(".claude/settings.json", JSON.stringify({ worktree: { baseRef: "fresh" } }));
    writeFileSync(path.join(repo, ".claude", "settings.local.json"), "[]");
    writeFileSync(path.join(repo, ".claude", "settings.json"), "{ broken");
    expect(await probes.worktreeBaseRef(repo)).toBe("fresh");
    writeFileSync(
      path.join(repo, ".claude", "settings.json"),
      JSON.stringify({ worktree: { baseRef: "head" } }),
    );
    expect(await probes.worktreeBaseRef(repo)).toBe("head");
  });
});
