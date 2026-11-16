import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeApproval } from "./approve";
import { evaluateRunGate } from "./preflight";

const spec = "- **S1**: does a thing. Scenario: when x then y.\n";

function approvedRun(ticketsJson: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "preflight-gate-extra-"));
  writeFileSync(path.join(directory, "spec.md"), spec);
  writeFileSync(path.join(directory, "tickets.json"), ticketsJson);
  writeApproval({
    approvalPath: path.join(directory, "approval.json"),
    specPath: path.join(directory, "spec.md"),
    ticketsPath: path.join(directory, "tickets.json"),
  });
  return directory;
}

describe("evaluateRunGate ticket file shapes", () => {
  const ticket = {
    id: "T1",
    covers: ["S1"],
    surfaces: ["a.ts"],
    wave: 1,
    blockedBy: [],
  };

  test("accepts the {tickets: [...]} wrapper form", () => {
    const gate = evaluateRunGate(approvedRun(JSON.stringify({ tickets: [ticket] })), {
      inlineMaxLines: 100,
    });
    expect(gate.failures).toEqual([]);
  });

  test("keeps numeric newSurfaceLines and defaults wave and lists when omitted", () => {
    const gate = evaluateRunGate(
      approvedRun(
        JSON.stringify([{ id: "T1", covers: ["S1"], surfaces: ["a.ts"], newSurfaceLines: 5 }]),
      ),
      { inlineMaxLines: 100 },
    );
    expect(gate.failures).toEqual([]);
  });

  test("reports a tickets file that is neither an array nor a wrapper object", () => {
    const gate = evaluateRunGate(approvedRun(JSON.stringify("nope")), { inlineMaxLines: 100 });
    expect(gate.failures).toEqual([
      'validate: tickets file must be an array (or {"tickets": [...]})',
    ]);
  });

  test("reports a ticket entry without an id by its index", () => {
    const gate = evaluateRunGate(approvedRun(JSON.stringify([ticket, 42])), {
      inlineMaxLines: 100,
    });
    expect(gate.failures).toEqual(['validate: ticket 1 needs an "id"']);
  });

  test("reports a tickets file that is not valid JSON", () => {
    const gate = evaluateRunGate(approvedRun("{not json"), { inlineMaxLines: 100 });
    expect(gate.failures).toHaveLength(1);
    expect(gate.failures[0]).toStartWith("validate:");
  });
});
