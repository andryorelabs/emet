import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { REPOSITORY_ROOT } from "../../docs/paths";
import { GET } from "./emet.config.schema.json";

describe("schema route", () => {
  test("serves the config schema byte-identical", async () => {
    const response = GET();
    const served = Buffer.from(await response.arrayBuffer());
    const source = readFileSync(path.join(REPOSITORY_ROOT, "emet/schema/emet.config.schema.json"));
    expect(served.equals(source)).toBe(true);
    expect(response.headers.get("Content-Type")).toContain("json");
  });

  test("the Website image build context carries the schema", () => {
    const dockerignore = readFileSync(path.join(REPOSITORY_ROOT, ".dockerignore"), "utf8");
    const dockerfile = readFileSync(path.join(REPOSITORY_ROOT, "apps/site/Dockerfile"), "utf8");
    expect(dockerignore.split("\n")).toContain("!emet/schema/emet.config.schema.json");
    expect(dockerfile).toContain("COPY emet/schema emet/schema");
  });

  test("a schema change redeploys the Website", () => {
    const workflow = readFileSync(
      path.join(REPOSITORY_ROOT, ".github/workflows/deploy-site.yml"),
      "utf8",
    );
    expect(workflow).toContain('- "emet/schema/**"');
  });
});
