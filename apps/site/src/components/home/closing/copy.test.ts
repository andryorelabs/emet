import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { FEEDBACK_MS } from "../../../lib/copy-feedback";
import { initClosingCopy } from "./closing-client";
import { copyCommand, INSTALL_COMMAND } from "./copy";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

/**
 * Renders the button markup the Closing panel uses.
 */
function mount(): { button: HTMLElement; status: HTMLElement } {
  document.body.innerHTML = `<div><button data-closing-copy data-command="${INSTALL_COMMAND}"></button><span data-closing-status></span></div>`;
  const button = document.querySelector<HTMLElement>("[data-closing-copy]");
  const status = document.querySelector<HTMLElement>("[data-closing-status]");
  if (!button || !status) throw new Error("markup missing");
  return { button, status };
}

describe("copyCommand", () => {
  test("writes the exact text and reports success", async () => {
    const written: string[] = [];
    const copied = await copyCommand(INSTALL_COMMAND, {
      writeText: (text) => {
        written.push(text);
        return Promise.resolve();
      },
    });
    expect(copied).toBe(true);
    expect(written).toEqual(["curl -fsSL https://emet.andryore.dev/install.sh | sh"]);
  });

  test("reports failure when the clipboard refuses", async () => {
    const copied = await copyCommand("x", { writeText: () => Promise.reject(new Error("denied")) });
    expect(copied).toBe(false);
  });
});

describe("initClosingCopy", () => {
  test("copies the command, shows the state and reverts", async () => {
    const { button, status } = mount();
    const written: string[] = [];
    initClosingCopy(document, {
      writeText: (text) => {
        written.push(text);
        return Promise.resolve();
      },
    });
    button.click();
    await Bun.sleep(0);
    expect(written).toEqual([INSTALL_COMMAND]);
    expect(button.dataset.state).toBe("copied");
    expect(status.textContent).toBe("Copied");
    await Bun.sleep(FEEDBACK_MS + 100);
    expect(button.dataset.state).toBe("idle");
    expect(status.textContent).toBe("");
  });

  test("shows the failed state and tolerates a missing status node", async () => {
    document.body.innerHTML = `<button data-closing-copy></button>`;
    const button = document.querySelector<HTMLElement>("[data-closing-copy]");
    initClosingCopy(document, { writeText: () => Promise.reject(new Error("denied")) });
    button?.click();
    await Bun.sleep(0);
    expect(button?.dataset.state).toBe("failed");
    button?.click();
    await Bun.sleep(0);
    expect(button?.dataset.state).toBe("failed");
  });
});
