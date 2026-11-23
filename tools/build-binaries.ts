import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeModule } from "./build-embedded-tree";

export const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
] as const;

export type BuildTarget = (typeof TARGETS)[number];

const repoRoot = path.join(import.meta.dir, "..");
const DEV_VERSION = "0.0.0-dev";

/** `emet-<os>-<arch>` for a `bun-<os>-<arch>` target. */
export function binaryName(target: BuildTarget): string {
  return `emet-${target.slice("bun-".length)}`;
}

/** Reads `.claude-plugin/plugin.json` `version`; absent file or field means `0.0.0-dev`. */
export function readPluginVersion(root: string = repoRoot): string {
  const manifestPath = path.join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return DEV_VERSION;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    return DEV_VERSION;
  }
  return typeof manifest.version === "string" && manifest.version !== ""
    ? manifest.version
    : DEV_VERSION;
}

/** Parses `--target` and `--outdir`; no `--target` means all four. */
export function parseArguments(argv: readonly string[]): {
  targets: readonly BuildTarget[];
  outdir: string;
} {
  let outdir = "dist";
  let requested: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--target" && flag !== "--outdir") throw new Error(`unknown argument "${flag}"`);
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--target") requested = value;
    else outdir = value;
    index += 1;
  }
  if (requested === undefined) return { targets: TARGETS, outdir };
  const target = TARGETS.find((candidate) => candidate === requested);
  if (!target) {
    throw new Error(`unsupported target "${requested}"; use one of ${TARGETS.join(", ")}`);
  }
  return { targets: [target], outdir };
}

/**
 * Compiles the emet CLI for one target into `<outdir>/emet-<os>-<arch>`; returns the path.
 * `build` defaults to `Bun.build`. The binary never auto-loads the working directory's `.env`:
 * emet runs inside other repos, and their secrets (an encrypted `GITHUB_TOKEN`, for example)
 * must not reach `gh`.
 */
export async function buildBinary(
  target: BuildTarget,
  outdir: string,
  version: string,
  build: (config: Bun.BuildConfig) => Promise<Bun.BuildOutput> = Bun.build,
): Promise<string> {
  const outfile = path.resolve(outdir, binaryName(target));
  const result = await build({
    entrypoints: [path.join(repoRoot, "emet", "bin", "emet.ts")],
    compile: { target, outfile, autoloadDotenv: false },
    define: { FORGE_BUILD_VERSION: JSON.stringify(version) },
  });
  if (!result.success) {
    throw new Error(`build failed for ${target}:\n${result.logs.map(String).join("\n")}`);
  }
  return outfile;
}

/** Entry point: builds every requested target in turn and logs each output path. `build` and `log` default to the real compile and `console.log`. */
export async function main(
  argv: readonly string[],
  build: typeof buildBinary = buildBinary,
  log: (message: string) => void = console.log,
): Promise<void> {
  const { targets, outdir } = parseArguments(argv);
  writeModule();
  const version = readPluginVersion();
  for (const target of targets) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: one compile at a time keeps memory bounded
    log(await build(target, outdir, version));
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
