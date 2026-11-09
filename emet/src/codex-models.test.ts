import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { codexModelsCachePaths, listedCodexModels, resolveCodexModel } from "./codex-models";
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

function writeCache(models: readonly FakeModel[], file: string = cachePath): void {
  const entries = models.map((model) => ({
    slug: model.slug,
    visibility: model.visibility ?? "list",
    supported_reasoning_levels: (model.efforts ?? ALL_EFFORTS).map((effort) => ({
      effort,
      description: effort,
    })),
    upgrade: model.upgrade ? { model: model.upgrade } : null,
  }));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ models: entries }));
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

const terraFallback: ForgeConfig = {
  ...DEFAULT_FORGE_CONFIG,
  codex: {
    ...DEFAULT_CODEX_CONFIG,
    models: {
      ...DEFAULT_CODEX_CONFIG.models,
      reviewer: {
        ...DEFAULT_CODEX_CONFIG.models.reviewer,
        medium: { model: "gpt-6.1-sol", effort: "high", fallback: ["gpt-5.6-terra"] },
      },
    },
  },
};

function homes(): { runHome: string; realHome: string; paths: string[] } {
  const runHome = path.join(directory, "run-home");
  const realHome = path.join(directory, "real-home");
  return { runHome, realHome, paths: codexModelsCachePaths(runHome, realHome) };
}

describe("Codex models cache lookup", () => {
  test("looks in the run home first, then the real Codex home", () => {
    const { runHome, realHome, paths } = homes();
    expect(paths).toEqual([
      path.join(runHome, "models_cache.json"),
      path.join(realHome, "models_cache.json"),
    ]);
  });

  test("the real Codex home defaults to CODEX_HOME", () => {
    const previous = process.env["CODEX_HOME"];
    process.env["CODEX_HOME"] = path.join(directory, "env-home");
    try {
      expect(codexModelsCachePaths(path.join(directory, "run-home"))).toEqual([
        path.join(directory, "run-home", "models_cache.json"),
        path.join(directory, "env-home", "models_cache.json"),
      ]);
    } finally {
      if (previous === undefined) delete process.env["CODEX_HOME"];
      else process.env["CODEX_HOME"] = previous;
    }
  });

  test("uses the real cache when the run home has none, and reports the substitution", () => {
    const { realHome, paths } = homes();
    writeCache([{ slug: "gpt-5.6-terra" }], path.join(realHome, "models_cache.json"));
    const result = resolveCodexModel("reviewerMedium", terraFallback, paths);
    expect(result.model).toBe("gpt-5.6-terra");
    expect(result.substituted?.from).toBe("gpt-6.1-sol");
    expect(result.substituted?.reason).toContain("not in the Codex models cache");
  });

  test("prefers the run-home cache over the real one", () => {
    const { runHome, realHome, paths } = homes();
    writeCache([{ slug: "gpt-6.1-sol" }], path.join(runHome, "models_cache.json"));
    writeCache([{ slug: "gpt-5.6-terra" }], path.join(realHome, "models_cache.json"));
    expect(resolveCodexModel("reviewerMedium", terraFallback, paths)).toEqual({
      model: "gpt-6.1-sol",
      effort: "high",
    });
  });

  test("skips an unreadable run-home cache", () => {
    const { runHome, realHome, paths } = homes();
    mkdirSync(runHome, { recursive: true });
    writeFileSync(path.join(runHome, "models_cache.json"), "not json");
    writeCache([{ slug: "gpt-5.6-terra" }], path.join(realHome, "models_cache.json"));
    expect(resolveCodexModel("reviewerMedium", terraFallback, paths).model).toBe("gpt-5.6-terra");
  });

  test("keeps the configured slug when no cache exists anywhere", () => {
    expect(resolveCodexModel("reviewerMedium", terraFallback, homes().paths)).toEqual({
      model: "gpt-6.1-sol",
      effort: "high",
    });
  });

  test("lists only the listed slugs of the first readable cache", () => {
    const { realHome, paths } = homes();
    expect(listedCodexModels(paths)).toBeUndefined();
    writeCache(
      [
        { slug: "gpt-6-luna" },
        { slug: "gpt-reserve", visibility: "hide" },
        { slug: "gpt-5.6-terra" },
      ],
      path.join(realHome, "models_cache.json"),
    );
    expect(listedCodexModels(paths)).toEqual(["gpt-6-luna", "gpt-5.6-terra"]);
    expect(listedCodexModels(path.join(realHome, "models_cache.json"))).toEqual([
      "gpt-6-luna",
      "gpt-5.6-terra",
    ]);
  });
});
