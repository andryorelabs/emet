import * as fs from "node:fs";
import os from "node:os";
import * as path from "node:path";

import { EMET_VERSION } from "./assets";
import { isNewer } from "./update-notice";

const MARKER_FILE = "last-seen-version";
const VERSION_PATTERN = /^v?\d+\.\d+\.\d+/;
const WHATS_NEW_URL = "https://emet.andryore.dev/docs/whats-new/";

/** The marker path: `<dataDirectory>/last-seen-version` when non-empty, else `~/.emet/last-seen-version`. */
export function whatsNewMarkerPath(dataDirectory: string | undefined, homeDir: string): string {
  const directory =
    dataDirectory !== undefined && dataDirectory !== ""
      ? dataDirectory
      : path.join(homeDir, ".emet");
  return path.join(directory, MARKER_FILE);
}

function readMarker(markerPath: string): string | null {
  try {
    const version = fs.readFileSync(markerPath, "utf8").trim();
    return VERSION_PATTERN.test(version) ? version.replace(/^v/, "") : null;
  } catch {
    return null;
  }
}

function writeMarker(markerPath: string, version: string): void {
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${version}\n`);
  } catch {
    return;
  }
}

/**
 * The post-update line when the marker holds an older version than `current`,
 * else null. Always rewrites the marker with `current`; an unreadable,
 * malformed or unwritable marker yields null and never throws.
 */
export function whatsNewNotice(input: { current: string; markerPath: string }): string | null {
  const previous = readMarker(input.markerPath);
  writeMarker(input.markerPath, input.current);
  if (previous === null || !isNewer(input.current, previous)) return null;
  const anchor = input.current.replaceAll(".", "");
  return `emet updated ${previous} → ${input.current}. What's new: ${WHATS_NEW_URL}#${anchor}`;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** Entry point for `emet whats-new [--hook] [--data-dir <dir>]`; always exits 0. */
export function run(argv: string[], current: string = EMET_VERSION): Promise<void> {
  try {
    const notice = whatsNewNotice({
      current,
      markerPath: whatsNewMarkerPath(flagValue(argv, "--data-dir"), os.homedir()),
    });
    if (notice !== null) {
      console.log(argv.includes("--hook") ? JSON.stringify({ systemMessage: notice }) : notice);
    }
  } catch {
    return Promise.resolve();
  }
  return Promise.resolve();
}
