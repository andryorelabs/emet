import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
    const smokeIndex = releaseWorkflow.indexOf("./dist/forge-linux-x64 --version");
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
