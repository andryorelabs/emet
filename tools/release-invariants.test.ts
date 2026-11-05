import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const releaseWorkflow = readFileSync(
  join(import.meta.dir, "..", ".github", "workflows", "release.yml"),
  "utf8",
);

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

  test("smoke-runs the linux binary before publishing", () => {
    const smokeIndex = releaseWorkflow.indexOf("./dist/emet-linux-x64 --version");
    expect(smokeIndex).toBeGreaterThan(-1);
    expect(smokeIndex).toBeLessThan(releaseWorkflow.indexOf("gh release create"));
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
});

/** Extracts the shell script of the named step from the release workflow. */
function readStepScript(stepName: string): string {
  const stepStart = releaseWorkflow.indexOf(`- name: ${stepName}\n`);
  if (stepStart === -1) throw new Error(`release.yml has no step named ${stepName}`);
  const scriptStart = releaseWorkflow.indexOf("run: |\n", stepStart) + "run: |\n".length;
  const nextStep = releaseWorkflow.indexOf("\n      - ", scriptStart);
  return releaseWorkflow
    .slice(scriptStart, nextStep === -1 ? undefined : nextStep)
    .split("\n")
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
    for (const binary of ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"]) {
      expect(args).toContain(`dist/emet-${binary}`);
    }
    expect(args).toContain("dist/SHA256SUMS");
  });

  test("still creates the release without the bundle when the attest step was skipped", () => {
    const args = runPublishScript(false);
    expect(args).not.toContain("dist/emet.intoto.jsonl");
    expect(args).toContain("dist/emet-linux-x64");
    expect(args).toContain("dist/SHA256SUMS");
  });
});
