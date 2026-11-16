import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { THEME_INIT_SCRIPT } from "../components/site/theme";
import {
  CSP_PLACEHOLDER,
  cspHeader,
  declaredScriptHashes,
  renderSecurityHeaders,
  scriptHashes,
  siteScriptHashes,
} from "./csp";

function hashOf(script: string): string {
  return `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
}

function page(script: string, declared: readonly string[]): string {
  const meta = `<meta http-equiv="content-security-policy" content="script-src 'self' ${declared.join(" ")}; style-src 'self' 'sha256-style='">`;
  return `<html><head>${meta}</head><body><script>${script}</script></body></html>`;
}

const template = readFileSync(
  new URL("../../docker/security-headers.conf", import.meta.url),
  "utf8",
);

describe("scriptHashes", () => {
  test("hashes classic and module inline scripts and skips external and data blocks", () => {
    const html =
      '<script>a()</script><script src="/x.js"></script><script type="application/ld+json">{}</script><script type="module">b()</script><script type="text/javascript">c()</script>';
    expect(scriptHashes(html)).toEqual([hashOf("a()"), hashOf("b()"), hashOf("c()")]);
  });

  test("hashes a script whose opening tag carries other attributes", () => {
    expect(scriptHashes('<script aria-hidden="true">d()</script>')).toEqual([hashOf("d()")]);
  });

  test("ignores script-looking text inside a script body and inside attributes", () => {
    const html =
      '<script>const s = "<script lang=ts>x</script>"</script><div data-code="<script>y</script>"></div>';
    expect(scriptHashes(html)).toEqual([hashOf('const s = "<script lang=ts>x')]);
  });

  test("hashes an unterminated script up to the end of the document", () => {
    expect(scriptHashes("<p></p><script>e()")).toEqual([hashOf("e()")]);
  });

  test("matches the hash the theme script is declared with", () => {
    expect(scriptHashes(`<script>${THEME_INIT_SCRIPT}</script>`)).toEqual([
      hashOf(THEME_INIT_SCRIPT),
    ]);
  });
});

describe("declaredScriptHashes", () => {
  test("reads the hashes of the script-src directive of the meta policy only", () => {
    expect(declaredScriptHashes(page("a()", ["'sha256-one='", "'sha256-two='"]))).toEqual([
      "'sha256-one='",
      "'sha256-two='",
    ]);
  });

  test("returns nothing without a meta policy or a script-src directive", () => {
    expect(declaredScriptHashes("<html></html>")).toEqual([]);
    expect(
      declaredScriptHashes(
        `<meta http-equiv="content-security-policy" content="style-src 'sha256-x='">`,
      ),
    ).toEqual([]);
  });
});

describe("siteScriptHashes", () => {
  test("returns the sorted, de-duplicated hashes of every page", () => {
    const pages = [
      { file: "index.html", html: page("b()", [hashOf("b()")]) },
      { file: "es/index.html", html: page("a()", [hashOf("a()")]) },
      { file: "de/index.html", html: page("b()", [hashOf("b()")]) },
    ];
    expect(siteScriptHashes(pages)).toEqual([hashOf("a()"), hashOf("b()")].toSorted());
  });

  test("fails naming the page when an inline script changes without its hash", () => {
    const pages = [
      { file: "index.html", html: page("a()", [hashOf("a()")]) },
      { file: "docs/index.html", html: page("changed()", [hashOf("a()")]) },
    ];
    expect(() => siteScriptHashes(pages)).toThrow(
      `Inline scripts missing from the CSP:\ndocs/index.html ${hashOf("changed()")}`,
    );
  });
});

describe("cspHeader", () => {
  const header = cspHeader(["'sha256-b='", "'sha256-a='", "'sha256-b='"]);

  test("allows only same-origin scripts, WebAssembly and the hashed inline scripts", () => {
    expect(header).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-a=' 'sha256-b=';");
  });

  test("keeps the directives a meta policy cannot carry", () => {
    for (const directive of [
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ]) {
      expect(header).toContain(directive);
    }
  });

  test("refuses an empty hash list, which would block every inline script", () => {
    expect(() => cspHeader([])).toThrow("No inline script hashes");
  });
});

describe("renderSecurityHeaders", () => {
  test("puts the policy into the Content-Security-Policy line of the template", () => {
    const rendered = renderSecurityHeaders(template, cspHeader(["'sha256-a='"]));
    expect(rendered).not.toContain(CSP_PLACEHOLDER);
    expect(rendered).toContain(
      `add_header Content-Security-Policy "${cspHeader(["'sha256-a='"])}" always;`,
    );
    expect(rendered).toContain('add_header X-Content-Type-Options "nosniff" always;');
  });

  test("refuses a template without the placeholder", () => {
    expect(() => renderSecurityHeaders("add_header X 1;", "x")).toThrow(CSP_PLACEHOLDER);
  });
});
