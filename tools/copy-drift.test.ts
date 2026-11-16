import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

/** The B4 fields every plugin manifest carries besides its description. */
const OWNER_IDENTITY = {
  author: { name: "Andry Orellana", email: "hello@andryore.dev" },
  license: "MIT",
  homepage: "https://emet.andryore.dev",
  repository: "https://github.com/andryorelabs/emet",
  bugs: "https://github.com/andryorelabs/emet/issues",
} as const;

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * Extracts the first line of a `docs/brand/copy.md` section.
 * @param heading The section heading without the leading hashes.
 * @returns The first non-empty body line of the section.
 */
function copySection(heading: string): string {
  const lines = read("docs/brand/copy.md").split("\n");
  const start = lines.indexOf(`## ${heading}`);
  expect(start, `docs/brand/copy.md has no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const line = lines.slice(start + 1).find((candidate) => candidate.trim() !== "");
  expect(line, `docs/brand/copy.md "## ${heading}" is empty`).toBeDefined();
  return (line ?? "").replace(/^>\s*/, "").trim();
}

/**
 * Extracts the approved short description from `docs/brand/copy.md`.
 * @returns The selected short description text.
 */
function copyShortDescription(): string {
  const text = read("docs/brand/copy.md");
  const match = /^1\. "(.+)" \(selected\)$/m.exec(text);
  expect(match, "docs/brand/copy.md has no selected short description").not.toBeNull();
  return match?.[1] ?? "";
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}

function manifestDescriptions(): { file: string; description: unknown }[] {
  const plugin: unknown = JSON.parse(read(".claude-plugin/plugin.json"));
  const codex: unknown = JSON.parse(read(".codex-plugin/plugin.json"));
  const marketplace: unknown = JSON.parse(read(".claude-plugin/marketplace.json"));
  const plugins: unknown = field(marketplace, "plugins");
  const entries: unknown[] = Array.isArray(plugins) ? (plugins as unknown[]) : [];
  const emetEntry = entries.find((entry) => field(entry, "name") === "emet");
  return [
    { file: ".claude-plugin/plugin.json", description: field(plugin, "description") },
    { file: ".codex-plugin/plugin.json", description: field(codex, "description") },
    {
      file: ".claude-plugin/marketplace.json",
      description: field(emetEntry, "description"),
    },
  ];
}

describe("copy drift", () => {
  test("README slogan matches the docs/brand/copy.md tagline", () => {
    const slogan = copySection("Tagline");
    expect(read("README.md"), "README.md slogan differs from docs/brand/copy.md").toContain(
      `**${slogan}**`,
    );
  });

  test("every manifest description matches the docs/brand/copy.md short description", () => {
    const expected = copyShortDescription();
    for (const { file, description } of manifestDescriptions()) {
      expect(description, `${file} description differs from docs/brand/copy.md`).toBe(expected);
    }
  });

  test("every plugin manifest carries the B4 identity fields", () => {
    const marketplace: unknown = JSON.parse(read(".claude-plugin/marketplace.json"));
    const plugins: unknown = field(marketplace, "plugins");
    const entries: unknown[] = Array.isArray(plugins) ? (plugins as unknown[]) : [];
    const manifests: { file: string; manifest: unknown }[] = [
      {
        file: ".claude-plugin/plugin.json",
        manifest: JSON.parse(read(".claude-plugin/plugin.json")),
      },
      {
        file: ".codex-plugin/plugin.json",
        manifest: JSON.parse(read(".codex-plugin/plugin.json")),
      },
      {
        file: "mods/emet-mascot/.claude-plugin/plugin.json",
        manifest: JSON.parse(read("mods/emet-mascot/.claude-plugin/plugin.json")),
      },
      ...entries.map((entry) => ({
        file: `.claude-plugin/marketplace.json plugins[${String(field(entry, "name"))}]`,
        manifest: entry,
      })),
    ];
    expect(entries).toHaveLength(2);
    for (const { file, manifest } of manifests) {
      expect(manifest, `${file} lacks a B4 identity field`).toMatchObject(OWNER_IDENTITY);
      expect(typeof field(manifest, "description"), `${file} has no description`).toBe("string");
    }
  });

  test("the marketplace carries its owner and metadata description", () => {
    const marketplace: unknown = JSON.parse(read(".claude-plugin/marketplace.json"));
    expect(marketplace).toMatchObject({
      owner: { name: "andryorelabs" },
      metadata: { description: copyShortDescription() },
    });
  });
});
