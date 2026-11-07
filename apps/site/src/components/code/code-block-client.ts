import { copyWithFeedback, FEEDBACK_MS, type CopyResult } from "../../lib/copy-feedback";

const STORAGE_KEY = "emet:install";
const LABELS: Record<CopyResult | "idle", string> = {
  idle: "Copy code",
  copied: "Copied",
  failed: "Copy failed",
};

const revertTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function readRememberedTab(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberTab(label: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, label);
  } catch {
    return;
  }
}

function showState(block: HTMLElement, button: HTMLElement, state: CopyResult | "idle"): void {
  button.dataset["state"] = state;
  button.setAttribute("aria-label", LABELS[state]);
  const status = block.querySelector<HTMLElement>(".emet-code__status");
  if (status) status.textContent = state === "idle" ? "" : LABELS[state];
}

function activePanelCode(block: HTMLElement): string {
  const panel = block.querySelector<HTMLElement>(".emet-code__panel:not([hidden])");
  return panel?.dataset["code"] ?? "";
}

async function handleCopy(block: HTMLElement, button: HTMLElement): Promise<void> {
  const result = await copyWithFeedback(activePanelCode(block));
  showState(block, button, result);
  const pending = revertTimers.get(button);
  if (pending !== undefined) clearTimeout(pending);
  revertTimers.set(
    button,
    setTimeout(() => {
      revertTimers.delete(button);
      showState(block, button, "idle");
    }, FEEDBACK_MS),
  );
}

function selectTab(block: HTMLElement, label: string): void {
  for (const tab of block.querySelectorAll<HTMLElement>("[data-tab]")) {
    const selected = tab.dataset["tab"] === label;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of block.querySelectorAll<HTMLElement>("[data-panel]")) {
    panel.hidden = panel.dataset["panel"] !== label;
  }
}

function applyRememberedTab(): void {
  const remembered = readRememberedTab();
  if (remembered === null) return;
  for (const block of document.querySelectorAll<HTMLElement>("[data-code-block]")) {
    if (block.querySelector(`[data-tab="${CSS.escape(remembered)}"]`)) {
      selectTab(block, remembered);
    }
  }
}

function handleClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const block = event.target.closest<HTMLElement>("[data-code-block]");
  if (!block) return;
  const copyButton = event.target.closest<HTMLElement>("[data-copy]");
  if (copyButton) {
    void handleCopy(block, copyButton);
    return;
  }
  const tab = event.target.closest<HTMLElement>("[data-tab]");
  const label = tab?.dataset["tab"];
  if (label === undefined) return;
  rememberTab(label);
  for (const other of document.querySelectorAll<HTMLElement>("[data-code-block]")) {
    if (other.querySelector(`[data-tab="${CSS.escape(label)}"]`)) selectTab(other, label);
  }
}

document.addEventListener("click", handleClick);
applyRememberedTab();
