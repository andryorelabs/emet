import { securityTxt, securityTxtExpiry } from "../../security/security-txt";

/**
 * The RFC 9116 `security.txt`, expiring 180 days after the build.
 * @returns The plain-text response.
 */
export function GET(): Response {
  return new Response(securityTxt(securityTxtExpiry(new Date())), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
