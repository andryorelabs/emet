import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { isObject } from "./narrow";
import {
  MASCOT_PLUGIN_ID,
  SETUP_CATALOG,
  createCatalog,
  askNothing,
  createPrompter,
  noticeMarkerPath,
  realSetupEnv,
  run,
  runSetup,
  showNoticeOnce,
  type SetupEnv,
  type SetupItem,
} from "./setup";

const originalExitCode = process.exitCode;
let directory = "";

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-setup-"));
});

afterEach(() => {
  process.exitCode = originalExitCode;
  rmSync(directory, { recursive: true, force: true });
});

interface FakeEnv extends SetupEnv {
  calls: string[][];
  logs: string[];
  downloads: string[];
}

function fakeEnv(
  overrides: Partial<SetupEnv> & { exitCodes?: Record<string, number> } = {},
): FakeEnv {
  const calls: string[][] = [];
  const logs: string[] = [];
  const downloads: string[] = [];
  const { exitCodes: codes = {}, ...rest } = overrides;
  return {
    calls,
    logs,
    downloads,
    commandExists: () => Promise.resolve(true),
    run: (argv) => {
      calls.push([...argv]);
      return Promise.resolve(codes[argv.join(" ")] ?? 0);
    },
    probe: (argv) => {
      calls.push([...argv]);
      return Promise.resolve(codes[argv.join(" ")] ?? 0);
    },
    capture: () => Promise.resolve(""),
    pathExists: () => false,
    download: (url, destination) => {
      downloads.push(`${url} -> ${destination}`);
      return Promise.resolve();
    },
    log: (line) => {
      logs.push(line);
    },
    now: () => new Date("2026-11-19T00:00:00.000Z"),
    homeDir: directory,
    ...rest,
  };
}

const ask = (): Promise<string> => Promise.reject(new Error("must not prompt"));

function noop(): void {
  return undefined;
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

function parseObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed)) throw new TypeError("not an object");
  return parsed;
}

function itemOf(catalog: readonly SetupItem[], id: string): SetupItem {
  const found = catalog.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no item ${id}`);
  return found;
}

function stubItem(
  id: SetupItem["id"],
  behaviour: { present?: boolean; fail?: boolean; defaultOn?: boolean },
) {
  const installed: string[] = [];
  const item: SetupItem = {
    id,
    label: id,
    defaultOn: behaviour.defaultOn ?? false,
    detect: () => Promise.resolve(behaviour.present === true),
    install: () => {
      installed.push(id);
      return behaviour.fail === true ? Promise.reject(new Error("boom")) : Promise.resolve();
    },
  };
  return { item, installed };
}

describe("createCatalog", () => {
  test("lists the six items with mattpocock-skills as the only default", () => {
    const catalog = createCatalog(fakeEnv());
    expect(catalog.map((item) => item.id)).toEqual([
      "mattpocock-skills",
      "engram",
      "mascot",
      "orca-pet",
      "gh-auth",
      "claude-settings",
    ]);
    expect(catalog.filter((item) => item.defaultOn).map((item) => item.id)).toEqual([
      "mattpocock-skills",
    ]);
  });

  test("plugin items detect through claude plugin list and install via the marketplace", async () => {
    const env = fakeEnv({
      capture: () => Promise.resolve(`❯ ${MASCOT_PLUGIN_ID}\n  Status: enabled\n`),
    });
    const catalog = createCatalog(env);
    expect(await itemOf(catalog, "mascot").detect()).toBe(true);
    expect(await itemOf(catalog, "mattpocock-skills").detect()).toBe(false);
    await itemOf(catalog, "mattpocock-skills").install();
    await itemOf(catalog, "mascot").install();
    expect(env.calls.map((call) => call.slice(0, 4).join(" "))).toEqual([
      "claude plugin marketplace add",
      "claude plugin install mattpocock-skills@claude-plugins-official",
      "claude plugin marketplace add",
      "claude plugin install emet-mascot@emet-marketplace",
    ]);
  });

  test("a failed plugin install throws while a failed marketplace add does not", async () => {
    const env = fakeEnv({ exitCodes: { "claude plugin install emet-mascot@emet-marketplace": 1 } });
    expect(await failureOf(itemOf(createCatalog(env), "mascot").install())).toContain("exited 1");
  });

  test("engram installs through brew then runs engram setup claude-code", async () => {
    const env = fakeEnv();
    const engram = itemOf(createCatalog(env), "engram");
    expect(await engram.detect()).toBe(false);
    await engram.install();
    expect(env.calls).toEqual([
      ["brew", "install", "gentleman-programming/tap/engram"],
      ["engram", "setup", "claude-code"],
    ]);
  });

  test("engram is present only when the binary and the plugin are both found", async () => {
    const withPlugin = fakeEnv({
      capture: () => Promise.resolve("❯ engram@engram\n  Status: enabled\n"),
    });
    expect(await itemOf(createCatalog(withPlugin), "engram").detect()).toBe(true);
    const withoutBinary = fakeEnv({
      commandExists: () => Promise.resolve(false),
      capture: () => Promise.resolve("❯ engram@engram\n  Status: enabled\n"),
    });
    expect(await itemOf(createCatalog(withoutBinary), "engram").detect()).toBe(false);
  });

  test("engram without brew fails with a pointer to the install docs", async () => {
    const env = fakeEnv({ commandExists: () => Promise.resolve(false) });
    expect(await failureOf(itemOf(createCatalog(env), "engram").install())).toContain(
      "INSTALLATION.md",
    );
    expect(env.calls).toEqual([]);
  });

  test("orca-pet downloads both bundle files and tells the user to import them", async () => {
    const env = fakeEnv();
    const pet = itemOf(createCatalog(env), "orca-pet");
    expect(await pet.detect()).toBe(false);
    await pet.install();
    expect(env.downloads).toHaveLength(2);
    expect(env.downloads[0]).toContain("pet.json");
    expect(env.downloads[1]).toContain("spritesheet.webp");
    expect(env.logs[0]).toContain("Import");
    const present = fakeEnv({ pathExists: () => true });
    expect(await itemOf(createCatalog(present), "orca-pet").detect()).toBe(true);
  });

  test("gh-auth detects with gh auth status and installs with gh auth login", async () => {
    const env = fakeEnv({ exitCodes: { "gh auth status": 1 } });
    const ghAuth = itemOf(createCatalog(env), "gh-auth");
    expect(await ghAuth.detect()).toBe(false);
    await ghAuth.install();
    expect(env.calls).toEqual([
      ["gh", "auth", "status"],
      ["gh", "auth", "login"],
    ]);
  });

  test("claude-settings backs up, prints the backup path and then detects as present", async () => {
    const settingsPath = path.join(directory, ".claude", "settings.json");
    const env = fakeEnv();
    const settings = itemOf(createCatalog(env), "claude-settings");
    expect(await settings.detect()).toBe(false);
    await settings.install();
    expect(env.logs[0]).toContain("Created");
    expect(await settings.detect()).toBe(true);
    expect(parseObject(readFileSync(settingsPath, "utf8")).model).toBe("opusplan");
    writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }));
    await settings.install();
    expect(env.logs[1]).toContain("Backed up");
    expect(env.logs[1]).toContain(".bak-2026-11-19T00-00-00-000Z");
  });
});

describe("runSetup", () => {
  const none = { yes: false, with: [], tty: false };

  test("without a TTY, --yes or --with it installs nothing", async () => {
    const { item, installed } = stubItem("engram", {});
    const results = await runSetup(none, { catalog: [item], ask });
    expect(results).toEqual([{ id: "engram", status: "skipped" }]);
    expect(installed).toEqual([]);
  });

  test("the prompter is released before the first install runs", async () => {
    const order: string[] = [];
    const { item } = stubItem("engram", {});
    const watched: SetupItem = {
      ...item,
      install: () => {
        order.push("install");
        return Promise.resolve();
      },
    };
    await runSetup(
      { ...none, with: ["engram"] },
      {
        catalog: [watched],
        ask,
        release: () => {
          order.push("release");
        },
      },
    );
    expect(order).toEqual(["release", "install"]);
  });

  test("--with installs exactly the named items and never asks", async () => {
    const first = stubItem("engram", {});
    const second = stubItem("mascot", {});
    const results = await runSetup(
      { ...none, with: ["engram"] },
      { catalog: [first.item, second.item], ask },
    );
    expect(results.map((result) => result.status)).toEqual(["installed", "skipped"]);
    expect(second.installed).toEqual([]);
  });

  test("--yes installs the default-on items only", async () => {
    const defaults = stubItem("mattpocock-skills", { defaultOn: true });
    const optional = stubItem("engram", {});
    const results = await runSetup(
      { ...none, yes: true },
      { catalog: [defaults.item, optional.item], ask },
    );
    expect(results.map((result) => result.status)).toEqual(["installed", "skipped"]);
  });

  test("an item already present is reported without installing", async () => {
    const { item, installed } = stubItem("engram", { present: true });
    const results = await runSetup({ ...none, with: ["engram"] }, { catalog: [item], ask });
    expect(results).toEqual([{ id: "engram", status: "already-present" }]);
    expect(installed).toEqual([]);
  });

  test("one failure does not stop the remaining steps", async () => {
    const failing = stubItem("engram", { fail: true });
    const after = stubItem("mascot", {});
    const results = await runSetup(
      { ...none, with: ["engram", "mascot"] },
      { catalog: [failing.item, after.item], ask },
    );
    expect(results).toEqual([
      { id: "engram", status: "failed", detail: "boom" },
      { id: "mascot", status: "installed" },
    ]);
  });

  test("an unknown name in --with is reported as failed", async () => {
    const { item } = stubItem("engram", {});
    const results = await runSetup({ ...none, with: ["nope"] }, { catalog: [item], ask });
    expect(results).toContainEqual({ id: "nope", status: "failed", detail: "unknown item" });
  });

  test("with a TTY it prompts per item, honouring defaults and answers", async () => {
    const defaults = stubItem("mattpocock-skills", { defaultOn: true });
    const optional = stubItem("engram", {});
    const declined = stubItem("mascot", { defaultOn: true });
    const accepted = stubItem("gh-auth", {});
    const answers = ["", "", "n", "YES"];
    const questions: string[] = [];
    const results = await runSetup(
      { yes: false, with: [], tty: true },
      {
        catalog: [defaults.item, optional.item, declined.item, accepted.item],
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(answers.shift() ?? "");
        },
      },
    );
    expect(results.map((result) => result.status)).toEqual([
      "installed",
      "skipped",
      "skipped",
      "installed",
    ]);
    expect(questions[0]).toContain("[Y/n]");
    expect(questions[1]).toContain("[y/N]");
  });
});

describe("createPrompter", () => {
  test("reads answers line by line and returns empty text at end of input", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const written: string[] = [];
    output.on("data", (chunk: Buffer) => written.push(chunk.toString()));
    const prompter = createPrompter(input, output);
    input.write("y\n");
    input.end("n\n");
    expect(await prompter.ask("first? ")).toBe("y");
    expect(await prompter.ask("second? ")).toBe("n");
    expect(await prompter.ask("third? ")).toBe("");
    prompter.close();
    expect(written.join("")).toBe("first? second? third? ");
  });
});

describe("notice", () => {
  test("marker lives under the data directory, falling back to ~/.emet", () => {
    expect(noticeMarkerPath("/data", "/home/x")).toBe("/data/setup-notice-shown");
    expect(noticeMarkerPath("", "/home/x")).toBe("/home/x/.emet/setup-notice-shown");
    expect(noticeMarkerPath(undefined, "/home/x")).toBe("/home/x/.emet/setup-notice-shown");
  });

  test("prints once, writes the marker and stays quiet afterwards", () => {
    const marker = path.join(directory, "data", "setup-notice-shown");
    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
    };
    expect(showNoticeOnce(marker, log)).toBe(true);
    expect(existsSync(marker)).toBe(true);
    expect(showNoticeOnce(marker, log)).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("/emet:setup");
  });
});

describe("realSetupEnv", () => {
  test("run returns the exit code and 127 for a missing binary", async () => {
    expect(await realSetupEnv.run(["true"])).toBe(0);
    expect(await realSetupEnv.run(["false"])).toBe(1);
    expect(await realSetupEnv.run(["emet-no-such-binary-xyz"])).toBe(127);
  });

  test("probe returns the exit code without printing", async () => {
    expect(await realSetupEnv.probe(["true"])).toBe(0);
    expect(await realSetupEnv.probe(["false"])).toBe(1);
    expect(await realSetupEnv.probe(["emet-no-such-binary-xyz"])).toBe(127);
  });

  test("capture returns stdout and an empty string for a missing binary", async () => {
    expect((await realSetupEnv.capture(["echo", "hi"])).trim()).toBe("hi");
    expect(await realSetupEnv.capture(["emet-no-such-binary-xyz"])).toBe("");
  });

  test("commandExists, pathExists, now, log and homeDir are wired to the host", async () => {
    expect(await realSetupEnv.commandExists("sh")).toBe(true);
    expect(realSetupEnv.pathExists(directory)).toBe(true);
    expect(realSetupEnv.now()).toBeInstanceOf(Date);
    expect(realSetupEnv.homeDir).toBe(os.homedir());
    const spy = spyOn(console, "log").mockImplementation(noop);
    realSetupEnv.log("hello");
    expect(spy).toHaveBeenCalledWith("hello");
    spy.mockRestore();
  });

  test("download writes the response body and rejects a failing status", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/ok"
          ? new Response("payload")
          : new Response("no", { status: 404 }),
    });
    try {
      const destination = path.join(directory, "deep", "file.txt");
      await realSetupEnv.download(`${server.url.href}ok`, destination);
      expect(readFileSync(destination, "utf8")).toBe("payload");
      expect(
        await failureOf(realSetupEnv.download(`${server.url.href}missing`, destination)),
      ).toContain("404");
    } finally {
      await server.stop(true);
    }
  });

  test("the real catalog has the six items", () => {
    expect(SETUP_CATALOG).toHaveLength(6);
  });
});

function capture() {
  const out: string[] = [];
  const errors: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.join(" "));
  });
  const error = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    errors.push(parts.join(" "));
  });
  return {
    out,
    errors,
    restore: () => {
      log.mockRestore();
      error.mockRestore();
    },
  };
}

describe("run", () => {
  test("without a TTY and without --with it installs nothing and prints the catalog", async () => {
    const output = capture();
    await run([]);
    output.restore();
    const text = output.out.join("\n");
    expect(text).toContain("mattpocock-skills");
    expect(text).toContain("claude-settings");
    expect(process.exitCode).toBe(originalExitCode);
  });

  test("--list --json prints an envelope with the catalog", async () => {
    const output = capture();
    await run(["--list", "--json"]);
    output.restore();
    const parsed = parseObject(output.out.join("\n"));
    expect(Array.isArray(parsed.catalog)).toBe(true);
    expect("ok" in parsed).toBe(false);
  });

  test("--with an unknown item reports failed and exits 1", async () => {
    const output = capture();
    await run(["--with", "nope"]);
    output.restore();
    expect(output.out.join("\n")).toContain("failed\tnope: unknown item");
    expect(process.exitCode).toBe(1);
  });

  test("--with an unknown item under --json prints the results envelope", async () => {
    const output = capture();
    await run(["--with", "nope", "--json"]);
    expect(Array.isArray(parseObject(output.out.join("\n")).results)).toBe(true);
    expect(output.out.join("\n")).toContain('"detail": "unknown item"');
  });

  test("--notice prints the notice once under --data-dir", async () => {
    const output = capture();
    try {
      await run(["--notice", "--data-dir", directory]);
      await run(["--notice", "--data-dir", directory]);
    } finally {
      output.restore();
    }
    expect(output.out).toHaveLength(1);
    expect(parseObject(output.out[0] ?? "").systemMessage).toContain("/emet:setup");
    expect(existsSync(path.join(directory, "setup-notice-shown"))).toBe(true);
  });

  test("an unexpected error exits 2 and reports on stderr, also under --json", async () => {
    const blocker = path.join(directory, "file");
    writeFileSync(blocker, "x");
    const dataDirectory = path.join(blocker, "child");
    const output = capture();
    try {
      await run(["--notice", "--data-dir", dataDirectory]);
      expect(process.exitCode).toBe(2);
      await run(["--notice", "--data-dir", dataDirectory, "--json"]);
    } finally {
      output.restore();
    }
    expect(output.errors).toHaveLength(2);
    expect(output.out.every((line) => !line.startsWith("{"))).toBe(true);
  });

  test("askNothing answers every question with an empty string", async () => {
    expect(await askNothing()).toBe("");
  });
});
