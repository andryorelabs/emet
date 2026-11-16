import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { SITE_ORIGIN } from "../seo/alternates";
import { securityTxt, securityTxtExpiry } from "./security-txt";

const securityPolicy = readFileSync(
  new URL("../../../../.github/SECURITY.md", import.meta.url),
  "utf8",
);

describe("securityTxt", () => {
  const body = securityTxt(new Date("2026-06-30T00:00:00.000Z"));
  const fields = body
    .trim()
    .split("\n")
    .map((line) => line.slice(0, line.indexOf(":")));

  test("has the RFC 9116 required fields, Expires once", () => {
    expect(fields).toContain("Contact");
    expect(fields.filter((field) => field === "Expires")).toHaveLength(1);
    expect(body).toContain("Expires: 2026-06-30T00:00:00.000Z");
    expect(body.endsWith("\n")).toBe(true);
  });

  test("lists the contacts SECURITY.md gives and links the policy", () => {
    expect(securityPolicy).toContain(
      "https://github.com/andryorelabs/emet/security/advisories/new",
    );
    expect(securityPolicy).toContain("mailto:hello@andryore.dev");
    expect(body).toContain("Contact: https://github.com/andryorelabs/emet/security/advisories/new");
    expect(body).toContain("Contact: mailto:hello@andryore.dev");
    expect(body).toContain(
      "Policy: https://github.com/andryorelabs/emet/blob/main/.github/SECURITY.md",
    );
  });

  test("names its canonical URL", () => {
    expect(body).toContain(`Canonical: ${SITE_ORIGIN}/.well-known/security.txt`);
  });
});

describe("securityTxtExpiry", () => {
  test("expires 180 days after the build, under the one-year limit", () => {
    expect(securityTxtExpiry(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe(
      "2026-06-30T00:00:00.000Z",
    );
  });
});
