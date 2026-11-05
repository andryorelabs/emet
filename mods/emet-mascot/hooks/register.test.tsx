import { expect, mock, test } from "claude-code/testing";

const BAND = {
  plugin: "emet-mascot",
  component: "AbovePrompt",
  requestId: "band",
  surface: "terminal",
} as const;

function bandProps(hasSurvey: boolean) {
  return {
    hasSurvey,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  } as const;
}

async function shownState(
  $: Parameters<Parameters<typeof test>[1]>[0],
): Promise<string | undefined> {
  const ui = await $.ui.mount({ ...BAND, props: bandProps(false) });
  const label = await ui.find({ type: "Text", text: /^ ?emet · / });
  await ui.unmount();
  return label?.text?.trim().replace("emet · ", "");
}
const FAILED_AGENT = {
  id: "a1",
  description: "broken",
  subagentType: "general-purpose",
  status: "failed",
} as const;

test("the band draws a Raster keyed mascot, and yields to a survey", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine</Text>;
  });

  const idle = await $.ui.mount({ ...BAND, props: bandProps(false) });
  expect(await idle.find({ type: "Raster", key: "mascot" })).toBeDefined();
  await idle.unmount();

  const survey = await $.ui.mount({ ...BAND, props: bandProps(true) });
  expect(await survey.find({ type: "Raster" })).toBeUndefined();
  await survey.unmount();
});

test("turn.start then turn.complete read working then done", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("agent.list", () => ({ value: [] }));
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));

  await $.turn.start({ text: "hi", turnId: "t1" });
  expect(await shownState($)).toBe("work");

  await $.turn.complete({
    reason: "answer",
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
  });
  expect(await shownState($)).toBe("done");
});

test("a failed subagent reads as error", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("agent.list", () => ({ value: [FAILED_AGENT] }));
  on("turn.complete", () => ({ text: "" }));

  await $.turn.complete({
    reason: "answer",
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
  });
  expect(await shownState($)).toBe("error");
});

test("a question tool call reads as waiting while the question is open", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("agent.list", () => ({ value: [] }));
  let during: string | undefined;
  on("tool.call", async () => {
    during = await shownState($);
    return { result: {} };
  });

  await $.tool.call({ tool: "AskUserQuestion", questions: [] });
  expect(during).toBe("waiting");
  expect(await shownState($)).toBe("sleep");
});

test("a failed subagent that stays listed decays to sleep", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 });
  on("agent.list", () => ({ value: [FAILED_AGENT] }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("fs.exists", () => ({ value: false }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));

  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.advance(2500);
  expect(await shownState($)).toBe("error");
  await clock.advance(21_000);
  expect(await shownState($)).toBe("sleep");
});

test("a stale phase record is not shown in the label", async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse("2026-01-01T01:00:00Z") });
  on("agent.list", () => ({ value: [] }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("fs.exists", () => ({ value: true }));
  on("fs.read", () => ({
    value: JSON.stringify({
      phase: "review",
      wave: 2,
      spec: "s",
      runId: "r",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
  }));
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));

  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await $.turn.start({ text: "hi", turnId: "t1" });
  await clock.advance(2500);
  expect(await shownState($)).toBe("work");
});

const PANE = {
  plugin: "emet-mascot",
  component: "Pane",
  requestId: "emet-mascot",
  surface: "terminal",
} as const;

function paneProps(placement: "dock" | "inline") {
  return {
    bodyColumns: 40,
    placement,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  } as const;
}

function engineText(
  $: Parameters<Parameters<typeof test>[1]>[0],
  e: Parameters<typeof $.ui.resolve>[0],
) {
  const { Text } = $.ui.resolve(e);
  return <Text>engine</Text>;
}

function paneList(isPlaced: boolean) {
  return [{ id: "emet-mascot", title: "emet", isShown: true, isFocused: false, isPlaced }];
}

test("pane position draws the Raster in the docked pane and the band yields", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("ui.panes", () => ({ value: paneList(true) }));
  on("ui.render", engineText);

  const pane = await $.ui.mount({ ...PANE, props: paneProps("dock") });
  expect(await pane.find({ type: "Raster", key: "mascot" })).toBeDefined();
  await pane.unmount();

  const band = await $.ui.mount({ ...BAND, props: bandProps(false) });
  expect(await band.find({ type: "Raster" })).toBeUndefined();
  await band.unmount();
});

test("pane position falls back to the band once the pane is no longer placed", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  let isPlaced = true;
  on("ui.panes", () => ({ value: paneList(isPlaced) }));
  on("ui.render", engineText);

  const pane = await $.ui.mount({ ...PANE, props: paneProps("dock") });
  await pane.unmount();
  isPlaced = false;

  const band = await $.ui.mount({ ...BAND, props: bandProps(false) });
  expect(await band.find({ type: "Raster", key: "mascot" })).toBeDefined();
  await band.unmount();
});

test("an inline pane draws nothing and the band shows the mascot", async ($, on) => {
  on("clock.now", () => ({ value: 1000 }));
  on("ui.panes", () => ({ value: paneList(true) }));
  on("ui.render", engineText);

  const pane = await $.ui.mount({ ...PANE, props: paneProps("inline") });
  expect(await pane.find({ type: "Raster" })).toBeUndefined();
  await pane.unmount();

  const band = await $.ui.mount({ ...BAND, props: bandProps(false) });
  expect(await band.find({ type: "Raster", key: "mascot" })).toBeDefined();
  await band.unmount();
});

test(
  "status position draws no Raster and pins the label as the status line",
  { options: { position: "status" } },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1000 });
    const lines: (string | undefined)[] = [];
    on("ui.render", engineText);
    on("ui.status", (_, e) => {
      lines.push(e.text);
      return { value: undefined };
    });
    on("agent.list", () => ({ value: [] }));
    on("session.cwd", () => ({ value: "/repo" }));
    on("fs.exists", () => ({ value: false }));
    on("session.start", (_, e) => ({ cwd: e.cwd }));

    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.advance(2500);
    expect(lines.at(-1)).toBe("emet · sleep");

    const band = await $.ui.mount({ ...BAND, props: bandProps(false) });
    expect(await band.find({ type: "Raster" })).toBeUndefined();
    await band.unmount();
  },
);
