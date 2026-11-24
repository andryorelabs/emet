import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { EMET_VERSION, embeddedTree, isCompiledBinary, readSchema, readTemplate } from "./assets";

const templatesDirectory = path.join(import.meta.dir, "..", "templates");

describe("assets", () => {
  test("readTemplate matches every file on disk", () => {
    const names = readdirSync(templatesDirectory).filter((name) => name.endsWith(".tpl"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(readTemplate(name)).toBe(readFileSync(path.join(templatesDirectory, name), "utf8"));
    }
  });

  test("readTemplate rejects an unknown name", () => {
    expect(() => readTemplate("nope.tpl")).toThrow('unknown template "nope.tpl"');
  });

  test("readSchema returns the schema file as parseable JSON", () => {
    const onDisk = readFileSync(
      path.join(import.meta.dir, "..", "schema", "emet.config.schema.json"),
      "utf8",
    );
    expect(readSchema()).toBe(onDisk);
    expect(() => {
      JSON.parse(readSchema());
    }).not.toThrow();
  });

  test("the legacy schema path stays a byte-identical copy", () => {
    const schemaDirectory = path.join(import.meta.dir, "..", "schema");
    expect(readFileSync(path.join(schemaDirectory, "forge.config.schema.json"), "utf8")).toBe(
      readSchema(),
    );
  });

  test("the agents-doc template is emet.md.tpl", () => {
    expect(readTemplate("emet.md.tpl")).toContain("TODO(emet):");
    expect(() => readTemplate("forge.md.tpl")).toThrow("unknown template");
  });

  test("embeddedTree lists the repo-relative install tree, each file byte-identical to disk", () => {
    const repoRoot = path.join(import.meta.dir, "..", "..");
    const tree = embeddedTree();
    const skillsDirectory = path.join(repoRoot, "codex", "skills");
    const expected = [
      ...["commands", "agents", "emet/reference"].flatMap((directory) =>
        readdirSync(path.join(repoRoot, directory))
          .filter((name) => name.endsWith(".md"))
          .map((name) => `${directory}/${name}`),
      ),
      "hooks/hooks.json",
      "codex/hooks.json",
      ".codex-plugin/plugin.json",
      ".claude-plugin/plugin.json",
      ...readdirSync(skillsDirectory, { recursive: true })
        .map(String)
        .filter((name) => statSync(path.join(skillsDirectory, name)).isFile())
        .map((name) => `codex/skills/${name}`),
    ].toSorted();
    expect(tree.list()).toEqual(expected);
    expect(tree.list()).toContain("commands/run.md");
    expect(tree.list()).toContain("codex/skills/run/SKILL.md");
    for (const file of tree.list()) {
      expect(tree.read(file)).toBe(readFileSync(path.join(repoRoot, file), "utf8"));
    }
  });

  test("embeddedTree read rejects a path outside the tree", () => {
    expect(() => embeddedTree().read("nope.md")).toThrow('unknown tree file "nope.md"');
  });

  test("source runs report the dev version and are not compiled", () => {
    expect(EMET_VERSION).toBe("0.0.0-dev");
    expect(isCompiledBinary()).toBe(false);
  });
});
