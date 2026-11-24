import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readEnv, snapshotEnv, type Env } from "./env";
import { exitCodes } from "./exit-codes";
import { appendEvent, type JournalDeps } from "./journal";
import { stateDir } from "./names";
import { readInstallState, type SelfDeps } from "./self-install";
import { listOccupiedSlots } from "./slots";

/** What a detached `--auto` child does: apply a pending update, check for a new release, or both. */
export interface AutoChildPlan {
  applyPending: boolean;
  check: boolean;
}

/** Everything the updater reads from the network, the slot pool and other processes; injected by tests. */
export interface UpdateSeams {
  env: Env;
  /** The emet state directory, which holds the auto-update throttle file. */
  stateDirectory: string;
  journal?: JournalDeps;
  /** This platform's release asset name, or null when no release asset exists for it. */
  asset: string | null;
  /** Resolves to the bytes at `url`; rejects with `OfflineError` when the host is unreachable. */
  fetchBytes(url: string): Promise<Uint8Array>;
  /** True when any worker slot of the host-wide pool is held by a live or idle run. */
  slotHeld(): Promise<boolean>;
  verifyAttestation(file: string): Promise<"verified" | "skipped" | "failed">;
  /** The version a verified binary reports with `--version`, or null. */
  readVersion(binary: string): Promise<string | null>;
  /** Runs `<binary> self install --force` so the new version rewrites the host files. */
  runHostAdapters(binary: string, home: string): Promise<{ code: number; output: string }>;
  /** Starts the `--auto` work in a detached child, as `self update --auto --child <plan>`. */
  detach(plan: AutoChildPlan): void;
}

/** A failure to reach the release host, which `--auto` treats as offline and keeps silent. */
export class OfflineError extends Error {}

/** A failed download, checksum or attestation, recorded in the journal. */
class UpdateFailure extends Error {}

interface PendingUpdate {
  version: string;
  binary: string;
  stagedAt: string;
}

interface AutoState {
  auto?: "on" | "off";
  lastCheckAt?: string;
}

interface UpdateLayout {
  versionsDir: string;
  shim: string;
  pendingPath: string;
}

interface StagedRelease {
  version: string;
  binary: string;
}

interface UpdateArgs {
  version?: string;
  auto: boolean;
  autoSetting?: "on" | "off";
  childPlan?: AutoChildPlan;
}

const RELEASE_REPOSITORY = "andryorelabs/emet";
const DEFAULT_RELEASE_BASE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases`;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const CHILD_FLAG = "--child";
const CHILD_PLAN_PATTERN = /^(?:pending|check)(?:,(?:pending|check))*$/;
const UPDATE_USAGE = "usage: emet self update [latest|X.Y.Z] | emet self update --auto [off|on]";

function layoutFor(home: string): UpdateLayout {
  const dataDir = path.join(home, ".local", "share", "emet");
  return {
    versionsDir: path.join(dataDir, "versions"),
    shim: path.join(home, ".local", "bin", "emet"),
    pendingPath: path.join(dataDir, "pending-update.json"),
  };
}

function autoStatePath(stateDirectory: string): string {
  return path.join(stateDirectory, "self-update.json");
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAutoState(stateDirectory: string): AutoState {
  const parsed = readJson(autoStatePath(stateDirectory));
  if (!isRecord(parsed)) return {};
  const state: AutoState = {};
  if (parsed.auto === "on" || parsed.auto === "off") state.auto = parsed.auto;
  if (typeof parsed.lastCheckAt === "string") state.lastCheckAt = parsed.lastCheckAt;
  return state;
}

function writeAutoState(stateDirectory: string, state: AutoState): void {
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(autoStatePath(stateDirectory), `${JSON.stringify(state, null, 2)}\n`);
}

function readPending(layout: UpdateLayout): PendingUpdate | undefined {
  const parsed = readJson(layout.pendingPath);
  if (!isRecord(parsed)) return undefined;
  const { version, binary, stagedAt } = parsed;
  if (typeof version !== "string" || typeof binary !== "string" || typeof stagedAt !== "string") {
    return undefined;
  }
  return existsSync(binary) ? { version, binary, stagedAt } : undefined;
}

function parseChildPlan(value: string): AutoChildPlan {
  const parts = value.split(",");
  return { applyPending: parts.includes("pending"), check: parts.includes("check") };
}

function renderChildPlan(plan: AutoChildPlan): string {
  return [plan.applyPending ? "pending" : "", plan.check ? "check" : ""]
    .filter((part) => part !== "")
    .join(",");
}

/** Parses `emet self update` arguments, or returns the usage error to print. */
function parseUpdateArgs(argv: readonly string[]): UpdateArgs | string {
  const args: UpdateArgs = { auto: false };
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--auto") args.auto = true;
    else if (token === CHILD_FLAG) {
      const value = argv[index + 1] ?? "";
      if (!CHILD_PLAN_PATTERN.test(value)) return `${CHILD_FLAG} takes pending, check or both`;
      args.childPlan = parseChildPlan(value);
      index += 1;
    } else if (token.startsWith("-")) return `unknown flag ${token}`;
    else positionals.push(token);
  }
  if (args.childPlan !== undefined && !args.auto) return `${CHILD_FLAG} needs --auto`;
  if (args.auto) {
    if (positionals.length > 1) return `--auto takes at most one of off or on`;
    const [setting] = positionals;
    if (setting === undefined) return args;
    if (setting !== "off" && setting !== "on") return `--auto takes off or on, not ${setting}`;
    args.autoSetting = setting;
    return args;
  }
  if (positionals.length > 1) return `expected at most one version, got ${positionals.join(" ")}`;
  const [version] = positionals;
  if (version === undefined || version === "latest") return args;
  if (!VERSION_PATTERN.test(version)) return `"${version}" is not a version; pass latest or X.Y.Z`;
  args.version = version;
  return args;
}

function currentBinary(layout: UpdateLayout, fallback: string): string {
  try {
    if (lstatSync(layout.shim).isSymbolicLink()) {
      return path.resolve(path.dirname(layout.shim), readlinkSync(layout.shim));
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function versionOfBinary(layout: UpdateLayout, binary: string, fallback: string): string {
  const relative = path.relative(layout.versionsDir, binary);
  const [first] = relative.split(path.sep);
  return relative.startsWith("..") || first === undefined || first === "" ? fallback : first;
}

function releaseUrl(env: Env, version: string | undefined): string {
  const override = readEnv("EMET_RELEASE_BASE_URL", env);
  if (override !== undefined) {
    return version === undefined ? `${override}/latest` : `${override}/v${version}`;
  }
  return version === undefined
    ? `${DEFAULT_RELEASE_BASE_URL}/latest/download`
    : `${DEFAULT_RELEASE_BASE_URL}/download/v${version}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The checksum `SHA256SUMS` lists for `asset`, as `sha256sum` writes it (`<hex>  [*]<name>`). */
function expectedChecksum(sums: string, asset: string): string | undefined {
  for (const line of sums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (hash !== undefined && name?.replace(/^\*/, "") === asset) return hash.toLowerCase();
  }
  return undefined;
}

function linkShim(binary: string, shim: string): void {
  mkdirSync(path.dirname(shim), { recursive: true });
  const temporary = `${shim}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  symlinkSync(binary, temporary);
  renameSync(temporary, shim);
}

/**
 * Downloads `SHA256SUMS` and the platform binary of `version` (latest when undefined), verifies the
 * checksum and the attestation, and moves the binary to `versions/<v>/emet`. Resolves to undefined
 * when that release is the one already installed.
 */
async function stageRelease(
  version: string | undefined,
  current: { version: string; binary: string },
  layout: UpdateLayout,
  seams: UpdateSeams,
): Promise<StagedRelease | undefined> {
  if (version === current.version) return undefined;
  const { asset } = seams;
  if (asset === null) throw new UpdateFailure("no release asset exists for this platform");
  const url = releaseUrl(seams.env, version);
  const sums = new TextDecoder().decode(await seams.fetchBytes(`${url}/SHA256SUMS`));
  const expected = expectedChecksum(sums, asset);
  if (expected === undefined) throw new UpdateFailure(`no checksum listed for ${asset}`);
  if (version === undefined && existsSync(current.binary)) {
    if (sha256(readFileSync(current.binary)) === expected) return undefined;
  }
  const bytes = await seams.fetchBytes(`${url}/${asset}`);
  if (sha256(bytes) !== expected) throw new UpdateFailure(`checksum mismatch for ${asset}`);
  const staging = path.join(layout.versionsDir, `.staging-${randomUUID()}`);
  try {
    mkdirSync(staging, { recursive: true });
    const stagedBinary = path.join(staging, "emet");
    writeFileSync(stagedBinary, bytes);
    chmodSync(stagedBinary, 0o755);
    if ((await seams.verifyAttestation(stagedBinary)) === "failed") {
      throw new UpdateFailure(`the build provenance attestation of ${asset} did not verify`);
    }
    const resolved = version ?? (await seams.readVersion(stagedBinary));
    if (resolved === null || !VERSION_PATTERN.test(resolved)) {
      throw new UpdateFailure(`the downloaded ${asset} did not report a version`);
    }
    if (resolved === current.version) return undefined;
    const target = path.join(layout.versionsDir, resolved, "emet");
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(stagedBinary, target);
    return { version: resolved, binary: target };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Removes every version directory but `keep`. */
function pruneVersions(layout: UpdateLayout, keep: ReadonlySet<string>): void {
  for (const name of readdirSync(layout.versionsDir)) {
    if (name.startsWith(".") || keep.has(name)) continue;
    rmSync(path.join(layout.versionsDir, name), { recursive: true, force: true });
  }
}

interface UpdateRun {
  deps: SelfDeps;
  seams: UpdateSeams;
  layout: UpdateLayout;
  auto: boolean;
}

function journalUpdate(run: UpdateRun, data: Record<string, unknown>): void {
  appendEvent(
    { kind: "self.update", repo: "", origin: run.auto ? "auto" : "human", data },
    run.seams.journal,
  );
}

function say(run: UpdateRun, line: string): void {
  if (!run.auto) run.deps.log(line);
}

/**
 * Points the symlink at `staged` and re-runs the host adapters from it, or records the update as
 * pending when a worker slot is held. A failing adapter run restores the previous symlink.
 */
async function applyStaged(
  run: UpdateRun,
  staged: StagedRelease,
  current: { version: string; binary: string },
): Promise<number> {
  const { layout, seams } = run;
  if (await seams.slotHeld()) {
    const pending: PendingUpdate = {
      ...staged,
      stagedAt: run.deps.now().toISOString(),
    };
    writeFileSync(layout.pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
    say(
      run,
      `emet ${staged.version} is staged; a worker slot is held, so it is applied at the next session start`,
    );
    return exitCodes.success;
  }
  linkShim(staged.binary, layout.shim);
  const result = await seams.runHostAdapters(staged.binary, run.deps.home);
  if (result.code !== 0) {
    linkShim(current.binary, layout.shim);
    throw new UpdateFailure(
      `emet ${staged.version} self install exited ${result.code}; kept ${current.version}`,
    );
  }
  rmSync(layout.pendingPath, { force: true });
  pruneVersions(layout, new Set([staged.version, current.version]));
  journalUpdate(run, { outcome: "updated", from: current.version, to: staged.version });
  say(run, `emet updated from ${current.version} to ${staged.version}`);
  return exitCodes.success;
}

async function updateOnce(
  run: UpdateRun,
  plan: AutoChildPlan,
  version: string | undefined,
  fallback: { version: string; binary: string },
): Promise<number> {
  const binary = currentBinary(run.layout, fallback.binary);
  const current = { binary, version: versionOfBinary(run.layout, binary, fallback.version) };
  if (plan.applyPending) {
    const pending = readPending(run.layout);
    if (pending !== undefined && pending.version !== current.version) {
      const code = await applyStaged(run, pending, current);
      if (!plan.check || existsSync(run.layout.pendingPath)) return code;
      return updateOnce(run, { applyPending: false, check: true }, version, fallback);
    }
    rmSync(run.layout.pendingPath, { force: true });
  }
  if (!plan.check) return exitCodes.success;
  const staged = await stageRelease(version, current, run.layout, run.seams);
  if (staged === undefined) {
    say(run, `emet ${current.version} is current; nothing to update`);
    return exitCodes.success;
  }
  return applyStaged(run, staged, current);
}

async function guardedUpdate(
  run: UpdateRun,
  plan: AutoChildPlan,
  version: string | undefined,
  fallback: { version: string; binary: string },
): Promise<number> {
  try {
    return await updateOnce(run, plan, version, fallback);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof OfflineError) {
      if (run.auto) return exitCodes.success;
    } else if (!(error instanceof UpdateFailure)) {
      journalUpdate(run, { outcome: "failed", reason });
      run.deps.error(`emet self update: ${reason}`);
      return exitCodes.internal;
    }
    journalUpdate(run, { outcome: "failed", reason, requested: version ?? "latest" });
    if (!run.auto) run.deps.error(`emet self update: ${reason}; the current version is unchanged`);
    return exitCodes.findings;
  }
}

/** Plans the `--auto` work from the throttle file, or returns undefined when there is none. */
function planAuto(run: UpdateRun): AutoChildPlan | undefined {
  const { seams } = run;
  const state = readAutoState(seams.stateDirectory);
  const last = state.lastCheckAt === undefined ? Number.NaN : Date.parse(state.lastCheckAt);
  const now = run.deps.now();
  const check = Number.isNaN(last) || now.getTime() - last >= AUTO_INTERVAL_MS;
  const applyPending = existsSync(run.layout.pendingPath);
  if (!check && !applyPending) return undefined;
  if (check) writeAutoState(seams.stateDirectory, { ...state, lastCheckAt: now.toISOString() });
  return { applyPending, check };
}

/**
 * Runs `emet self update` with explicit seams. Downloads the release, verifies `SHA256SUMS` and
 * the attestation, stages it under the versions directory and swaps the symlink when no worker
 * slot is held, else records it as pending. `--auto` runs at most once a day in a detached child,
 * silent when offline; `--auto off|on` toggles it. A plugin or source install is left alone.
 */
export async function runSelfUpdateWith(
  argv: readonly string[],
  deps: SelfDeps,
  seams: UpdateSeams,
): Promise<number> {
  const parsed = parseUpdateArgs(argv);
  if (typeof parsed === "string") {
    deps.error(`emet self update: ${parsed}`);
    deps.error(UPDATE_USAGE);
    return exitCodes.usage;
  }
  if (parsed.autoSetting !== undefined) {
    writeAutoState(seams.stateDirectory, {
      ...readAutoState(seams.stateDirectory),
      auto: parsed.autoSetting,
    });
    deps.log(`emet auto-update is ${parsed.autoSetting}`);
    return exitCodes.success;
  }
  if (parsed.auto) {
    if (readEnv("EMET_AUTO_UPDATE", seams.env) === "0") return exitCodes.success;
    if (readAutoState(seams.stateDirectory).auto === "off") return exitCodes.success;
  }
  const install = readInstallState(deps.home);
  if (install?.mode !== "standalone") {
    if (!parsed.auto) {
      deps.log("emet self update: not a standalone install (plugin or source); nothing to update");
    }
    return exitCodes.success;
  }
  const layout = layoutFor(deps.home);
  const run: UpdateRun = { deps, seams, layout, auto: parsed.auto };
  const fallback = { version: install.version, binary: install.binary };
  if (!parsed.auto) {
    return guardedUpdate(run, { applyPending: false, check: true }, parsed.version, fallback);
  }
  if (parsed.childPlan !== undefined) {
    return guardedUpdate(run, parsed.childPlan, undefined, fallback);
  }
  const plan = planAuto(run);
  if (plan !== undefined) seams.detach(plan);
  return exitCodes.success;
}

function platformAsset(): string | null {
  const os = process.platform === "linux" || process.platform === "darwin" ? process.platform : "";
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : "";
  return os === "" || arch === "" ? null : `emet-${os}-${arch}`;
}

async function fetchReleaseBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("file:")) {
    const file = fileURLToPath(url);
    if (!existsSync(file)) throw new UpdateFailure(`${url} not found`);
    return readFileSync(file);
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new OfflineError(`cannot reach ${url}: ${String(error)}`);
  }
  if (!response.ok) throw new UpdateFailure(`${url} returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function commandSucceeds(command: string, args: readonly string[], timeout: number): boolean {
  return spawnSync(command, args, { stdio: "ignore", timeout }).status === 0;
}

/** Verifies the attestation with `gh`; skipped when `gh` is absent or not signed in. */
function verifyWithGh(file: string): Promise<"verified" | "skipped" | "failed"> {
  if (!commandSucceeds("gh", ["auth", "status"], 30_000)) return Promise.resolve("skipped");
  const verified = commandSucceeds(
    "gh",
    ["attestation", "verify", file, "--repo", RELEASE_REPOSITORY],
    120_000,
  );
  return Promise.resolve(verified ? "verified" : "failed");
}

function readBinaryVersion(binary: string): Promise<string | null> {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 30_000 });
  return Promise.resolve(result.status === 0 ? result.stdout.trim() : null);
}

function runInstallFrom(binary: string, home: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["self", "install", "--force"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...snapshotEnv(), HOME: home },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("error", (error) => {
      resolve({ code: 1, output: `${output}${error.message}` });
    });
    child.once("exit", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function detachChild(executable: string, plan: AutoChildPlan): void {
  const child = spawn(executable, ["self", "update", "--auto", CHILD_FLAG, renderChildPlan(plan)], {
    detached: true,
    stdio: "ignore",
    env: snapshotEnv(),
  });
  child.on("error", () => undefined);
  child.unref();
}

/** The `UpdateSeams` of this process: the real network, slot pool, `gh` and child processes. */
export function processUpdateSeams(deps: SelfDeps): UpdateSeams {
  const env = snapshotEnv();
  const directory = stateDir();
  const seams: UpdateSeams = {
    env,
    stateDirectory: directory,
    asset: platformAsset(),
    fetchBytes: fetchReleaseBytes,
    slotHeld: async () =>
      (await listOccupiedSlots(path.join(directory, "slots"))).some(
        (entry) => entry.verdict !== "dead",
      ),
    verifyAttestation: verifyWithGh,
    readVersion: readBinaryVersion,
    runHostAdapters: runInstallFrom,
    detach: (plan) => {
      detachChild(deps.executablePath, plan);
    },
  };
  return seams;
}

/** Runs `emet self update [latest|X.Y.Z]` or `emet self update --auto [off|on]` for this process. */
export function runSelfUpdate(argv: readonly string[], deps: SelfDeps): Promise<number> {
  return runSelfUpdateWith(argv, deps, processUpdateSeams(deps));
}
