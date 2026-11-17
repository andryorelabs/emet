import * as fs from "node:fs";
import * as path from "node:path";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const LATEST_RELEASE_URL = "https://api.github.com/repos/andryorelabs/emet/releases/latest";

/** Resolves the latest released version, or null when it cannot be determined. */
export type FetchLatest = (signal: AbortSignal) => Promise<string | null>;

/** Inputs of {@link updateNotice}. `fetchLatest` exists so tests avoid the network. */
export interface UpdateNoticeInput {
  current: string;
  isTTY: boolean;
  json: boolean;
  now: Date;
  cacheFile: string;
  fetchLatest?: FetchLatest;
}

interface UpdateCache {
  checkedAt: string;
  latest: string;
}

const defaultFetchLatest: FetchLatest = async (signal) => {
  const response = await fetch(LATEST_RELEASE_URL, {
    signal,
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("tag_name" in body)) return null;
  return typeof body.tag_name === "string" ? body.tag_name.replace(/^v/, "") : null;
};

function readCache(cacheFile: string): UpdateCache | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { checkedAt, latest } = parsed as Partial<UpdateCache>;
    return typeof checkedAt === "string" && typeof latest === "string"
      ? { checkedAt, latest }
      : null;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, cache: UpdateCache): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  } catch {
    return;
  }
}

function parseVersion(version: string): number[] {
  const core = version.replace(/^v/, "").split("-")[0] ?? "";
  return core.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function isStale(cache: UpdateCache | null, now: Date): boolean {
  if (cache === null) return true;
  const checkedAt = Date.parse(cache.checkedAt);
  return Number.isNaN(checkedAt) || now.getTime() - checkedAt >= CHECK_INTERVAL_MS;
}

async function refreshCache(input: UpdateNoticeInput): Promise<void> {
  try {
    const fetchLatest = input.fetchLatest ?? defaultFetchLatest;
    const latest = await fetchLatest(AbortSignal.timeout(FETCH_TIMEOUT_MS));
    if (latest !== null) {
      writeCache(input.cacheFile, { checkedAt: input.now.toISOString(), latest });
    }
  } catch {
    return;
  }
}

/**
 * A one-line notice when a newer release is known, else null. Silent under
 * `--json` or without a TTY. Checks at most once a day, caches the answer, and
 * never waits on the network: a stale cache triggers a background refresh and
 * the notice reflects what the cache held at call time.
 */
export function updateNotice(input: UpdateNoticeInput): Promise<string | null> {
  if (input.json || !input.isTTY) return Promise.resolve(null);
  const cache = readCache(input.cacheFile);
  if (isStale(cache, input.now)) void refreshCache(input);
  if (cache === null || !isNewer(cache.latest, input.current)) return Promise.resolve(null);
  return Promise.resolve(`emet ${cache.latest} is available (you have ${input.current}).`);
}
