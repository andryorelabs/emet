import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

interface PackageRule {
  groupName?: string;
  matchDepNames?: string[];
  matchDepTypes?: string[];
  matchManagers?: string[];
  rangeStrategy?: string;
  automerge?: boolean;
}

interface RenovateConfig {
  extends: string[];
  rangeStrategy: string;
  minimumReleaseAge: string;
  osvVulnerabilityAlerts: boolean;
  lockFileMaintenance: { enabled: boolean };
  packageRules: PackageRule[];
}

const config = Bun.JSON5.parse(
  readFileSync(path.join(repoRoot, "renovate.json5"), "utf8"),
) as RenovateConfig;

const exactPinnedPackages = ["oxlint", "oxlint-tsgolint", "oxfmt", "typescript7"];

describe("renovate.json5 policy", () => {
  test("extends best-practices and pins GitHub Action digests", () => {
    expect(config.extends).toContain("config:best-practices");
    expect(config.extends).toContain("helpers:pinGitHubActionDigests");
  });

  test("bumps ranges, waits three days, and watches OSV and lockfiles", () => {
    expect(config.rangeStrategy).toBe("bump");
    expect(config.minimumReleaseAge).toBe("3 days");
    expect(config.osvVulnerabilityAlerts).toBe(true);
    expect(config.lockFileMaintenance.enabled).toBe(true);
  });

  test("automerges patch and minor devDependency updates only", () => {
    const rule = config.packageRules.find(
      (candidate) => candidate.matchDepTypes?.includes("devDependencies") && candidate.automerge,
    );
    expect(rule).toBeDefined();
    expect(JSON.stringify(rule)).not.toContain("major");
  });

  test("pins oxc and typescript7 exactly without automerge", () => {
    const rule = config.packageRules.find((candidate) => candidate.groupName === "oxc");
    expect(rule?.matchDepNames).toEqual(exactPinnedPackages);
    expect(rule?.rangeStrategy).toBe("pin");
    expect(rule?.automerge).toBe(false);
  });

  test("declares the oxc rule after every automerge rule so it wins", () => {
    const oxcIndex = config.packageRules.findIndex((rule) => rule.groupName === "oxc");
    const lastAutomergeIndex = config.packageRules.findLastIndex((rule) => rule.automerge === true);
    expect(lastAutomergeIndex).toBeGreaterThanOrEqual(0);
    expect(oxcIndex).toBeGreaterThan(lastAutomergeIndex);
  });
});

describe("package.json exact pins", () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    devDependencies: Record<string, string>;
  };

  test.each(exactPinnedPackages)("%s is pinned to an exact version", (name) => {
    expect(manifest.devDependencies[name]).toMatch(/^(npm:typescript@)?\d+\.\d+\.\d+/);
  });
});
