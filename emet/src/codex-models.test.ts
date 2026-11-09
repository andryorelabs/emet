import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveCodexModel } from "./codex-models";
import { DEFAULT_CODEX_CONFIG, DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";

interface FakeModel {
  readonly slug: string;
  readonly visibility?: string;
  readonly efforts?: readonly string[];
  readonly upgrade?: string | null;
}

const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

let directory: string;
let cachePath: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "codex-models-test-"));
  cachePath = path.join(directory, "models_cache.json");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function writeCache(models: readonly FakeModel[]): void {
  const entries = models.map((model) => ({
    slug: model.slug,
    visibility: model.visibility ?? "list",
    supported_reasoning_levels: (model.efforts ?? ALL_EFFORTS).map((effort) => ({
      effort,
      description: effort,
    })),
    upgrade: model.upgrade ? { model: model.upgrade } : null,
  }));
  writeFileSync(cachePath, JSON.stringify({ models: entries }));
}

describe("resolveCodexModel", () => {
  test("uses the configured slug unchanged when no cache file exists", () => {
    expect(resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath)).toEqual({
      model: "gpt-6.1-sol",
      effort: "medium",
    });
  });

  test("uses the configured slug when listed and the effort is supported", () => {
    writeCache([{ slug: "gpt-6.1-sol" }]);
    expect(resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath)).toEqual({
      model: "gpt-6.1-sol",
      effort: "medium",
    });
  });

  test("falls back to terra with a reason when the configured slug is absent", () => {
    writeCache([{ slug: "gpt-6.1-terra" }]);
    const result = resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath);
    expect(result.model).toBe("gpt-6.1-terra");
    expect(result.substituted?.from).toBe("gpt-6.1-sol");
    expect(result.substituted?.reason).toContain("not in the Codex models cache");
  });

  test("skips a hidden slug", () => {
    writeCache([{ slug: "gpt-6.1-sol", visibility: "hide" }, { slug: "gpt-6-luna" }]);
    const result = resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath);
    expect(result.model).toBe("gpt-6-luna");
    expect(result.substituted?.reason).toContain("hide");
  });

  test("skips a slug that does not support the effort", () => {
    writeCache([{ slug: "gpt-6.1-sol", efforts: ["low", "medium"] }, { slug: "gpt-6-astra" }]);
    const result = resolveCodexModel("workerOverride", DEFAULT_FORGE_CONFIG, cachePath);
    expect(result).toMatchObject({ model: "gpt-6-astra", effort: "xhigh" });
    expect(result.substituted?.reason).toContain("effort xhigh");
  });

  test("follows upgrade.model before the fallbacks", () => {
    writeCache([
      { slug: "gpt-6.1-sol", visibility: "hide", upgrade: "gpt-7" },
      { slug: "gpt-7" },
      { slug: "gpt-6.1-terra" },
    ]);
    const result = resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath);
    expect(result.model).toBe("gpt-7");
    expect(result.substituted?.reason).toContain("upgraded");
  });

  test("omits the model when nothing is usable", () => {
    writeCache([{ slug: "unrelated" }]);
    const result = resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath);
    expect(result.model).toBeUndefined();
    expect(result.effort).toBe("medium");
    expect(result.substituted?.reason).toContain("omitting -m");
  });

  test("a model that also lists ultra is still resolved at the configured effort", () => {
    writeCache([{ slug: "gpt-6.1-sol", efforts: [...ALL_EFFORTS, "ultra"] }]);
    expect(resolveCodexModel("worker", DEFAULT_FORGE_CONFIG, cachePath)).toEqual({
      model: "gpt-6.1-sol",
      effort: "medium",
    });
  });

  test("codex.effort overrides every role's effort", () => {
    writeCache([{ slug: "gpt-6-luna" }]);
    const config: ForgeConfig = {
      ...DEFAULT_FORGE_CONFIG,
      codex: { ...DEFAULT_CODEX_CONFIG, effort: "low" },
    };
    expect(resolveCodexModel("triage", config, cachePath)).toEqual({
      model: "gpt-6-luna",
      effort: "low",
    });
  });

  test("reads each role from its own config entry", () => {
    expect(resolveCodexModel("reviewerHigh", DEFAULT_FORGE_CONFIG, cachePath)).toEqual({
      model: "gpt-6-astra",
      effort: "high",
    });
    expect(resolveCodexModel("reviewerMedium", DEFAULT_FORGE_CONFIG, cachePath).model).toBe(
      "gpt-6.1-sol",
    );
    expect(resolveCodexModel("session", DEFAULT_FORGE_CONFIG, cachePath).effort).toBe("medium");
  });

  test("treats an unreadable cache like a missing one", () => {
    writeFileSync(cachePath, "not json");
    expect(resolveCodexModel("triage", DEFAULT_FORGE_CONFIG, cachePath).model).toBe("gpt-6-luna");
  });
});
