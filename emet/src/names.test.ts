import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AGENTS_DOC,
  BINARY,
  CONFIG_FILE,
  LEGACY_AGENTS_DOC,
  LEGACY_CONFIG_FILE,
  LEGACY_RUN_DIR,
  LOCK_TOKEN,
  LOCK_TOKENS,
  PRODUCT,
  REVIEWER_AGENT,
  RUN_DIR,
  TODO_MARKER,
  TODO_MARKERS,
  WORKER_AGENT,
  legacyStateDir,
  readEnv,
  resolveAgentsDoc,
  resolveConfigPath,
  resolveRunDir,
  stateDir,
  warnLegacy,
} from "./names.ts";

let root: string;
let stderrLines: string[];
let restoreStderr: () => void;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "names-"));
  stderrLines = [];
  const spy = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  });
  restoreStderr = () => {
    spy.mockRestore();
  };
});

afterEach(() => {
  restoreStderr();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("constants", () => {
  it("exposes the current and legacy names", () => {
    expect(PRODUCT).toBe("emet");
    expect(BINARY).toBe("emet");
    expect(CONFIG_FILE).toBe("emet.config.json");
    expect(LEGACY_CONFIG_FILE).toBe("forge.config.json");
    expect(RUN_DIR).toBe(".emet");
    expect(LEGACY_RUN_DIR).toBe(".forge");
    expect(AGENTS_DOC).toBe("docs/agents/emet.md");
    expect(WORKER_AGENT).toBe("emet-worker");
    expect(REVIEWER_AGENT).toBe("emet-reviewer");
    expect(TODO_MARKER).toBe("TODO(emet):");
    expect(TODO_MARKERS).toEqual(["TODO(emet):", "TODO(forge):"]);
    expect(LOCK_TOKEN).toBe("emet");
    expect(LOCK_TOKENS).toEqual(["emet", "forge"]);
  });
});

describe("resolveConfigPath", () => {
  it("returns undefined when neither file exists", () => {
    expect(resolveConfigPath(root)).toBeUndefined();
  });

  it("prefers the new file without warning", () => {
    fs.writeFileSync(path.join(root, CONFIG_FILE), "{}");
    fs.writeFileSync(path.join(root, LEGACY_CONFIG_FILE), "{}");
    expect(resolveConfigPath(root)).toEqual({
      path: path.join(root, CONFIG_FILE),
      legacy: false,
    });
    expect(stderrLines).toEqual([]);
  });

  it("falls back to the legacy file and warns exactly once", () => {
    fs.writeFileSync(path.join(root, LEGACY_CONFIG_FILE), "{}");
    expect(resolveConfigPath(root)).toEqual({
      path: path.join(root, LEGACY_CONFIG_FILE),
      legacy: true,
    });
    resolveConfigPath(root);
    expect(stderrLines).toEqual(["emet: using legacy forge.config.json; run `emet migrate`\n"]);
  });
});

describe("resolveRunDir", () => {
  it("returns the new directory when neither exists", () => {
    expect(resolveRunDir(root)).toEqual({ path: path.join(root, RUN_DIR), legacy: false });
  });

  it("falls back to the legacy directory", () => {
    fs.mkdirSync(path.join(root, LEGACY_RUN_DIR));
    expect(resolveRunDir(root)).toEqual({
      path: path.join(root, LEGACY_RUN_DIR),
      legacy: true,
    });
    expect(stderrLines).toEqual(["emet: using legacy .forge; run `emet migrate`\n"]);
  });

  it("prefers the new directory", () => {
    fs.mkdirSync(path.join(root, RUN_DIR));
    fs.mkdirSync(path.join(root, LEGACY_RUN_DIR));
    expect(resolveRunDir(root).legacy).toBe(false);
  });
});

describe("resolveAgentsDoc", () => {
  it("resolves new, then legacy, then undefined", () => {
    expect(resolveAgentsDoc(root)).toBeUndefined();
    fs.mkdirSync(path.join(root, "docs", "agents"), { recursive: true });
    fs.writeFileSync(path.join(root, LEGACY_AGENTS_DOC), "x");
    expect(resolveAgentsDoc(root)?.legacy).toBe(true);
    fs.writeFileSync(path.join(root, AGENTS_DOC), "x");
    expect(resolveAgentsDoc(root)).toEqual({
      path: path.join(root, AGENTS_DOC),
      legacy: false,
    });
  });
});

describe("readEnv", () => {
  it("returns undefined when unset", () => {
    expect(readEnv("NOPE_UNSET", {})).toBeUndefined();
  });

  it("lets EMET_ win over FORGE_ without warning", () => {
    expect(readEnv("X_WIN", { EMET_X_WIN: "a", FORGE_X_WIN: "b" })).toBe("a");
    expect(stderrLines).toEqual([]);
  });

  it("falls back to FORGE_ and warns once", () => {
    const env = { FORGE_X_ONLY: "2" };
    expect(readEnv("X_ONLY", env)).toBe("2");
    expect(readEnv("X_ONLY", env)).toBe("2");
    expect(stderrLines).toEqual(["emet: using legacy FORGE_X_ONLY; run `emet migrate`\n"]);
  });
});

describe("stateDir", () => {
  it("prefers EMET_STATE_DIR", () => {
    expect(stateDir({ EMET_STATE_DIR: "/tmp/a", XDG_STATE_HOME: "/tmp/x" })).toBe("/tmp/a");
  });

  it("uses XDG_STATE_HOME/emet", () => {
    expect(stateDir({ XDG_STATE_HOME: "/tmp/x" })).toBe("/tmp/x/emet");
  });

  it("defaults to ~/.local/state/emet", () => {
    expect(stateDir({})).toBe(path.join(os.homedir(), ".local", "state", "emet"));
  });
});

describe("legacyStateDir", () => {
  it("points at the forge directories", () => {
    expect(legacyStateDir({ XDG_STATE_HOME: "/tmp/x" })).toBe("/tmp/x/forge");
    expect(legacyStateDir({})).toBe(path.join(os.homedir(), ".local", "state", "forge"));
  });
});

describe("warnLegacy", () => {
  it("prints once per name", () => {
    warnLegacy("unique-name-1");
    warnLegacy("unique-name-1");
    warnLegacy("unique-name-2");
    expect(stderrLines).toHaveLength(2);
  });
});
