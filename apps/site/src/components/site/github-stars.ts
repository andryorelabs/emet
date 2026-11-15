/**
 * The GitHub repository API endpoint the build reads the star count from.
 */
const GITHUB_REPO_API_URL = "https://api.github.com/repos/andryorelabs/emet";

/**
 * The same-origin nginx proxy of the repository API the page refreshes from.
 */
const GITHUB_STARS_ENDPOINT = "/api/github-stars";

/**
 * The part of `fetch` the star count code uses, so tests need no full `fetch`.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The part of a star link element the refresh writes to.
 */
interface StarLink {
  lang: string;
  title: string;
  dataset: DOMStringMap;
  querySelector(selector: string): { hidden: boolean; textContent: string | null } | null;
}

/**
 * The part of a document the refresh reads star links from.
 */
export interface StarRoot {
  querySelectorAll(selector: string): Iterable<StarLink>;
}

/**
 * Reads the star count out of a GitHub repository API response, or null when
 * the payload is not an object with a non-negative integer `stargazers_count`.
 */
export function parseStarsResponse(json: unknown): number | null {
  if (typeof json !== "object" || json === null) return null;
  const count = (json as { stargazers_count?: unknown }).stargazers_count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
  return count;
}

/**
 * Formats a star count compactly: exact below 1000, then thousands with one
 * decimal under 10k ("1.2k") and none from 10k ("12k"), dropping a ".0".
 */
export function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  const rounded = thousands < 10 ? Math.round(thousands * 10) / 10 : Math.round(thousands);
  return `${rounded}k`;
}

/**
 * Fetches the star count once for the build. Any failure (network, status,
 * malformed JSON) yields null so the build never fails on it.
 */
export async function fetchBuildStarCount(fetchImpl: FetchLike = fetch): Promise<number | null> {
  try {
    const response = await fetchImpl(GITHUB_REPO_API_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "emet-site-build" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseStarsResponse(await response.json());
  } catch {
    return null;
  }
}

let buildStarCount: Promise<number | null> | undefined;

/**
 * The build's star count, fetched once and shared by every page and header.
 */
export function getBuildStarCount(): Promise<number | null> {
  buildStarCount ??= fetchBuildStarCount();
  return buildStarCount;
}

/**
 * Refreshes every star count element of the page from the same-origin proxy.
 * A failed request or malformed JSON leaves the build-time value untouched.
 */
export async function refreshStarCounts(
  root: StarRoot,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(GITHUB_STARS_ENDPOINT, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const count = parseStarsResponse(await response.json());
    if (count === null) return;
    for (const link of root.querySelectorAll("[data-github-stars-link]")) {
      const label = link.querySelector("[data-github-stars]");
      if (label) {
        label.hidden = false;
        label.textContent = formatStarCount(count);
      }
      const template = link.dataset.starsTemplate;
      if (template) link.title = template.replace("{count}", count.toLocaleString(link.lang));
    }
  } catch {
    return;
  }
}
