import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  appendComment,
  computeFrontier,
  listTickets,
  parseTicketId,
  parseTrackerFile,
  resolveTrackerRoot,
  setStatusLine,
  ticketId,
  TRACKER_STATUSES,
} from "./tracker-files";

const created: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "tracker-files-")));
  created.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writeTicket(root: string, slug: string, name: string, content: string): void {
  const directory = path.join(root, ".scratch", slug, "issues");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), content);
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  const result = await Bun.$`git -C ${cwd} ${args}`.nothrow().quiet();
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
}

describe("parseTrackerFile", () => {
  test("parses plain metadata lines", () => {
    const parsed = parseTrackerFile(
      "# Parser\n\nStatus: ready-for-agent\nBlocked by: 01, 03\n\n## What\n\nDo it.\n",
    );
    expect(parsed.title).toBe("Parser");
    expect(parsed.status).toBe("ready-for-agent");
    expect(parsed.blockedBy).toEqual(["01", "03"]);
    expect(parsed.body).toBe("## What\n\nDo it.");
    expect(parsed.comments).toEqual([]);
  });

  test("parses bold metadata and trailing text", () => {
    const parsed = parseTrackerFile(
      "# T\n\n**Status:** Ready-For-Agent\n**Blocked by:** None (can start immediately)\n",
    );
    expect(parsed.status).toBe("ready-for-agent");
    expect(parsed.blockedBy).toEqual([]);
  });

  test("accepts mixed case, bold colon placement and dash annotations", () => {
    const parsed = parseTrackerFile("# T\n\n**status**: done\nBLOCKED BY: 01 — parser, 02\n");
    expect(parsed.status).toBe("done");
    expect(parsed.blockedBy).toEqual(["01", "02"]);
  });

  test("unknown status is null", () => {
    expect(parseTrackerFile("# T\nStatus: bogus\n").status).toBeNull();
    expect(parseTrackerFile("# T\n").status).toBeNull();
  });

  test("splits comments under the heading", () => {
    const parsed = parseTrackerFile(
      "# T\nStatus: done\n\n## Comments\n\n### a — x\n\nfirst\n\n### b — y\n\nsecond\n",
    );
    expect(parsed.comments).toEqual(["### a — x\n\nfirst", "### b — y\n\nsecond"]);
    expect(parsed.body).toBe("");
  });
});

describe("setStatusLine and appendComment", () => {
  test("replaces a plain status line", () => {
    expect(setStatusLine("# T\n\nStatus: ready-for-agent\n", "done")).toBe("# T\n\nStatus: done\n");
  });

  test("keeps the bold form", () => {
    expect(setStatusLine("# T\n\n**Status:** ready-for-agent\n", "done")).toBe(
      "# T\n\n**Status:** done\n",
    );
  });

  test("inserts after the title when absent", () => {
    const result = setStatusLine("# T\n\n## What\n", "in-review");
    expect(parseTrackerFile(result).status).toBe("in-review");
    expect(parseTrackerFile(result).title).toBe("T");
  });

  test("does not touch a Status line inside comments", () => {
    const text = "# T\n\n## Comments\n\n### h\n\nStatus: done\n";
    expect(parseTrackerFile(setStatusLine(text, "canceled")).comments).toHaveLength(1);
  });

  test("creates the Comments heading once", () => {
    const first = appendComment("# T\n\nStatus: done\n", "2026-01-01T00:00:00Z — me", "one");
    const second = appendComment(first, "2026-01-02T00:00:00Z — me", "two");
    expect(second.match(/^## Comments$/gm)).toHaveLength(1);
    expect(parseTrackerFile(second).comments).toEqual([
      "### 2026-01-01T00:00:00Z — me\n\none",
      "### 2026-01-02T00:00:00Z — me\n\ntwo",
    ]);
  });
});

describe("TRACKER_STATUSES", () => {
  test("holds the full vocabulary", () => {
    expect(TRACKER_STATUSES).toContain("ready-for-agent");
    expect(TRACKER_STATUSES).toHaveLength(11);
  });
});

describe("ticket ids", () => {
  test("round-trips", () => {
    expect(ticketId("local-tracker", "03")).toBe("local-tracker-03");
    expect(parseTicketId("local-tracker-03")).toEqual({ slug: "local-tracker", nn: "03" });
    expect(parseTicketId("a-b-100")).toEqual({ slug: "a-b", nn: "100" });
  });

  test("rejects non-ticket ids", () => {
    expect(parseTicketId("local-tracker")).toBeNull();
    expect(parseTicketId("x-1")).toBeNull();
    expect(parseTicketId("-01")).toBeNull();
  });
});

describe("listTickets and computeFrontier", () => {
  test("missing directory is empty", async () => {
    expect(await listTickets(makeTemporaryDirectory(), "none")).toEqual([]);
  });

  test("orders by number and omits a ticket blocked by an in-review one", async () => {
    const root = makeTemporaryDirectory();
    writeTicket(
      root,
      "feat",
      "02-second.md",
      "# Second\nStatus: ready-for-agent\nBlocked by: 01\n",
    );
    writeTicket(root, "feat", "01-first.md", "# First\nStatus: in-review\nBlocked by: None\n");
    writeTicket(root, "feat", "notes.md", "# ignored\n");
    const tickets = await listTickets(root, "feat");
    expect(tickets.map((ticket) => ticket.id)).toEqual(["feat-01", "feat-02"]);
    expect(computeFrontier(tickets)).toEqual([]);

    writeTicket(root, "feat", "01-first.md", "# First\nStatus: done\nBlocked by: None\n");
    expect(computeFrontier(await listTickets(root, "feat")).map((ticket) => ticket.id)).toEqual([
      "feat-02",
    ]);
  });

  test("a blocker that does not exist keeps the ticket out", async () => {
    const root = makeTemporaryDirectory();
    writeTicket(root, "feat", "01-a.md", "# A\nStatus: ready-for-agent\nBlocked by: 07\n");
    writeTicket(root, "feat", "02-b.md", "# B\nStatus: ready-for-agent\nBlocked by: None\n");
    expect(computeFrontier(await listTickets(root, "feat")).map((ticket) => ticket.nn)).toEqual([
      "02",
    ]);
  });

  test("resolved blockers unblock and results are ascending", async () => {
    const root = makeTemporaryDirectory();
    writeTicket(root, "feat", "03-c.md", "# C\nStatus: ready-for-agent\nBlocked by: 01\n");
    writeTicket(root, "feat", "01-a.md", "# A\nStatus: resolved\n");
    writeTicket(root, "feat", "02-b.md", "# B\nStatus: ready-for-agent\n");
    expect(computeFrontier(await listTickets(root, "feat")).map((ticket) => ticket.nn)).toEqual([
      "02",
      "03",
    ]);
  });
});

describe("resolveTrackerRoot", () => {
  test("a linked worktree resolves to the main worktree", async () => {
    const main = makeTemporaryDirectory();
    await git(main, "init", "-q", "-b", "main");
    await git(
      main,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    );
    const linked = path.join(makeTemporaryDirectory(), "linked");
    await git(main, "worktree", "add", "-q", "-b", "side", linked);
    expect(await resolveTrackerRoot(main)).toBe(main);
    expect(await resolveTrackerRoot(linked)).toBe(main);
  });

  test("rejects a directory outside a repository", () => {
    return expect(resolveTrackerRoot(makeTemporaryDirectory())).rejects.toThrow();
  });
});

describe("review regressions", () => {
  test("unparseable or title-only blockers keep the ticket out of the frontier", async () => {
    const root = makeTemporaryDirectory();
    writeTicket(root, "feat", "01-parser.md", "# Parser\nStatus: in-review\nBlocked by: None\n");
    for (const [index, value] of [
      "Parser",
      "1",
      "[01](01-parser.md)",
      "feat-01",
      "01 and 03",
      "01; 03",
    ].entries()) {
      writeTicket(
        root,
        "feat",
        `0${index + 2}-dependant.md`,
        `# Dependant\nStatus: ready-for-agent\nBlocked by: ${value}\n`,
      );
    }
    expect(computeFrontier(await listTickets(root, "feat"))).toEqual([]);
    expect(parseTrackerFile("# T\nBlocked by: Parser\n").blockedBy).toHaveLength(1);
    expect(parseTrackerFile("# T\nBlocked by: 01 and 03\n").blockedBy).toEqual(["01", "03"]);
    expect(parseTrackerFile("# T\nBlocked by: 1\n").blockedBy).toEqual(["1"]);
  });

  test("setStatusLine round-trips on a CRLF file and keeps its line endings", () => {
    const source = "# T\r\n\r\nStatus: ready-for-agent\r\n\r\nBody\r\n";
    const updated = setStatusLine(source, "done");
    expect(parseTrackerFile(updated).status).toBe("done");
    expect(
      updated
        .split("\n")
        .every((line, index, all) => index === all.length - 1 || line.endsWith("\r")),
    ).toBe(true);
    const inserted = setStatusLine("# T\r\n\r\nBody\r\n", "done");
    expect(parseTrackerFile(inserted).status).toBe("done");
  });
});
