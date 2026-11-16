import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { configureTicketPattern } from "../emet/src/claims";
import { DEFAULT_FORGE_CONFIG } from "../emet/src/config";
import {
  main,
  pushRefusedByRules,
  runFullFlow,
  runProbe,
  type FlowStep,
  type ProbeResult,
} from "./codex-probe";

const REPO = path.resolve(import.meta.dir, "..");
const BASE_FAKE = path.resolve(import.meta.dir, "fixtures/codex-probe/codex");
const SCENARIO_TIMEOUT_MS = 180_000;
const NONCE = "EMET-PROBE-NONCE-7F3A";

/**
 * The source of a scriptable fake `codex`. `FAKE_CODEX_MODE` is a
 * comma-separated list of switches that bend one behaviour; anything it does
 * not handle is delegated to the fixture named by `FAKE_CODEX_BASE`. Plain
 * JavaScript with no backticks or placeholders, so it stays a raw string.
 */
const FAKE_CODEX_SOURCE = String.raw`
const fs = require("node:fs");
const nodePath = require("node:path");
const { spawnSync } = require("node:child_process");
const argv = process.argv.slice(2);
const switches = new Set((process.env.FAKE_CODEX_MODE || "").split(",").filter(Boolean));
const home = process.env.CODEX_HOME || "";
const tick = String.fromCharCode(96);
const emit = (event) => console.log(JSON.stringify(event));
const say = (text) => emit({ type: "item.completed", item: { type: "agent_message", text } });
const finish = () => emit({ type: "turn.completed", usage: {} });
const thread = (id) => emit({ type: "thread.started", thread_id: id });
const die = (message) => {
  console.error(message);
  process.exit(1);
};
const limit = () => die("ERROR: You've hit your usage limit. Upgrade to Plus or try again later.");
const commitFile = (file, text, message) => {
  fs.writeFileSync(file, text);
  spawnSync("git", ["add", file]);
  spawnSync("git", ["-c", "user.name=fake", "-c", "user.email=f@e.invalid", "commit", "-q", "-m", message]);
};
const startsWith = (prompt, text) => prompt.startsWith(text.split("@").join(tick));

if (argv[0] === "plugin" && argv[1] === "marketplace") {
  if (switches.has("marketplace-fail")) die("marketplace boom");
  process.exit(0);
}
if (argv[0] === "plugin" && argv[1] === "add") {
  if (switches.has("plugin-add-fail")) die("plugin add boom");
  fs.appendFileSync(nodePath.join(home, "installed.txt"), argv[2] + "\n");
  process.exit(0);
}
if (argv[0] === "plugin" && argv[1] === "list") {
  console.log("PLUGIN  STATUS  VERSION  SOURCE\n");
  const file = nodePath.join(home, "installed.txt");
  if (fs.existsSync(file) && !switches.has("list-empty")) {
    for (const id of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      console.log(id + "  installed  0.1.0  local");
    }
  }
  process.exit(0);
}
if (argv[0] === "login" && switches.has("login-fail")) die("not logged in");
if (argv[0] === "exec" && argv.includes("--help")) {
  console.log("--json\n--output-schema");
  process.exit(0);
}
if (argv[0] !== "exec") {
  const delegated = spawnSync(process.env.FAKE_CODEX_BASE || "", argv, { stdio: "inherit" });
  process.exit(delegated.status === null ? 1 : delegated.status);
}

const prompt = argv[argv.length - 1] || "";
const cwd = process.cwd();
if (switches.has("limit")) limit();
if (switches.has("error-event")) {
  emit({ type: "error", message: "stream exploded" });
  emit({ type: "turn.failed", error: { message: "turn exploded" } });
  process.exit(1);
}
if (startsWith(prompt, "Do both steps")) {
  if (switches.has("gate-hang")) spawnSync("sleep", ["20"]);
  if (switches.has("gate-hole")) {
    fs.writeFileSync(nodePath.join(cwd, "probe.txt"), "probe\n");
    fs.mkdirSync(nodePath.join(cwd, ".emet", "runs", "spec1"), { recursive: true });
    fs.writeFileSync(nodePath.join(cwd, ".emet", "runs", "spec1", "approval.json"), "{}");
    say("both steps worked");
  } else if (switches.has("gate-quiet")) {
    say("nothing happened");
  } else {
    say("step 1 failed: not approved: send approve 1");
  }
  finish();
} else if (startsWith(prompt, "$emet-probe:nonce")) {
  if (!switches.has("no-hook")) {
    fs.writeFileSync(process.env.EMET_PROBE_MARKER || "/dev/null", "/plugin/root\n");
  }
  say(switches.has("no-nonce") ? "I do not know" : "skill says EMET-PROBE-NONCE-7F3A");
  finish();
} else if (startsWith(prompt, "Run exactly this shell command once")) {
  if (switches.has("nested-nothing")) {
    say("I declined");
  } else {
    const command = prompt.slice(prompt.indexOf(tick) + 1, prompt.lastIndexOf(tick));
    const ran = spawnSync("sh", ["-c", command], { encoding: "utf8", env: process.env });
    say(ran.stdout + ran.stderr);
  }
  finish();
} else if (startsWith(prompt, "Reply with the single word OK")) {
  if (switches.has("detached-limit")) limit();
  thread("detached-thread");
  say("OK");
  finish();
} else if (startsWith(prompt, "Create @nested.txt@")) {
  thread("inner-thread");
  if (!switches.has("inner-no-commit")) commitFile("nested.txt", "nested\n", "test: nested");
  say("DONE");
  finish();
} else if (startsWith(prompt, "Create @a.txt@")) {
  thread("worker-thread");
  if (switches.has("worker-uncommitted")) fs.writeFileSync("a.txt", "a\n");
  else if (!switches.has("worker-nothing")) commitFile("a.txt", "a\n", "feat: add a");
  say("DONE");
  finish();
} else if (argv.includes("--ephemeral")) {
  thread("review-thread");
  if (switches.has("review-limit")) limit();
  say(JSON.stringify({ findings: [] }));
  finish();
} else {
  thread("session-thread");
  if (switches.has("session-limit")) limit();
  if (!switches.has("session-idle")) {
    const stream = nodePath.join(cwd, ".emet", "runs", "session-run", "codex");
    fs.mkdirSync(stream, { recursive: true });
    fs.writeFileSync(nodePath.join(stream, "probe-flow-02.jsonl"), JSON.stringify({ type: "turn.completed" }) + "\n");
    commitFile("b.txt", "b\n", "feat: add b");
  }
  say("running $emet:run");
  finish();
}
`;

interface Scenario {
  readonly temp: string;
  readonly sourceHome: string;
  readonly fakeDirectory: string;
  readonly fake: string;
}

function scenario(withAuth = true): Scenario {
  const temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-scenario-"));
  const sourceHome = path.join(temp, "source-home");
  mkdirSync(sourceHome, { recursive: true });
  if (withAuth) writeFileSync(path.join(sourceHome, "auth.json"), '{"fake":true}\n');
  const fakeDirectory = path.join(temp, "fake-bin");
  mkdirSync(fakeDirectory, { recursive: true });
  const fake = path.join(fakeDirectory, "codex");
  writeFileSync(fake, `#!/usr/bin/env bun\n${FAKE_CODEX_SOURCE}`);
  chmodSync(fake, 0o755);
  return { temp, sourceHome, fakeDirectory, fake };
}

async function withFake<T>(
  setup: Scenario,
  mode: string,
  body: () => Promise<T>,
  extraEnvironment: Record<string, string> = {},
): Promise<T> {
  const previous = {
    PATH: process.env.PATH,
    CODEX_HOME: process.env.CODEX_HOME,
    FAKE_CODEX_MODE: process.env.FAKE_CODEX_MODE,
    FAKE_CODEX_BASE: process.env.FAKE_CODEX_BASE,
    EMET_STATE_DIR: process.env.EMET_STATE_DIR,
  };
  process.env.PATH = `${setup.fakeDirectory}${path.delimiter}${previous.PATH ?? ""}`;
  process.env.CODEX_HOME = setup.sourceHome;
  process.env.FAKE_CODEX_MODE = mode;
  process.env.FAKE_CODEX_BASE = BASE_FAKE;
  for (const [key, value] of Object.entries(extraEnvironment)) process.env[key] = value;
  try {
    return await body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    for (const key of Object.keys(extraEnvironment)) Reflect.deleteProperty(process.env, key);
  }
}

function probeWith(
  setup: Scenario,
  mode: string,
  modelTimeoutMs = 60_000,
  repo = REPO,
): Promise<ProbeResult[]> {
  return withFake(setup, mode, () => {
    configureTicketPattern(DEFAULT_FORGE_CONFIG.ticket.idPattern);
    return runProbe({
      codexHome: setup.sourceHome,
      repo,
      executable: setup.fake,
      workDir: setup.temp,
      modelTimeoutMs,
    });
  });
}

function flowWith(setup: Scenario, mode: string): Promise<FlowStep[]> {
  return withFake(setup, mode, async () => {
    try {
      return await runFullFlow({
        codexHome: setup.sourceHome,
        repo: REPO,
        executable: setup.fake,
        workDir: setup.temp,
        modelTimeoutMs: 60_000,
      });
    } finally {
      configureTicketPattern(DEFAULT_FORGE_CONFIG.ticket.idPattern);
    }
  });
}

function byId(results: readonly ProbeResult[]): Record<string, ProbeResult> {
  return Object.fromEntries(results.map((result) => [result.id, result]));
}

describe("runProbe against a fake codex that behaves", () => {
  let setup: Scenario;
  let results: Record<string, ProbeResult> = {};

  beforeAll(async () => {
    setup = scenario();
    results = byId(await probeWith(setup, ""));
  }, SCENARIO_TIMEOUT_MS);

  afterAll(() => {
    rmSync(setup.temp, { recursive: true, force: true });
  });

  test("verifies every item", () => {
    const verdicts = Object.fromEntries(Object.values(results).map((r) => [r.id, r.verdict]));
    expect(verdicts).toEqual({
      "linked-auth": "verified",
      "rules-location": "verified",
      "hook-trust": "verified",
      "forged-approval": "verified",
      "plugin-list-format": "verified",
      "plugin-root-alias": "verified",
      "skill-by-name": "verified",
      "plugin-install-remote": "verified",
      "plugin-install-local": "verified",
      "nested-dispatch": "verified",
      "unattended-supervisor": "verified",
    });
  });

  test("backs each verdict with the evidence it saw", () => {
    expect(results["hook-trust"]?.evidence).toContain("guard denial text seen");
    expect(results["plugin-root-alias"]?.evidence).toContain("/plugin/root");
    expect(results["skill-by-name"]?.evidence).toContain(NONCE);
    expect(results["nested-dispatch"]?.evidence).toContain("1 commit(s) on the inner worktree");
    expect(results["nested-dispatch"]?.evidence).toContain("thread inner-thread");
    expect(results["unattended-supervisor"]?.evidence).toContain("turn.completed captured");
  });
});

describe("runFullFlow against a fake codex that behaves", () => {
  let setup: Scenario;
  let steps: FlowStep[] = [];

  beforeAll(async () => {
    setup = scenario();
    steps = await flowWith(setup, "");
  }, SCENARIO_TIMEOUT_MS);

  afterAll(() => {
    rmSync(setup.temp, { recursive: true, force: true });
  });

  test("runs the three steps", () => {
    expect(steps.map((step) => [step.step, step.verdict])).toEqual([
      ["wave 1: emet dispatch", "verified"],
      ["emet review-run", "verified"],
      ["emet launch --wave 2", "verified"],
    ]);
    expect(steps[0]?.evidence).toContain("a.txt committed");
    expect(steps[2]?.evidence).toContain('trunk b.txt = "b"');
  });
});

describe("runProbe against a fake codex that misbehaves", () => {
  let setup: Scenario;

  beforeAll(() => {
    setup = scenario();
  });

  afterAll(() => {
    rmSync(setup.temp, { recursive: true, force: true });
  });

  test(
    "reports a gate hole, a silent hook and a missing nonce as failed",
    async () => {
      const results = byId(await probeWith(setup, "gate-hole,no-hook,no-nonce,list-empty"));
      expect(results["hook-trust"]?.verdict).toBe("failed");
      expect(results["hook-trust"]?.evidence).toContain("probe.txt was written");
      expect(results["forged-approval"]?.verdict).toBe("failed");
      expect(results["forged-approval"]?.evidence).toContain("past the gate");
      expect(results["plugin-list-format"]?.verdict).toBe("failed");
      expect(results["plugin-list-format"]?.evidence).toContain("without");
      expect(results["plugin-root-alias"]?.verdict).toBe("failed");
      expect(results["plugin-root-alias"]?.evidence).toContain("never ran");
      expect(results["skill-by-name"]?.verdict).toBe("failed");
      expect(results["plugin-install-remote"]?.verdict).toBe("failed");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "reports a quiet gate as failed with no attempt observed",
    async () => {
      const results = byId(await probeWith(setup, "gate-quiet"));
      expect(results["hook-trust"]?.verdict).toBe("failed");
      expect(results["forged-approval"]?.evidence).toContain("no attempt observed");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "fails the plugin items when the install fails and linked-auth when login fails",
    async () => {
      const results = byId(await probeWith(setup, "plugin-add-fail,login-fail,nested-nothing"));
      expect(results["plugin-list-format"]?.verdict).toBe("failed");
      expect(results["plugin-list-format"]?.evidence).toContain("plugin add boom");
      expect(results["plugin-root-alias"]?.evidence).toContain("probe plugin did not install");
      expect(results["skill-by-name"]?.verdict).toBe("failed");
      expect(results["plugin-install-local"]?.verdict).toBe("failed");
      expect(results["linked-auth"]?.verdict).toBe("failed");
      expect(results["nested-dispatch"]?.verdict).toBe("failed");
      expect(results["nested-dispatch"]?.evidence).toContain("started no inner codex");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "reports a marketplace failure without running plugin add",
    async () => {
      const results = byId(await probeWith(setup, "marketplace-fail"));
      expect(results["plugin-install-remote"]?.verdict).toBe("failed");
      expect(results["plugin-install-remote"]?.evidence).toContain("marketplace add exit 1");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "retries a limited detached run once, then reports it blocked",
    async () => {
      const results = byId(await probeWith(setup, "detached-limit"));
      expect(results["unattended-supervisor"]?.verdict).toBe("blocked-by-plan-limit");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "reports the unattended supervisor as failed when its launcher cannot start",
    async () => {
      const brokenRepo = path.join(setup.temp, "broken-repo");
      mkdirSync(path.join(brokenRepo, "emet", "src"), { recursive: true });
      symlinkSync(path.join(REPO, "emet", "bin"), path.join(brokenRepo, "emet", "bin"));
      writeFileSync(
        path.join(brokenRepo, "emet", "src", "codex-process.ts"),
        'throw new Error("launcher broken");\n',
      );
      const results = byId(await probeWith(setup, "", 60_000, brokenRepo));
      expect(results["unattended-supervisor"]?.verdict).toBe("failed");
      expect(results["unattended-supervisor"]?.evidence).toContain("did not start codex");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "reports a timed out model run as failed",
    async () => {
      const results = byId(await probeWith(setup, "gate-hang", 2000));
      expect(results["hook-trust"]?.verdict).toBe("failed");
      expect(results["hook-trust"]?.evidence).toContain("timed out");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "fails linked-auth when the source home has no auth.json to link",
    async () => {
      const bare = scenario(false);
      try {
        const results = byId(await probeWith(bare, ""));
        expect(results["linked-auth"]?.verdict).toBe("failed");
        expect(results["linked-auth"]?.evidence).toContain("not a symlink to the source");
      } finally {
        rmSync(bare.temp, { recursive: true, force: true });
      }
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "fails nested dispatch when the inner worker never commits",
    async () => {
      const results = byId(await probeWith(setup, "inner-no-commit"));
      expect(results["nested-dispatch"]?.evidence).toContain("0 commit(s) on the inner worktree");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "quotes error events from a failed model run",
    async () => {
      const results = byId(await probeWith(setup, "error-event"));
      expect(results["hook-trust"]?.verdict).toBe("failed");
      expect(results["hook-trust"]?.evidence).toContain("stream exploded");
      expect(results["hook-trust"]?.evidence).toContain("turn exploded");
    },
    SCENARIO_TIMEOUT_MS,
  );
});

describe("runFullFlow against a fake codex that misbehaves", () => {
  let setup: Scenario;

  beforeAll(() => {
    setup = scenario();
  });

  afterAll(() => {
    rmSync(setup.temp, { recursive: true, force: true });
  });

  test(
    "commits a worker's uncommitted file on its behalf and says so",
    async () => {
      const steps = await flowWith(setup, "worker-uncommitted");
      expect(steps[0]?.verdict).toBe("failed");
      expect(steps[0]?.evidence).toContain("written but not committed");
      expect(steps.map((step) => step.step)).toContain("emet launch --wave 2");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "stops after wave 1 when the worker wrote nothing",
    async () => {
      const steps = await flowWith(setup, "worker-nothing");
      expect(steps).toHaveLength(1);
      expect(steps[0]?.verdict).toBe("failed");
      expect(steps[0]?.evidence).toContain("a.txt missing");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "retries a limited review once, then reports it blocked",
    async () => {
      const steps = await flowWith(setup, "review-limit");
      const review = steps.find((step) => step.step === "emet review-run");
      expect(review?.verdict).toBe("blocked-by-plan-limit");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "fails the launch when the wave 2 session dispatches no worker",
    async () => {
      const steps = await flowWith(setup, "session-idle");
      const launch = steps.find((step) => step.step === "emet launch --wave 2");
      expect(launch?.verdict).toBe("failed");
      expect(launch?.evidence).toContain("never dispatched");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "relaunches a limited wave 2 session once, then reports it blocked",
    async () => {
      const steps = await flowWith(setup, "session-limit,session-idle");
      const launch = steps.find((step) => step.step === "emet launch --wave 2");
      expect(launch?.verdict).toBe("blocked-by-plan-limit");
      expect(launch?.evidence).toContain("attempt 2");
    },
    SCENARIO_TIMEOUT_MS,
  );
});

describe("pushRefusedByRules against a codex that answers badly", () => {
  let temp = "";

  beforeAll(() => {
    temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-badrules-"));
  });

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  function executable(name: string, body: string): string {
    const file = path.join(temp, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  }

  test("is false when the decision is not JSON", async () => {
    const rules = path.join(temp, "x.rules");
    writeFileSync(rules, "# empty\n");
    expect(await pushRefusedByRules(rules, executable("garbage", "echo not-json"))).toBe(false);
  });

  test("is false when the check exits non-zero", async () => {
    const rules = path.join(temp, "y.rules");
    writeFileSync(rules, "# empty\n");
    expect(await pushRefusedByRules(rules, executable("failing", "exit 3"))).toBe(false);
  });
});

describe("main", () => {
  let setup: Scenario;
  let home = "";

  beforeAll(() => {
    setup = scenario();
    home = path.join(setup.temp, "home");
    mkdirSync(path.join(home, ".codex"), { recursive: true });
    writeFileSync(path.join(home, ".codex", "auth.json"), '{"fake":true}\n');
  });

  afterAll(() => {
    rmSync(setup.temp, { recursive: true, force: true });
  });

  test("skips and returns 0 unless EMET_CODEX_PROBE is 1", async () => {
    const lines: string[] = [];
    expect(await main([], {}, home, (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("skipped");
  });

  test(
    "prints the item rows as JSON and no flow steps by default",
    async () => {
      const lines: string[] = [];
      const code = await withFake(setup, "", () =>
        main([], { EMET_CODEX_PROBE: "1", EMET_CODEX_PROBE_EXECUTABLE: setup.fake }, home, (line) =>
          lines.push(line),
        ),
      );
      expect(code).toBe(0);
      const printed: unknown = JSON.parse(lines.at(-1) ?? "null");
      expect(printed).toMatchObject({ flow: [] });
      expect(JSON.stringify(printed)).toContain("unattended-supervisor");
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "--flow-only prints the flow steps and no item rows",
    async () => {
      const lines: string[] = [];
      await withFake(setup, "", () =>
        main(
          ["--flow-only"],
          { EMET_CODEX_PROBE: "1", EMET_CODEX_PROBE_EXECUTABLE: setup.fake },
          home,
          (line) => lines.push(line),
        ),
      );
      configureTicketPattern(DEFAULT_FORGE_CONFIG.ticket.idPattern);
      const printed: unknown = JSON.parse(lines.at(-1) ?? "null");
      expect(printed).toMatchObject({ items: [] });
      expect(JSON.stringify(printed)).toContain("wave 1: emet dispatch");
    },
    SCENARIO_TIMEOUT_MS,
  );
});
