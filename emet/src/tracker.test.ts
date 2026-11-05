import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isObject } from "./narrow";

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function stringField(value: unknown, key: string): string {
  const field = isObject(value) ? value[key] : undefined;
  if (typeof field !== "string") throw new Error(`expected a string field "${key}"`);
  return field;
}

const TRACKER_ENTRY = path.join(import.meta.dir, "tracker.ts");
const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryDirectory(): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "tracker-cli-")));
  created.push(directory);
  return directory;
}

async function makeRepo(): Promise<string> {
  const repo = makeTemporaryDirectory();
  await Bun.$`git -C ${repo} init -q -b main`.quiet();
  await Bun.$`git -C ${repo} -c user.name=t -c user.email=t@t commit -q --allow-empty -m init`.quiet();
  return repo;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function tracker(cwd: string, ...args: string[]): Promise<CliResult> {
  const child = Bun.spawn([process.execPath, TRACKER_ENTRY, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

function bodyFile(text: string): string {
  const file = path.join(makeTemporaryDirectory(), "body.md");
  writeFileSync(file, text);
  return file;
}

async function seedSpec(repo: string, slug = "feat"): Promise<void> {
  const result = await tracker(
    repo,
    "create-spec",
    "--slug",
    slug,
    "--title",
    "Feature",
    "--body-file",
    bodyFile("## Specs\n- **S1**: x\n"),
  );
  expect(result.code).toBe(0);
}

async function seedTicket(repo: string, title: string, ...extra: string[]): Promise<CliResult> {
  return tracker(
    repo,
    "create-ticket",
    "--spec",
    "feat",
    "--title",
    title,
    "--body-file",
    bodyFile("Body\n"),
    ...extra,
  );
}

async function frontierIds(repo: string): Promise<string[]> {
  const result = await tracker(repo, "frontier", "--spec", "feat");
  const tickets = parseJson(result.stdout);
  if (!Array.isArray(tickets)) throw new Error("expected a JSON array");
  return tickets.map((ticket: unknown) => stringField(ticket, "id"));
}

describe("emet tracker", () => {
  test("create-spec then read returns the spec", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    const result = await tracker(repo, "read", "feat");
    expect(result.code).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(stringField(parsed, "title")).toBe("Feature");
    expect(stringField(parsed, "status")).toBe("in-progress");
    expect(stringField(parsed, "body")).toContain("## Specs");
    const again = await tracker(
      repo,
      "create-spec",
      "--slug",
      "feat",
      "--title",
      "x",
      "--body-file",
      bodyFile("b"),
    );
    expect(again.code).toBe(1);
  });

  test("frontier follows blockers and close", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    expect(stringField(parseJson((await seedTicket(repo, "First thing")).stdout), "id")).toBe(
      "feat-01",
    );
    const second = await seedTicket(repo, "Second", "--blocked-by", "01");
    expect(stringField(parseJson(second.stdout), "id")).toBe("feat-02");
    expect(await frontierIds(repo)).toEqual(["feat-01"]);
    expect((await tracker(repo, "set-state", "feat-01", "in-review")).code).toBe(0);
    expect(await frontierIds(repo)).toEqual([]);
    expect((await tracker(repo, "close", "feat-01")).code).toBe(0);
    expect(await frontierIds(repo)).toEqual(["feat-02"]);
  });

  test("closing the last ticket marks the spec done", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    await seedTicket(repo, "Only");
    await seedTicket(repo, "Other");
    await tracker(repo, "close", "feat-01");
    expect(stringField(parseJson((await tracker(repo, "read", "feat")).stdout), "status")).toBe(
      "in-progress",
    );
    await tracker(repo, "close", "feat-02", "--canceled");
    expect(stringField(parseJson((await tracker(repo, "read", "feat-02")).stdout), "status")).toBe(
      "canceled",
    );
    expect(stringField(parseJson((await tracker(repo, "read", "feat")).stdout), "status")).toBe(
      "done",
    );
  });

  test("set-state rejects values outside the vocabulary with exit 2", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    await seedTicket(repo, "One");
    expect((await tracker(repo, "set-state", "feat-01", "bogus")).code).toBe(2);
    expect((await tracker(repo, "set-state", "feat-09", "done")).code).toBe(1);
  });

  test("comment appends under a single Comments heading", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    await seedTicket(repo, "One");
    await tracker(repo, "comment", "feat-01", "--body-file", bodyFile("first"), "--author", "me");
    await tracker(repo, "comment", "feat-01", "--body-file", bodyFile("second"));
    const parsed = parseJson((await tracker(repo, "read", "feat-01")).stdout);
    expect(parsed).toHaveProperty("comments.length", 2);
    expect(parsed).toHaveProperty("comments.0", expect.stringContaining("— me"));
    expect(parsed).toHaveProperty("comments.0", expect.stringContaining("first"));
    const file = readFileSync(path.join(repo, ".scratch/feat/issues/01-one.md"), "utf8");
    expect(file.match(/^## Comments$/gm)).toHaveLength(1);
  });

  test("a linked worktree reads the main worktree's .scratch", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    await seedTicket(repo, "One");
    const linked = path.join(makeTemporaryDirectory(), "linked");
    await Bun.$`git -C ${repo} worktree add -q ${linked} -b side`.quiet();
    const result = await tracker(linked, "read", "feat-01");
    expect(result.code).toBe(0);
    expect(stringField(parseJson(result.stdout), "title")).toBe("One");
  });

  test("rejects slugs that escape .scratch", async () => {
    const repo = await makeRepo();
    const attempts = [
      ["frontier", "--spec", "../.."],
      ["read", "../.."],
      ["create-ticket", "--spec", "../x", "--title", "t", "--body-file", bodyFile("b")],
      ["create-spec", "--slug", "../x", "--title", "t", "--body-file", bodyFile("b")],
      ["set-state", "../..", "done"],
    ];
    const results = await Promise.all(attempts.map((args) => tracker(repo, ...args)));
    expect(results.map((result) => result.code)).toEqual(attempts.map(() => 2));
  });

  test("rejects two tickets sharing an NN prefix", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    await seedTicket(repo, "One");
    writeFileSync(
      path.join(repo, ".scratch/feat/issues/01-dup.md"),
      "# Dup\n\nStatus: ready-for-agent\nBlocked by: None\n",
    );
    expect((await tracker(repo, "frontier", "--spec", "feat")).code).toBe(1);
    expect((await seedTicket(repo, "Three")).code).toBe(1);
  });

  test("usage errors exit 2 and missing items exit 1", async () => {
    const repo = await makeRepo();
    expect((await tracker(repo)).code).toBe(2);
    expect((await tracker(repo, "nope")).code).toBe(2);
    expect((await tracker(repo, "frontier")).code).toBe(2);
    expect((await tracker(repo, "read", "missing")).code).toBe(1);
  });

  test("concurrent create-ticket calls get distinct numbers", async () => {
    const repo = await makeRepo();
    await seedSpec(repo);
    mkdirSync(path.join(repo, ".scratch/feat/issues"), { recursive: true });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => seedTicket(repo, `Ticket ${index}`)),
    );
    expect(results.map((result) => result.code)).toEqual(Array.from({ length: 8 }, () => 0));
    const numbers = results.map((result) => stringField(parseJson(result.stdout), "nn")).toSorted();
    expect(numbers).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
    expect(await frontierIds(repo)).toHaveLength(8);
  });
});
