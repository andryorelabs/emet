import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FORGE_VERSION, isCompiledBinary, readSchema, readTemplate } from "./assets";

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

  test("source runs report the dev version and are not compiled", () => {
    expect(FORGE_VERSION).toBe("0.0.0-dev");
    expect(isCompiledBinary()).toBe(false);
  });
});
