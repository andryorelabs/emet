import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const releaseWorkflow = readFileSync(
  join(import.meta.dir, "..", ".github", "workflows", "release.yml"),
  "utf8",
);

const TAG_CHECK_STEP = "Check the tag is annotated and signed";
const SMOKE_STEP = "Smoke-run the binary and record its size";
const UPLOAD_ACTION = "actions/upload-artifact@";
const DOWNLOAD_ACTION = "actions/download-artifact@";
const SBOM_ACTION = "anchore/sbom-action@";
const SBOM_PATH = "dist/emet.cdx.json";
const INSTALL_SCRIPT_STEP = "Stage the install script";
const SUMS_STEP = "Write SHA256SUMS";
const INSTALL_ASSET = "dist/install.sh";
const RELEASE_BINARIES = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];

/** A workflow step as far as these tests read it. */
interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
}

/** A workflow job as far as these tests read it. */
interface Job {
  readonly "runs-on"?: string;
  readonly needs?: string | string[];
  readonly strategy?: {
    readonly "fail-fast"?: boolean;
    readonly matrix?: { readonly include?: unknown[] };
  };
  readonly steps?: Step[];
}

/** Whether the parsed workflow has a `jobs` mapping, read as jobs of the shape above. */
function hasJobs(value: unknown): value is { jobs: Record<string, Job> } {
  if (typeof value !== "object" || value === null || !("jobs" in value)) return false;
  const { jobs } = value;
  return typeof jobs === "object" && jobs !== null && !Array.isArray(jobs);
}

const parsedRelease: unknown = Bun.YAML.parse(releaseWorkflow);
if (!hasJobs(parsedRelease)) throw new Error("release.yml has no jobs mapping");
const releaseJobs = parsedRelease.jobs;

/** Lists the steps of the named release job. */
function jobSteps(jobName: string): Step[] {
  return releaseJobs[jobName]?.steps ?? [];
}

/** Lists the jobs the named release job needs. */
function jobNeeds(jobName: string): string[] {
  const needs = releaseJobs[jobName]?.needs ?? [];
  return typeof needs === "string" ? [needs] : needs;
}

describe("release.yml invariants", () => {
  test("gates the release on the CI passed check-run of the tagged SHA", () => {
    expect(releaseWorkflow).toContain("checks: read");
    expect(releaseWorkflow).toContain('select(.name == "CI passed")');
    expect(releaseWorkflow).toContain("commits/${GITHUB_SHA}/check-runs");
  });

  test("re-runs check and test in a verify job the release job needs", () => {
    expect(releaseWorkflow).toMatch(/^ {2}verify:/m);
    expect(releaseWorkflow).toMatch(/needs: verify/);
    expect(releaseWorkflow).toContain("bun run check");
    expect(releaseWorkflow).toContain("bun run test");
  });

  test("creates the release idempotently and verifies the tag", () => {
    expect(releaseWorkflow).toContain('gh release view "${GITHUB_REF_NAME}"');
    expect(releaseWorkflow).toContain("--verify-tag");
    expect(releaseWorkflow).toContain("--prerelease --latest=false");
  });

  test("checks the tag is annotated and signed, and matches plugin.json, before any build", () => {
    const steps = jobSteps("verify");
    const tagCheck = steps.findIndex(({ name }) => name === TAG_CHECK_STEP);
    const pluginCheck = steps.findIndex(({ name }) => name === "Check the tag matches plugin.json");
    expect(tagCheck).toBeGreaterThan(-1);
    expect(pluginCheck).toBeGreaterThan(-1);
    expect(tagCheck).toBeLessThan(pluginCheck);
    expect(jobNeeds("release")).toContain("verify");
    expect(steps.some(({ run }) => run?.includes("build-binaries.ts") === true)).toBe(false);
  });

  test("hands the binaries and release notes from the build job to the later jobs", () => {
    expect(jobSteps("release").some(({ uses }) => uses?.startsWith(UPLOAD_ACTION) === true)).toBe(
      true,
    );
    for (const job of ["binary", "publish"]) {
      expect(jobSteps(job).some(({ uses }) => uses?.startsWith(DOWNLOAD_ACTION) === true)).toBe(
        true,
      );
    }
  });

  test("smoke-runs every binary on its native runner and writes its size to the summary", () => {
    const binary = releaseJobs.binary;
    expect(binary?.["runs-on"]).toBe("${{ matrix.runner }}");
    expect(binary?.strategy?.["fail-fast"]).toBe(false);
    expect(binary?.strategy?.matrix?.include).toEqual([
      { target: "linux-x64", runner: "ubuntu-latest" },
      { target: "linux-arm64", runner: "ubuntu-24.04-arm" },
      { target: "darwin-arm64", runner: "macos-latest" },
      { target: "darwin-x64", runner: "macos-15-intel" },
    ]);
    const smoke = readStepScript(SMOKE_STEP);
    expect(smoke).toContain("--version");
    expect(smoke).toContain("GITHUB_STEP_SUMMARY");
    expect(jobNeeds("publish")).toContain("release");
    expect(jobNeeds("publish")).toContain("binary");
  });

  test("attaches a CycloneDX SBOM to the release", () => {
    const sbom = jobSteps("publish").find(({ uses }) => uses?.startsWith(SBOM_ACTION) === true);
    expect(sbom?.with?.format).toBe("cyclonedx-json");
    expect(sbom?.with?.["output-file"]).toBe(SBOM_PATH);
    expect(readStepScript("Publish GitHub Release")).toContain(SBOM_PATH);
  });

  test("starts every release job with harden-runner", () => {
    for (const [name, job] of Object.entries(releaseJobs)) {
      expect({ name, first: job.steps?.[0]?.uses?.split("@")[0] }).toEqual({
        name,
        first: "step-security/harden-runner",
      });
    }
  });

  test("attests provenance only for public repositories", () => {
    expect(releaseWorkflow).toContain("actions/attest-build-provenance@");
    expect(releaseWorkflow).toContain("!github.event.repository.private");
    expect(releaseWorkflow).toContain("id-token: write");
    expect(releaseWorkflow).toContain("attestations: write");
  });

  test("publishes the attest step's bundle-path as the emet.intoto.jsonl asset", () => {
    expect(releaseWorkflow).toMatch(/- name: Attest build provenance\n {8}id: attest\n/);
    expect(releaseWorkflow).toContain(
      "PROVENANCE_BUNDLE_PATH: ${{ steps.attest.outputs.bundle-path }}",
    );
    const publishScript = readStepScript("Publish GitHub Release");
    expect(publishScript).not.toContain("${{");
    expect(publishScript).toContain('cp "${PROVENANCE_BUNDLE_PATH}" dist/emet.intoto.jsonl');
  });

  test("stages scripts/install-remote.sh as dist/install.sh before the checksums", () => {
    const steps = jobSteps("publish");
    const stage = steps.findIndex(({ name }) => name === INSTALL_SCRIPT_STEP);
    const sums = steps.findIndex(({ name }) => name === SUMS_STEP);
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(sums);
    expect(readStepScript(INSTALL_SCRIPT_STEP)).toContain(
      "cp scripts/install-remote.sh dist/install.sh",
    );
  });

  test("lists install.sh among the attestation subjects", () => {
    const attest = jobSteps("publish").find(({ name }) => name === "Attest build provenance");
    const subjectPath = attest?.with?.["subject-path"];
    const subjects = (typeof subjectPath === "string" ? subjectPath : "")
      .split("\n")
      .filter(Boolean);
    expect(subjects).toEqual([
      "dist/emet-linux-x64",
      "dist/emet-linux-arm64",
      "dist/emet-darwin-x64",
      "dist/emet-darwin-arm64",
      INSTALL_ASSET,
    ]);
  });
});

describe("release checksum behaviour", () => {
  test("writes a SHA256SUMS line for every binary and install.sh", () => {
    const directory = mkdtempSync(join(tmpdir(), "emet-release-sums-"));
    try {
      const assets = [...RELEASE_BINARIES.map((binary) => `emet-${binary}`), "install.sh"];
      for (const asset of assets) writeFileSync(join(directory, asset), asset);
      const scriptPath = join(directory, "sums.sh");
      writeFileSync(scriptPath, readStepScript(SUMS_STEP));
      const result = Bun.spawnSync(["bash", "-e", scriptPath], { cwd: directory });
      expect(result.exitCode).toBe(0);
      const listed = readFileSync(join(directory, "SHA256SUMS"), "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split(/\s+/)[1]);
      expect(listed).toEqual(assets);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/** Extracts the shell script of the named step from the release workflow. */
function readStepScript(stepName: string): string {
  const stepStart = releaseWorkflow.indexOf(`- name: ${stepName}\n`);
  if (stepStart === -1) throw new Error(`release.yml has no step named ${stepName}`);
  const scriptStart = releaseWorkflow.indexOf("run: |\n", stepStart) + "run: |\n".length;
  const scriptLines = releaseWorkflow.slice(scriptStart).split("\n");
  const end = scriptLines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return scriptLines
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

/** Extracts the shell script of the "Require green CI" step from the release workflow. */
function readCiGateScript(): string {
  return readStepScript("Require green CI on the tagged commit");
}

describe("release CI gate behaviour", () => {
  test("fails with a clear message when no CI passed check run exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-gate-"));
    try {
      const stubPath = join(directory, "gh");
      writeFileSync(stubPath, "#!/usr/bin/env bash\nexit 0\n");
      chmodSync(stubPath, 0o755);
      const scriptPath = join(directory, "gate.sh");
      writeFileSync(scriptPath, readCiGateScript().replace("SECONDS + 4200", "SECONDS + 0"));
      const result = Bun.spawnSync(["bash", "-e", scriptPath], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_SHA: "deadbeef",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain("No CI passed check run found");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("treats a failing gh api call as a missing check run and keeps the deadline message", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-gate-"));
    try {
      const stubPath = join(directory, "gh");
      writeFileSync(stubPath, "#!/usr/bin/env bash\nexit 1\n");
      chmodSync(stubPath, 0o755);
      const scriptPath = join(directory, "gate.sh");
      writeFileSync(scriptPath, readCiGateScript().replace("SECONDS + 4200", "SECONDS + 0"));
      const result = Bun.spawnSync(["bash", "-e", scriptPath], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_SHA: "deadbeef",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain("No CI passed check run found");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/** Runs the publish step's script against a gh stub and returns the arguments `gh release create` got. */
function runPublishScript(withBundle: boolean): string[] {
  const directory = mkdtempSync(join(tmpdir(), "release-publish-"));
  try {
    const argsPath = join(directory, "gh-args");
    const stubPath = join(directory, "gh");
    writeFileSync(
      stubPath,
      `#!/usr/bin/env bash\nif [[ "$1 $2" == "release view" ]]; then exit 1; fi\nprintf '%s\\n' "$@" > "${argsPath}"\n`,
    );
    chmodSync(stubPath, 0o755);
    mkdirSync(join(directory, "dist"));
    const bundlePath = join(directory, "attestation.jsonl");
    writeFileSync(bundlePath, "{}\n");
    const scriptPath = join(directory, "publish.sh");
    writeFileSync(scriptPath, readStepScript("Publish GitHub Release"));
    const result = Bun.spawnSync(["bash", "-e", scriptPath], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        GITHUB_REF_NAME: "v9.9.9",
        PROVENANCE_BUNDLE_PATH: withBundle ? bundlePath : "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    return readFileSync(argsPath, "utf8").trim().split("\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("release publish behaviour", () => {
  test("attaches emet.intoto.jsonl next to the binaries and SHA256SUMS", () => {
    const args = runPublishScript(true);
    expect(args).toContain("dist/emet.intoto.jsonl");
    for (const binary of RELEASE_BINARIES) {
      expect(args).toContain(`dist/emet-${binary}`);
    }
    expect(args).toContain("dist/SHA256SUMS");
    expect(args).toContain(INSTALL_ASSET);
  });

  test("still creates the release without the bundle when the attest step was skipped", () => {
    const args = runPublishScript(false);
    expect(args).not.toContain("dist/emet.intoto.jsonl");
    expect(args).toContain("dist/emet-linux-x64");
    expect(args).toContain("dist/SHA256SUMS");
  });
});

/** Runs a step script with `bash -e` in a scratch directory with a `gh` stub on PATH. */
function runWithGhStub(
  script: string,
  ghStub: string,
  env: Record<string, string>,
): { exitCode: number; output: string } {
  const directory = mkdtempSync(join(tmpdir(), "release-step-"));
  try {
    const stubPath = join(directory, "gh");
    writeFileSync(stubPath, `#!/usr/bin/env bash\n${ghStub}\n`);
    chmodSync(stubPath, 0o755);
    const scriptPath = join(directory, "step.sh");
    writeFileSync(scriptPath, script);
    const result = Bun.spawnSync(["bash", "-e", scriptPath], {
      cwd: directory,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH ?? ""}`, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Runs the tag check against a gh stub that answers the ref and tag-object API calls. */
function runTagCheck(refJson: string, tagJson: string): { exitCode: number; output: string } {
  const stub = [
    'case "$2" in',
    `  */git/ref/tags/*) [[ -n '${refJson}' ]] || exit 1; echo '${refJson}' ;;`,
    `  */git/tags/*) echo '${tagJson}' ;;`,
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
  return runWithGhStub(readStepScript(TAG_CHECK_STEP), stub, {
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_REF_NAME: "v9.9.9",
  });
}

describe("release tag check behaviour", () => {
  const annotatedRef = '{"object":{"type":"tag","sha":"abc123"}}';

  test("fails a lightweight tag", () => {
    const result = runTagCheck('{"object":{"type":"commit","sha":"abc123"}}', "{}");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("lightweight");
  });

  test("fails an annotated tag without a verified signature", () => {
    const result = runTagCheck(
      annotatedRef,
      '{"verification":{"verified":false,"reason":"unsigned"}}',
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unsigned");
  });

  test("fails when the tag cannot be read", () => {
    const result = runTagCheck("", "");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Could not read tag v9.9.9");
  });

  test("passes an annotated tag with a verified signature", () => {
    const result = runTagCheck(annotatedRef, '{"verification":{"verified":true,"reason":"valid"}}');
    expect(result.output).toContain("annotated and signed");
    expect(result.exitCode).toBe(0);
  });
});

/** Runs the smoke step against a fake linux-x64 binary that prints `printed` for `--version`. */
function runSmoke(printed: string): { exitCode: number; output: string; summary: string } {
  const directory = mkdtempSync(join(tmpdir(), "release-smoke-"));
  try {
    mkdirSync(join(directory, "dist"));
    writeFileSync(
      join(directory, "dist", "emet-linux-x64"),
      `#!/usr/bin/env bash\necho ${printed}\n`,
    );
    const summaryPath = join(directory, "summary.md");
    writeFileSync(summaryPath, "");
    const scriptPath = join(directory, "smoke.sh");
    writeFileSync(scriptPath, readStepScript(SMOKE_STEP));
    const result = Bun.spawnSync(["bash", "-e", scriptPath], {
      cwd: directory,
      env: {
        ...process.env,
        GITHUB_REF_NAME: "v9.9.9",
        GITHUB_STEP_SUMMARY: summaryPath,
        TARGET: "linux-x64",
        RUNNER: "ubuntu-latest",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
      summary: readFileSync(summaryPath, "utf8"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("release binary smoke behaviour", () => {
  test("records the target, runner and byte size when the version matches the tag", () => {
    const result = runSmoke("9.9.9");
    expect(result.exitCode).toBe(0);
    expect(result.summary).toMatch(/\| emet-linux-x64 \| ubuntu-latest \| \d+ bytes \| 9\.9\.9 \|/);
  });

  test("fails when the binary reports another version", () => {
    const result = runSmoke("1.0.0");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("expected 9.9.9");
  });
});
