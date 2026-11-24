import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { embeddedTree } from "./assets";
import type { SelfDeps } from "./self-install";
import {
  type AutoChildPlan,
  OfflineError,
  processUpdateSeams,
  runSelfUpdate,
  runSelfUpdateWith,
  type UpdateSeams,
} from "./self-update";

const ASSET = "emet-test-x64";
const DAY_MS = 24 * 60 * 60 * 1000;

let root: string;
let home: string;
let releaseRoot: string;
let stateDirectory: string;
let journalDirectory: string;
let logs: string[];
let errors: string[];
let clock: Date;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "emet-self-update-"));
  home = path.join(root, "home");
  releaseRoot = path.join(root, "releases");
  stateDirectory = path.join(root, "state");
  journalDirectory = path.join(root, "journal");
  mkdirSync(home, { recursive: true });
  logs = [];
  errors = [];
  clock = new Date("2026-11-23T10:00:00.000Z");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function deps(): SelfDeps {
  return {
    home,
    executablePath: path.join(root, "running-emet"),
    compiled: true,
    version: "1.0.0",
    tree: embeddedTree,
    interactive: false,
    pathEnv: "",
    runSetup: () => Promise.resolve(0),
    now: () => clock,
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
}

function binaryScript(version: string, marker = ""): string {
  return [
    "#!/bin/sh",
    `if [ "$1" = --version ]; then echo ${version}; exit 0; fi`,
    marker,
    "exit 0",
    "",
  ].join("\n");
}

function writeExecutable(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  chmodSync(file, 0o755);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function versionsDir(): string {
  return path.join(home, ".local/share/emet/versions");
}

function shim(): string {
  return path.join(home, ".local/bin/emet");
}

function pendingPath(): string {
  return path.join(home, ".local/share/emet/pending-update.json");
}

function binaryOf(version: string): string {
  return path.join(versionsDir(), version, "emet");
}

/** Publishes a release directory with the asset and its `SHA256SUMS`. */
function publish(
  directory: string,
  version: string,
  options: { sums?: string; content?: string } = {},
): void {
  const content = options.content ?? binaryScript(version);
  const target = path.join(releaseRoot, directory);
  writeExecutable(path.join(target, ASSET), content);
  writeFileSync(
    path.join(target, "SHA256SUMS"),
    options.sums ?? `${"0".repeat(64)}  other-asset\n${sha256(content)}  ${ASSET}\n`,
  );
}

/** Installs `version` as the current standalone install, plus older version directories. */
function installCurrent(version: string, older: readonly string[] = []): void {
  for (const old of older) writeExecutable(binaryOf(old), binaryScript(old));
  writeExecutable(binaryOf(version), binaryScript(version));
  mkdirSync(path.dirname(shim()), { recursive: true });
  symlinkSync(binaryOf(version), shim());
  writeFileSync(
    path.join(home, ".local/share/emet/install.json"),
    JSON.stringify({
      version,
      installedAt: clock.toISOString(),
      hosts: ["claude"],
      binary: binaryOf(version),
      mode: "standalone",
    }),
  );
}

interface Recorder {
  fetches: string[];
  hostRuns: string[];
  detached: AutoChildPlan[];
  slotHeld: boolean;
}

function seams(recorder: Recorder, overrides: Partial<UpdateSeams> = {}): UpdateSeams {
  const real = processUpdateSeams(deps());
  return {
    env: { EMET_RELEASE_BASE_URL: pathToFileURL(releaseRoot).href },
    stateDirectory,
    journal: { directory: journalDirectory },
    asset: ASSET,
    fetchBytes: (url) => {
      recorder.fetches.push(url);
      return real.fetchBytes(url);
    },
    slotHeld: () => Promise.resolve(recorder.slotHeld),
    verifyAttestation: () => Promise.resolve("skipped"),
    readVersion: (binary) => real.readVersion(binary),
    runHostAdapters: (binary) => {
      recorder.hostRuns.push(binary);
      return Promise.resolve({ code: 0, output: "" });
    },
    detach: (plan) => {
      recorder.detached.push(plan);
    },
    ...overrides,
  };
}

function newRecorder(): Recorder {
  return { fetches: [], hostRuns: [], detached: [], slotHeld: false };
}

function journal(): Record<string, unknown>[] {
  const file = path.join(journalDirectory, "events.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line))
    .filter(
      (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
    );
}

function journalData(): unknown[] {
  return journal().map((event) => event.data);
}

function failingHostRun(): Promise<{ code: number; output: string }> {
  return Promise.resolve({ code: 4, output: "boom" });
}

function throwingHostRun(): Promise<{ code: number; output: string }> {
  return Promise.reject(new Error("spawn exploded"));
}

function offlineFetch(): Promise<Uint8Array> {
  return Promise.reject(new OfflineError("no route"));
}

function childArgs(plan: AutoChildPlan): string[] {
  const parts = [plan.applyPending ? "pending" : "", plan.check ? "check" : ""];
  return ["--auto", "--child", parts.filter((part) => part !== "").join(",")];
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

async function waitForFile(file: string, attempts = 100): Promise<void> {
  if (existsSync(file) || attempts === 0) return;
  await Bun.sleep(20);
  await waitForFile(file, attempts - 1);
}

describe("emet self update with a pinned version", () => {
  test("a free slot swaps the symlink, keeps the prior version and prunes older ones", async () => {
    installCurrent("1.0.0", ["0.9.0"]);
    publish("v2.0.0", "2.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["2.0.0"], deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("2.0.0"));
    expect(existsSync(binaryOf("1.0.0"))).toBe(true);
    expect(existsSync(binaryOf("0.9.0"))).toBe(false);
    expect(record.hostRuns).toEqual([binaryOf("2.0.0")]);
    expect(logs).toContain("emet updated from 1.0.0 to 2.0.0");
    expect(journalData()).toEqual([{ outcome: "updated", from: "1.0.0", to: "2.0.0" }]);
    expect(journal()[0]?.kind).toBe("self.update");
    expect(journal()[0]?.origin).toBe("human");
  });

  test("a held slot leaves the symlink and records the update as pending", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    const record = newRecorder();
    record.slotHeld = true;
    expect(await runSelfUpdateWith(["2.0.0"], deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("1.0.0"));
    expect(record.hostRuns).toEqual([]);
    expect(JSON.parse(readFileSync(pendingPath(), "utf8"))).toEqual({
      version: "2.0.0",
      binary: binaryOf("2.0.0"),
      stagedAt: clock.toISOString(),
    });
    expect(logs.join("\n")).toContain("applied at the next session start");
  });

  test("the version already installed makes no network call", async () => {
    installCurrent("1.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["1.0.0"], deps(), seams(record))).toBe(0);
    expect(record.fetches).toEqual([]);
    expect(logs).toEqual(["emet 1.0.0 is current; nothing to update"]);
  });

  test("falls back to the install state when the symlink is not one", async () => {
    installCurrent("1.0.0");
    rmSync(shim());
    writeFileSync(shim(), "not a link");
    expect(await runSelfUpdateWith(["1.0.0"], deps(), seams(newRecorder()))).toBe(0);
    rmSync(shim());
    expect(await runSelfUpdateWith(["1.0.0"], deps(), seams(newRecorder()))).toBe(0);
    expect(logs).toEqual([
      "emet 1.0.0 is current; nothing to update",
      "emet 1.0.0 is current; nothing to update",
    ]);
  });
});

describe("emet self update latest", () => {
  test("reads the version from the verified binary and swaps to it", async () => {
    installCurrent("1.0.0");
    publish("latest", "3.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["latest"], deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("3.0.0"));
    expect(record.fetches.map((url) => path.basename(url))).toEqual(["SHA256SUMS", ASSET]);
  });

  test("the current binary listed in SHA256SUMS downloads nothing else", async () => {
    installCurrent("1.0.0");
    publish("latest", "1.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith([], deps(), seams(record))).toBe(0);
    expect(record.fetches.map((url) => path.basename(url))).toEqual(["SHA256SUMS"]);
    expect(logs).toEqual(["emet 1.0.0 is current; nothing to update"]);
  });

  test("a new binary reporting the current version changes nothing", async () => {
    installCurrent("1.0.0");
    publish("latest", "1.0.0", { content: `${binaryScript("1.0.0")}# rebuilt\n` });
    expect(await runSelfUpdateWith([], deps(), seams(newRecorder()))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("1.0.0"));
  });

  test("uses the GitHub release URLs without an override", async () => {
    installCurrent("1.0.0");
    const record = newRecorder();
    const fetchBytes = (url: string): Promise<Uint8Array> => {
      record.fetches.push(url);
      return Promise.reject(new OfflineError("offline"));
    };
    await runSelfUpdateWith([], deps(), seams(record, { env: {}, fetchBytes }));
    await runSelfUpdateWith(["2.0.0"], deps(), seams(record, { env: {}, fetchBytes }));
    expect(record.fetches).toEqual([
      "https://github.com/andryorelabs/emet/releases/latest/download/SHA256SUMS",
      "https://github.com/andryorelabs/emet/releases/download/v2.0.0/SHA256SUMS",
    ]);
  });
});

async function expectFailure(
  record: Recorder,
  overrides: Partial<UpdateSeams>,
  reason: string,
  argv: readonly string[] = ["2.0.0"],
): Promise<void> {
  expect(await runSelfUpdateWith(argv, deps(), seams(record, overrides))).toBe(1);
  expect(readlinkSync(shim())).toBe(binaryOf("1.0.0"));
  expect(existsSync(binaryOf("2.0.0"))).toBe(false);
  expect(journalData()).toEqual([{ outcome: "failed", reason, requested: argv[0] ?? "latest" }]);
  expect(errors.join("\n")).toContain("the current version is unchanged");
}

describe("emet self update failures", () => {
  test("a wrong checksum leaves the current version and writes a journal entry", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0", { sums: `${"f".repeat(64)}  ${ASSET}\n` });
    await expectFailure(newRecorder(), {}, `checksum mismatch for ${ASSET}`);
  });

  test("a missing SHA256SUMS line leaves the current version and writes a journal entry", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0", { sums: `${"0".repeat(64)}  *other-asset\n\n` });
    await expectFailure(newRecorder(), {}, `no checksum listed for ${ASSET}`);
  });

  test("a missing SHA256SUMS file fails", async () => {
    installCurrent("1.0.0");
    const url = `${pathToFileURL(releaseRoot).href}/v2.0.0/SHA256SUMS`;
    await expectFailure(newRecorder(), {}, `${url} not found`);
  });

  test("a failed attestation fails", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    await expectFailure(
      newRecorder(),
      { verifyAttestation: () => Promise.resolve("failed") },
      `the build provenance attestation of ${ASSET} did not verify`,
    );
  });

  test("a binary that reports no version fails", async () => {
    installCurrent("1.0.0");
    publish("latest", "not-a-version");
    await expectFailure(newRecorder(), {}, `the downloaded ${ASSET} did not report a version`, [
      "latest",
    ]);
  });

  test("an unsupported platform fails", async () => {
    installCurrent("1.0.0");
    await expectFailure(
      newRecorder(),
      { asset: null },
      "no release asset exists for this platform",
    );
  });

  test("a failing host adapter run restores the previous symlink", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    const record = newRecorder();
    expect(
      await runSelfUpdateWith(
        ["2.0.0"],
        deps(),
        seams(record, { runHostAdapters: failingHostRun }),
      ),
    ).toBe(1);
    expect(readlinkSync(shim())).toBe(binaryOf("1.0.0"));
    expect(journalData()).toEqual([
      {
        outcome: "failed",
        reason: "emet 2.0.0 self install exited 4; kept 1.0.0",
        requested: "2.0.0",
      },
    ]);
  });

  test("an unexpected error is journaled and exits 3", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    expect(
      await runSelfUpdateWith(
        ["2.0.0"],
        deps(),
        seams(newRecorder(), { runHostAdapters: throwingHostRun }),
      ),
    ).toBe(3);
    expect(journalData()).toEqual([{ outcome: "failed", reason: "spawn exploded" }]);
    expect(errors).toEqual(["emet self update: spawn exploded"]);
  });

  test("offline is an error when run by hand", async () => {
    installCurrent("1.0.0");
    expect(
      await runSelfUpdateWith([], deps(), seams(newRecorder(), { fetchBytes: offlineFetch })),
    ).toBe(1);
    expect(errors).toEqual(["emet self update: no route; the current version is unchanged"]);
  });
});

describe("emet self update --auto", () => {
  test("detaches once a day and records the check time", async () => {
    installCurrent("1.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toEqual([{ applyPending: false, check: true }]);
    expect(JSON.parse(readFileSync(path.join(stateDirectory, "self-update.json"), "utf8"))).toEqual(
      { lastCheckAt: clock.toISOString() },
    );
    clock = new Date(clock.getTime() + DAY_MS - 1);
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toHaveLength(1);
    expect(record.fetches).toEqual([]);
    clock = new Date(clock.getTime() + 1);
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toHaveLength(2);
  });

  test("a second --auto within a day makes no network call", async () => {
    installCurrent("1.0.0");
    publish("latest", "2.0.0");
    const record = newRecorder();
    const inline = (plan: AutoChildPlan): void => {
      void runSelfUpdateWith(childArgs(plan), deps(), seams(record));
    };
    await runSelfUpdateWith(["--auto"], deps(), seams(record, { detach: inline }));
    await Bun.sleep(50);
    expect(record.fetches).toHaveLength(2);
    expect(readlinkSync(shim())).toBe(binaryOf("2.0.0"));
    await runSelfUpdateWith(["--auto"], deps(), seams(record, { detach: inline }));
    await Bun.sleep(50);
    expect(record.fetches).toHaveLength(2);
    expect(logs).toEqual([]);
    expect(journal()[0]?.origin).toBe("auto");
  });

  test("EMET_AUTO_UPDATE=0 makes no network call", async () => {
    installCurrent("1.0.0");
    const record = newRecorder();
    const env = { EMET_AUTO_UPDATE: "0" };
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record, { env }))).toBe(0);
    expect(record.detached).toEqual([]);
    expect(record.fetches).toEqual([]);
    expect(existsSync(path.join(stateDirectory, "self-update.json"))).toBe(false);
  });

  test("--auto off disables it and --auto on re-enables it", async () => {
    installCurrent("1.0.0");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["--auto", "off"], deps(), seams(record))).toBe(0);
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toEqual([]);
    expect(await runSelfUpdateWith(["--auto", "on"], deps(), seams(record))).toBe(0);
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toHaveLength(1);
    expect(logs).toEqual(["emet auto-update is off", "emet auto-update is on"]);
  });

  test("ignores a corrupt throttle file", async () => {
    installCurrent("1.0.0");
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(path.join(stateDirectory, "self-update.json"), "[1]");
    const record = newRecorder();
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    writeFileSync(path.join(stateDirectory, "self-update.json"), "{not json");
    clock = new Date(clock.getTime() + DAY_MS);
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached).toHaveLength(2);
  });

  test("a pending update detaches within the throttle window and applies with no network call", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    const record = newRecorder();
    record.slotHeld = true;
    await runSelfUpdateWith(["2.0.0"], deps(), seams(record));
    await runSelfUpdateWith(["--auto"], deps(), seams(record));
    record.fetches.length = 0;
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(record.detached.at(-1)).toEqual({ applyPending: true, check: false });
    const child = childArgs({ applyPending: true, check: false });
    expect(await runSelfUpdateWith(child, deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("1.0.0"));
    record.slotHeld = false;
    expect(await runSelfUpdateWith(child, deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("2.0.0"));
    expect(existsSync(pendingPath())).toBe(false);
    expect(record.fetches).toEqual([]);
  });

  test("a child applies the pending update and then checks for a newer one", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    publish("latest", "3.0.0");
    const record = newRecorder();
    record.slotHeld = true;
    await runSelfUpdateWith(["2.0.0"], deps(), seams(record));
    record.slotHeld = false;
    const child = childArgs({ applyPending: true, check: true });
    expect(await runSelfUpdateWith(child, deps(), seams(record))).toBe(0);
    expect(readlinkSync(shim())).toBe(binaryOf("3.0.0"));
    expect(existsSync(binaryOf("2.0.0"))).toBe(true);
    expect(existsSync(binaryOf("1.0.0"))).toBe(false);
  });

  test("a child that finds the slot still held stops after re-recording the pending update", async () => {
    installCurrent("1.0.0");
    publish("v2.0.0", "2.0.0");
    const record = newRecorder();
    record.slotHeld = true;
    await runSelfUpdateWith(["2.0.0"], deps(), seams(record));
    record.fetches.length = 0;
    const child = childArgs({ applyPending: true, check: true });
    expect(await runSelfUpdateWith(child, deps(), seams(record))).toBe(0);
    expect(record.fetches).toEqual([]);
    expect(existsSync(pendingPath())).toBe(true);
  });

  test("a stale or unreadable pending record is dropped", async () => {
    installCurrent("1.0.0");
    const child = childArgs({ applyPending: true, check: false });
    writeFileSync(
      pendingPath(),
      JSON.stringify({ version: "1.0.0", binary: binaryOf("1.0.0"), stagedAt: "x" }),
    );
    expect(await runSelfUpdateWith(child, deps(), seams(newRecorder()))).toBe(0);
    expect(existsSync(pendingPath())).toBe(false);
    writeFileSync(pendingPath(), JSON.stringify({ version: 2 }));
    expect(await runSelfUpdateWith(child, deps(), seams(newRecorder()))).toBe(0);
    expect(existsSync(pendingPath())).toBe(false);
    writeFileSync(pendingPath(), "[]");
    expect(await runSelfUpdateWith(child, deps(), seams(newRecorder()))).toBe(0);
    expect(existsSync(pendingPath())).toBe(false);
  });

  test("a child is silent and journals nothing when offline", async () => {
    installCurrent("1.0.0");
    const child = childArgs({ applyPending: false, check: true });
    expect(
      await runSelfUpdateWith(child, deps(), seams(newRecorder(), { fetchBytes: offlineFetch })),
    ).toBe(0);
    expect(errors).toEqual([]);
    expect(journal()).toEqual([]);
  });

  test("a child journals a checksum failure without printing it", async () => {
    installCurrent("1.0.0");
    publish("latest", "2.0.0", { sums: `${"f".repeat(64)}  ${ASSET}\n` });
    const child = childArgs({ applyPending: false, check: true });
    expect(await runSelfUpdateWith(child, deps(), seams(newRecorder()))).toBe(1);
    expect(errors).toEqual([]);
    expect(journalData()).toEqual([
      { outcome: "failed", reason: `checksum mismatch for ${ASSET}`, requested: "latest" },
    ]);
  });
});

describe("emet self update outside a standalone install", () => {
  test("a plugin install exits 0 and does nothing", async () => {
    const record = newRecorder();
    expect(await runSelfUpdateWith(["--auto"], deps(), seams(record))).toBe(0);
    expect(await runSelfUpdateWith([], deps(), seams(record))).toBe(0);
    expect(record).toEqual({ fetches: [], hostRuns: [], detached: [], slotHeld: false });
    expect(logs).toEqual([
      "emet self update: not a standalone install (plugin or source); nothing to update",
    ]);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
    expect(existsSync(stateDirectory)).toBe(false);
  });

  test("runSelfUpdate with the process seams leaves a plugin install alone", async () => {
    expect(await runSelfUpdate(["latest"], deps())).toBe(0);
    expect(existsSync(path.join(home, ".local"))).toBe(false);
  });
});

describe("emet self update arguments", () => {
  test.each([
    [["--bogus"], "unknown flag --bogus"],
    [["1.0.0", "2.0.0"], "expected at most one version, got 1.0.0 2.0.0"],
    [["v1"], '"v1" is not a version; pass latest or X.Y.Z'],
    [["--auto", "maybe"], "--auto takes off or on, not maybe"],
    [["--auto", "off", "on"], "--auto takes at most one of off or on"],
    [["--child", "check"], "--child needs --auto"],
    [["--auto", "--child", "bogus"], "--child takes pending, check or both"],
    [["--auto", "--child"], "--child takes pending, check or both"],
  ])("%p is a usage error", async (argv, message) => {
    expect(await runSelfUpdateWith(argv, deps(), seams(newRecorder()))).toBe(2);
    expect(errors[0]).toBe(`emet self update: ${message}`);
    expect(errors[1]).toContain("usage: emet self update");
  });
});

describe("processUpdateSeams", () => {
  const savedPath = Bun.env.PATH;

  afterEach(() => {
    Bun.env.PATH = savedPath;
  });

  test("names this platform's asset and reads the slot pool", async () => {
    const real = processUpdateSeams(deps());
    expect(real.asset).toBe(`emet-${process.platform}-${process.arch}`);
    expect(await real.slotHeld()).toBe(false);
  });

  test("a slot whose run is dead is not held", async () => {
    const savedState = Bun.env.EMET_STATE_DIR;
    Bun.env.EMET_STATE_DIR = stateDirectory;
    try {
      const slot = path.join(stateDirectory, "slots", "0");
      mkdirSync(slot, { recursive: true });
      writeFileSync(
        path.join(slot, "holder.json"),
        JSON.stringify({
          pid: 999_999_999,
          worktree: root,
          acquiredAt: 0,
          runId: "gone",
          anchorPid: 999_999_999,
          ticket: "CLA-0",
          sessionSlug: "no-such-session",
          repoRoot: root,
        }),
      );
      expect(await processUpdateSeams(deps()).slotHeld()).toBe(false);
    } finally {
      Bun.env.EMET_STATE_DIR = savedState;
    }
  });

  test("fetches over HTTP and tells a missing asset from an unreachable host", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) =>
        new URL(request.url).pathname === "/ok"
          ? new Response("payload")
          : new Response("missing", { status: 404 }),
    });
    try {
      const real = processUpdateSeams(deps());
      const base = `http://127.0.0.1:${server.port}`;
      expect(new TextDecoder().decode(await real.fetchBytes(`${base}/ok`))).toBe("payload");
      const missing = await rejectionOf(real.fetchBytes(`${base}/gone`));
      expect(String(missing)).toContain("returned HTTP 404");
    } finally {
      await server.stop(true);
    }
    const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    const closedPort = closed.port;
    await closed.stop(true);
    const unreachable = await rejectionOf(
      processUpdateSeams(deps()).fetchBytes(`http://127.0.0.1:${closedPort}/x`),
    );
    expect(unreachable).toBeInstanceOf(OfflineError);
  });

  test("verifies the attestation only with a signed-in gh", async () => {
    const binDirectory = path.join(root, "fake-bin");
    const file = path.join(root, "artifact");
    writeFileSync(file, "x");
    const withGh = async (script: string): Promise<string> => {
      writeExecutable(path.join(binDirectory, "gh"), `#!/bin/sh\n${script}\n`);
      Bun.env.PATH = `${binDirectory}${path.delimiter}${savedPath ?? ""}`;
      return processUpdateSeams(deps()).verifyAttestation(file);
    };
    expect(await withGh("exit 0")).toBe("verified");
    expect(await withGh('[ "$1" = auth ] && exit 0\nexit 1')).toBe("failed");
    expect(await withGh("exit 1")).toBe("skipped");
    Bun.env.PATH = path.join(root, "empty-bin");
    expect(await processUpdateSeams(deps()).verifyAttestation(file)).toBe("skipped");
  });

  test("reads a binary's version and runs its self install", async () => {
    const marker = path.join(root, "installed");
    const good = path.join(root, "good-emet");
    writeExecutable(
      good,
      binaryScript("4.5.6", `echo "$@ $HOME" > ${marker}; echo done; echo warn >&2`),
    );
    const bad = path.join(root, "bad-emet");
    writeExecutable(bad, "#!/bin/sh\nexit 7\n");
    const real = processUpdateSeams(deps());
    expect(await real.readVersion(good)).toBe("4.5.6");
    expect(await real.readVersion(bad)).toBeNull();
    expect(await real.runHostAdapters(good, home)).toEqual({ code: 0, output: "done\nwarn\n" });
    expect(readFileSync(marker, "utf8")).toBe(`self install --force ${home}\n`);
    expect((await real.runHostAdapters(bad, home)).code).toBe(7);
    const missing = await real.runHostAdapters(path.join(root, "absent"), home);
    expect(missing.code).toBe(1);
    expect(missing.output).toContain("ENOENT");
  });

  test("a child that cannot start is ignored", async () => {
    const real = processUpdateSeams({ ...deps(), executablePath: path.join(root, "absent") });
    real.detach({ applyPending: true, check: false });
    await Bun.sleep(100);
    expect(existsSync(path.join(root, "absent"))).toBe(false);
  });

  test("detaches a child carrying its plan", async () => {
    const marker = path.join(root, "detached");
    const executable = path.join(root, "detach-emet");
    writeExecutable(
      executable,
      `#!/bin/sh\necho "$*" > ${marker}.tmp && mv ${marker}.tmp ${marker}\n`,
    );
    const real = processUpdateSeams({ ...deps(), executablePath: executable });
    real.detach({ applyPending: false, check: true });
    await waitForFile(marker);
    expect(readFileSync(marker, "utf8")).toBe("self update --auto --child check\n");
  });
});
