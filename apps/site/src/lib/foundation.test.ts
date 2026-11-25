import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SITE_DIRECTORY = join(import.meta.dir, "..", "..");

describe("shadcn foundation", () => {
  test("resolves a vendored ui component and the cn helper through the @ alias", () => {
    expect(cn(buttonVariants(), "px-4")).toContain("px-4");
  });

  test("documents the shadcn stack and links ADR-0045 in the Website guide", () => {
    const guide = readFileSync(join(SITE_DIRECTORY, "AGENTS.md"), "utf8");
    expect(guide).toContain("0045-website-on-shadcn-base-nova-with-react-islands.md");
    expect(guide).toContain("components.json");
  });

  test("declares the base-nova style in components.json", () => {
    const configuration: unknown = JSON.parse(
      readFileSync(join(SITE_DIRECTORY, "components.json"), "utf8"),
    );
    expect(configuration).toMatchObject({ style: "base-nova" });
  });
});
