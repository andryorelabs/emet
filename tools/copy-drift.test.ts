import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

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

  test("the Claude manifests carry the owner identity", () => {
    const identity = {
      author: { name: "Andry Orellana" },
      homepage: "https://emet.andryore.dev",
      repository: "https://github.com/andryorelabs/emet",
    };
    const plugin: unknown = JSON.parse(read(".claude-plugin/plugin.json"));
    const marketplace: unknown = JSON.parse(read(".claude-plugin/marketplace.json"));
    expect(plugin).toMatchObject(identity);
    expect(marketplace).toMatchObject({
      owner: { name: "andryorelabs" },
      plugins: [identity, {}],
    });
  });
});
