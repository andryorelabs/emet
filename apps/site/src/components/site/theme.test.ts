import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { THEME_INIT_HASH, THEME_INIT_SCRIPT } from "./theme";
import { THEME_STORAGE_KEY } from "./theme-storage";

let osDark = false;
let osListeners: (() => void)[] = [];

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      get matches() {
        return osDark;
      },
      addEventListener: (_type: string, listener: () => void) => osListeners.push(listener),
    }),
  });
}

function runInitScript(): void {
  window.eval(THEME_INIT_SCRIPT);
}

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  localStorage.clear();
  osDark = false;
  osListeners = [];
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  installMatchMedia();
});

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("THEME_INIT_HASH", () => {
  test("is the sha256 of the exact script string", () => {
    const expected = `sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}`;
    expect<string>(THEME_INIT_HASH).toBe(expected);
  });

  test("the script has no template placeholder left", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("${");
  });
});

describe("shipped theme init script", () => {
  test("the CSP script-src hashes include THEME_INIT_HASH", () => {
    expect(read("../../../astro.config.ts")).toMatch(/hashes:\s*\[[^\]]*THEME_INIT_HASH/);
  });

  test("Home, 404 and docs inline exactly THEME_INIT_SCRIPT, unmodified", () => {
    const inline = /<script is:inline set:html=\{THEME_INIT_SCRIPT\}><\/script>/;
    expect(read("../../layouts/BaseLayout.astro")).toMatch(inline);
    expect(read("../docs/ThemeProvider.astro")).toMatch(inline);
  });
});

describe("the init script", () => {
  test("a stored dark choice puts class dark on html", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("a stored light choice wins over a dark OS", () => {
    osDark = true;
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    const root = document.documentElement;
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
    const colors = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute("content"),
    );
    expect(colors).toEqual(["#f4fdf6", "#f4fdf6"]);
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light",
    );
  });

  test("system sets no class and follows the OS live", () => {
    runInitScript();
    const root = document.documentElement;
    expect(root.className).toBe("");
    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.themeChoice).toBe("system");
    osDark = true;
    for (const listener of osListeners) listener();
    expect(root.dataset.theme).toBe("dark");
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light dark",
    );
  });

  test("keeps exactly two theme-color metas and one color-scheme meta", () => {
    runInitScript();
    window.dispatchEvent(new CustomEvent("emet:theme", { detail: "dark" }));
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(2);
    expect(document.querySelectorAll('meta[name="color-scheme"]').length).toBe(1);
  });

  test("an unreadable storage falls back to system", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    runInitScript();
    if (original !== undefined) Object.defineProperty(window, "localStorage", original);
    expect(document.documentElement.dataset.themeChoice).toBe("system");
  });
});
