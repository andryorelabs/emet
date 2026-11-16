import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { renderSecurityHeadersCli, writeSecurityHeaders } from "./render-security-headers";

const workDirectory = mkdtempSync(path.join(tmpdir(), "emet-site-csp-"));
afterAll(() => {
  rmSync(workDirectory, { recursive: true, force: true });
});

function hashOf(script: string): string {
  return `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
}

function writePage(file: string, script: string): void {
  const html = `<meta http-equiv="content-security-policy" content="script-src 'self' ${hashOf(script)}"><script>${script}</script>`;
  mkdirSync(path.dirname(path.join(workDirectory, "dist", file)), { recursive: true });
  writeFileSync(path.join(workDirectory, "dist", file), html);
}

describe("writeSecurityHeaders", () => {
  test("renders the hashes of every nested page into the snippet", () => {
    writePage("index.html", "a()");
    writePage("es/docs/index.html", "b()");
    writeFileSync(path.join(workDirectory, "dist", "robots.txt"), "<script>c()</script>");
    const template = path.join(workDirectory, "template.conf");
    const output = path.join(workDirectory, "out.conf");
    writeFileSync(
      template,
      'add_header Content-Security-Policy "__CONTENT_SECURITY_POLICY__" always;',
    );

    expect(writeSecurityHeaders(path.join(workDirectory, "dist"), template, output)).toBe(2);
    const snippet = readFileSync(output, "utf8");
    expect(snippet).toContain(hashOf("a()"));
    expect(snippet).toContain(hashOf("b()"));
    expect(snippet).not.toContain(hashOf("c()"));
  });
});

describe("renderSecurityHeadersCli", () => {
  test("renders and summarises when given dist, template and output", () => {
    writePage("index.html", "a()");
    const template = path.join(workDirectory, "cli-template.conf");
    const output = path.join(workDirectory, "cli-out.conf");
    writeFileSync(template, "__CONTENT_SECURITY_POLICY__");

    expect(renderSecurityHeadersCli([path.join(workDirectory, "dist"), template, output])).toMatch(
      /^CSP: \d+ inline script hashes rendered into /,
    );
    expect(readFileSync(output, "utf8")).toContain(hashOf("a()"));
  });

  test("refuses missing arguments with the usage line", () => {
    expect(() => renderSecurityHeadersCli(["dist", "template"])).toThrow(
      "Usage: render-security-headers <dist> <template> <output>",
    );
  });
});
