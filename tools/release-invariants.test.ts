import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
});

/** Extracts the shell script of the "Require green CI" step from the release workflow. */
function readCiGateScript(): string {
  const stepStart = releaseWorkflow.indexOf("- name: Require green CI on the tagged commit");
  const scriptStart = releaseWorkflow.indexOf("run: |\n", stepStart) + "run: |\n".length;
  const nextStep = releaseWorkflow.indexOf("\n      - ", scriptStart);
  return releaseWorkflow
    .slice(scriptStart, nextStep)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
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
