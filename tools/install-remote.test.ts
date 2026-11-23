import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptPath = path.resolve(import.meta.dir, "../scripts/install-remote.sh");
const fakeEmetBody = '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$EMET_FAKE_MARKER"\nexit 0\n';
const realTools = [
  "sh",
  "curl",
  "mktemp",
  "awk",
  "chmod",
  "rm",
  "grep",
  "sha256sum",
  "shasum",
  "perl",
];

let workDir = "";
let releaseRoot = "";
let binDir = "";
let tmpDir = "";
let markerPath = "";

/** Hex SHA-256 of `content`. */
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Writes an executable stub script named `name` into the test PATH. */
function writeStub(name: string, body: string): void {
  const stubPath = path.join(binDir, name);
  writeFileSync(stubPath, `#!/bin/sh\n${body}\n`);
  chmodSync(stubPath, 0o755);
}

/** Options shaping one fake release directory. */
interface ReleaseOptions {
  readonly channel?: string;
  readonly asset?: string;
  readonly body?: string;
  readonly checksum?: string;
  readonly listAsset?: boolean;
  readonly withSums?: boolean;
}

/** Publishes a fake release under `releaseRoot/<channel>` with an asset and SHA256SUMS. */
function publishRelease(options: ReleaseOptions = {}): void {
  const directory = path.join(releaseRoot, options.channel ?? "latest");
  const asset = options.asset ?? "emet-linux-x64";
  const body = options.body ?? fakeEmetBody;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, asset), body);
  if (options.withSums === false) return;
  const listed =
    options.listAsset === false
      ? `${sha256("other")}  emet-other\n`
      : `${options.checksum ?? sha256(body)}  ${asset}\n`;
  writeFileSync(path.join(directory, "SHA256SUMS"), listed);
}

/** Result of one installer run. */
interface RunResult {
  readonly code: number;
  readonly stderr: string;
  readonly handedOff: boolean;
  readonly handoffArgs: string[];
}

/** Runs the installer with a stubbed PATH, fake platform and the fake release root. */
function runInstaller(args: string[], env: Record<string, string> = {}): RunResult {
  const result = Bun.spawnSync(["sh", scriptPath, ...args], {
    env: {
      PATH: binDir,
      HOME: workDir,
      TMPDIR: tmpDir,
      EMET_RELEASE_BASE_URL: `file://${releaseRoot}`,
      EMET_FAKE_MARKER: markerPath,
      FAKE_OS: "Linux",
      FAKE_ARCH: "x86_64",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const handedOff = existsSync(markerPath);
  return {
    code: result.exitCode,
    stderr: result.stderr.toString(),
    handedOff,
    handoffArgs: handedOff ? readFileSync(markerPath, "utf8").split("\n").slice(0, -1) : [],
  };
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "emet-install-remote-"));
  releaseRoot = path.join(workDir, "releases");
  binDir = path.join(workDir, "bin");
  tmpDir = path.join(workDir, "tmp");
  markerPath = path.join(workDir, "handoff");
  for (const directory of [releaseRoot, binDir, tmpDir]) mkdirSync(directory);
  for (const tool of realTools) {
    const located = Bun.which(tool);
    if (located !== null) symlinkSync(located, path.join(binDir, tool));
  }
  writeStub(
    "uname",
    'case "$1" in -s) echo "$FAKE_OS" ;; -m) echo "$FAKE_ARCH" ;; *) echo "$FAKE_OS" ;; esac',
  );
  writeStub("id", 'if [ "$1" = -u ]; then echo "${FAKE_UID:-1000}"; else echo user; fi');
  writeStub("sysctl", 'echo "${FAKE_TRANSLATED:-0}"');
  writeStub("ldd", 'echo "${FAKE_LIBC:-ldd (GNU libc) 2.39}"');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Asserts a run failed, ran nothing and left no temporary directory behind. */
function expectNothingRan(result: RunResult, message: RegExp): void {
  expect(result.code).not.toBe(0);
  expect(result.handedOff).toBe(false);
  expect(result.stderr).toMatch(message);
  expect(readdirSync(tmpDir)).toEqual([]);
}

describe("install-remote.sh", () => {
  test("keeps its whole body in main(), called on the last line", () => {
    const lines = readFileSync(scriptPath, "utf8").trimEnd().split("\n");
    expect(lines[0]).toBe("#!/bin/sh");
    expect(lines.at(-1)).toBe('main "$@"');
    expect(lines).toContain("main() {");
  });

  test("hands off to emet self install with the given arguments when the checksum matches", () => {
    publishRelease();
    const result = runInstaller(["--dry-run", "--force"]);
    expect(result.stderr).toContain("gh not found");
    expect(result.code).toBe(0);
    expect(result.handoffArgs).toEqual(["self", "install", "--dry-run", "--force"]);
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  test("downloads a pinned version from <base>/v<version>", () => {
    publishRelease({ channel: "v1.2.3" });
    const result = runInstaller(["1.2.3"]);
    expect(result.code).toBe(0);
    expect(result.handoffArgs).toEqual(["self", "install", "1.2.3"]);
  });

  test("propagates the exit status of emet self install", () => {
    publishRelease({ body: "#!/bin/sh\nexit 7\n" });
    expect(runInstaller([]).code).toBe(7);
  });

  test("fetches the arm64 binary under Rosetta translation", () => {
    publishRelease({ asset: "emet-darwin-arm64" });
    const result = runInstaller([], { FAKE_OS: "Darwin", FAKE_TRANSLATED: "1" });
    expect(result.code).toBe(0);
    expect(result.handedOff).toBe(true);
  });

  test("maps aarch64 Linux to the linux-arm64 asset", () => {
    publishRelease({ asset: "emet-linux-arm64" });
    expect(runInstaller([], { FAKE_ARCH: "aarch64" }).handedOff).toBe(true);
  });

  test("fails on a truncated download", () => {
    publishRelease({ body: fakeEmetBody.slice(0, 10), checksum: sha256(fakeEmetBody) });
    expectNothingRan(runInstaller([]), /checksum mismatch/);
  });

  test("fails on a wrong checksum", () => {
    publishRelease({ checksum: sha256("tampered") });
    expectNothingRan(runInstaller([]), /checksum mismatch/);
  });

  test("fails when SHA256SUMS has no line for the asset", () => {
    publishRelease({ listAsset: false });
    expectNothingRan(runInstaller([]), /no checksum listed for emet-linux-x64/);
  });

  test("fails when SHA256SUMS is missing", () => {
    publishRelease({ withSums: false });
    expectNothingRan(runInstaller([]), /SHA256SUMS/);
  });

  test("fails when the asset is missing", () => {
    publishRelease({ asset: "emet-darwin-x64" });
    expectNothingRan(runInstaller([]), /could not download emet-linux-x64/);
  });

  test("refuses to run under sudo", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { SUDO_USER: "someone" }), /sudo/);
  });

  test("refuses to run as root", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { FAKE_UID: "0" }), /sudo or as root/);
  });

  test("fails on an unsupported operating system", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { FAKE_OS: "FreeBSD" }), /unsupported operating system/);
  });

  test("fails on native Windows with a pointer to WSL", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { FAKE_OS: "MINGW64_NT-10.0" }), /WSL/);
  });

  test("fails on an unsupported architecture", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { FAKE_ARCH: "i686" }), /unsupported architecture/);
  });

  test("fails on musl libc", () => {
    publishRelease();
    expectNothingRan(runInstaller([], { FAKE_LIBC: "musl libc (x86_64)" }), /musl/);
  });

  test("verifies the attestation with gh and hands off when it passes", () => {
    publishRelease();
    writeStub("gh", 'echo "$@" >> "$EMET_FAKE_MARKER.gh"; exit 0');
    const result = runInstaller([]);
    expect(result.code).toBe(0);
    expect(result.handedOff).toBe(true);
    expect(readFileSync(`${markerPath}.gh`, "utf8")).toMatch(
      /attestation verify .*\/emet --repo andryorelabs\/emet/,
    );
  });

  test("fails hard when gh runs and the attestation does not verify", () => {
    publishRelease();
    writeStub("gh", 'if [ "$1" = attestation ]; then exit 1; fi; exit 0');
    expectNothingRan(runInstaller([]), /attestation/);
  });

  test("skips the attestation when gh is not signed in", () => {
    publishRelease();
    writeStub("gh", 'if [ "$1" = auth ]; then exit 1; fi; exit 1');
    const result = runInstaller([]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("not signed in");
    expect(result.handedOff).toBe(true);
  });
});
