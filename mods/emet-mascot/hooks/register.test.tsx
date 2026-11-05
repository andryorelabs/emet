import { expect, test } from "claude-code/testing";

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
