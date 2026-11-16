import { SITE_ORIGIN } from "../seo/alternates";

const REPOSITORY_URL = "https://github.com/andryorelabs/emet";
const VALIDITY_DAYS = 180;
const DAY_MILLISECONDS = 86_400_000;

/**
 * The `Expires` date of a `security.txt` built at a given time: RFC 9116 asks
 * for less than a year, and every deploy rebuilds the file.
 * @param builtAt - The build time.
 * @returns The date 180 days after it.
 */
export function securityTxtExpiry(builtAt: Date): Date {
  return new Date(builtAt.getTime() + VALIDITY_DAYS * DAY_MILLISECONDS);
}

/**
 * The `/.well-known/security.txt` body (RFC 9116). The contacts and the policy
 * mirror `.github/SECURITY.md`.
 * @param expires - When the file stops being authoritative.
 * @returns The file contents.
 */
export function securityTxt(expires: Date): string {
  return [
    `Contact: ${REPOSITORY_URL}/security/advisories/new`,
    "Contact: mailto:hello@andryore.dev",
    `Expires: ${expires.toISOString()}`,
    `Policy: ${REPOSITORY_URL}/blob/main/.github/SECURITY.md`,
    "Preferred-Languages: en",
    `Canonical: ${SITE_ORIGIN}/.well-known/security.txt`,
    "",
  ].join("\n");
}
