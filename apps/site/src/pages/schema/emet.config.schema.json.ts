import { readFileSync } from "node:fs";
import path from "node:path";

import { REPOSITORY_ROOT } from "../../docs/paths";

/**
 * The `emet.config.json` JSON Schema, served byte-identical to the file the
 * CLI validates against so `$schema` can point at a public URL.
 * @returns The JSON response.
 */
export function GET(): Response {
  const body = readFileSync(path.join(REPOSITORY_ROOT, "emet/schema/emet.config.schema.json"));
  return new Response(body, {
    headers: { "Content-Type": "application/schema+json; charset=utf-8" },
  });
}
