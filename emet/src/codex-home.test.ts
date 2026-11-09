import { afterEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { COMMIT_RULES, buildRunHome, hooksFileText } from "./codex-home";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
  scratch.push(dir);
  return dir;
}

function sourceHome(): string {
  const dir = tempDir();
  writeFileSync(path.join(dir, "auth.json"), '{"token":"secret"}');
  writeFileSync(path.join(dir, "config.toml"), 'model = "x"\n');
  return dir;
}

describe("COMMIT_RULES", () => {
  test("allows add and commit and forbids push", () => {
    expect(COMMIT_RULES).toContain('pattern = ["git", "add"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "commit"], decision = "allow"');
    expect(COMMIT_RULES).toContain('pattern = ["git", "push"], decision = "forbidden"');
  });
});

describe("hooksFileText", () => {
  test("points PreToolUse and UserPromptSubmit at emet guard", () => {
    const text = hooksFileText();
    expect(text.startsWith("{")).toBe(true);
    expect(text).toContain('"PreToolUse"');
    expect(text).toContain('"UserPromptSubmit"');
    expect(text.split("EMET_AGENT_HOST=codex emet guard")).toHaveLength(3);
  });
});

describe("buildRunHome run id validation", () => {
  test("rejects a run id that would escape the runs directory", () => {
    const source = tempDir();
    expect(() => buildRunHome({ run: "../../x", repoRoot: tempDir(), sourceHome: source })).toThrow(
      "invalid run id",
    );
  });
});

describe("buildRunHome", () => {
  test("links auth and config, writes rules and hooks, never copies secrets", () => {
    const source = sourceHome();
    const repoRoot = tempDir();
    const { codexHome } = buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    expect(codexHome).toBe(path.join(repoRoot, ".emet", "runs", "r1", "codex-home"));
    for (const name of ["auth.json", "config.toml"]) {
      const linkPath = path.join(codexHome, name);
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(readlinkSync(linkPath)).toBe(path.join(source, name));
    }
    expect(readFileSync(path.join(codexHome, "rules", "default.rules"), "utf8")).toBe(COMMIT_RULES);
    expect(readFileSync(path.join(codexHome, "hooks.json"), "utf8")).toBe(hooksFileText());
    const regularFiles = readdirSync(codexHome, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
    expect(regularFiles.join("")).not.toContain("secret");
  });

  test("never writes under the source home and rebuilds idempotently", () => {
    const source = sourceHome();
    const before = readdirSync(source, { recursive: true }).toSorted((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const repoRoot = tempDir();
    buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    buildRunHome({ run: "r1", repoRoot, sourceHome: source });
    expect(
      readdirSync(source, { recursive: true }).toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    ).toEqual(before);
    expect(readFileSync(path.join(source, "auth.json"), "utf8")).toBe('{"token":"secret"}');
  });

  test("skips links for files the source home lacks", () => {
    const source = tempDir();
    const { codexHome } = buildRunHome({ run: "r1", repoRoot: tempDir(), sourceHome: source });
    expect(readdirSync(codexHome).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "hooks.json",
      "rules",
    ]);
  });

  test("refuses to build inside the source home", () => {
    const source = tempDir();
    mkdirSync(path.join(source, ".emet"), { recursive: true });
    expect(() => buildRunHome({ run: "r1", repoRoot: source, sourceHome: source })).toThrow(
      "refusing to build a run home inside the source Codex home",
    );
  });
});
