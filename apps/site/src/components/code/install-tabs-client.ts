import { readInstallTarget, writeInstallTarget } from "./install-target";
import { resolveTabIndex } from "./tab-navigation";

const BLOCK = "[data-install-tabs]";

function getStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function panelsOf(block: HTMLElement): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>(":scope > [data-tab-label]")];
}

function tabsOf(block: HTMLElement): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>("[role='tab']")];
}

function select(block: HTMLElement, label: string): void {
  for (const tab of tabsOf(block)) {
    const selected = tab.dataset["tab"] === label;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panelsOf(block)) {
    panel.hidden = panel.dataset["tabLabel"] !== label;
  }
}

function selectEverywhere(label: string): void {
  for (const block of document.querySelectorAll<HTMLElement>(BLOCK)) {
    if (panelsOf(block).some((panel) => panel.dataset["tabLabel"] === label)) select(block, label);
  }
}

function build(block: HTMLElement, index: number): void {
  const list = block.querySelector<HTMLElement>(":scope > [role='tablist']");
  if (!list) return;
  const panels = panelsOf(block);
  panels.forEach((panel, position) => {
    const label = panel.dataset["tabLabel"] ?? "";
    const id = `install-tabs-${index}-${position}`;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = id;
    tab.className = "emet-install-tabs__tab";
    tab.dataset["tab"] = label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${id}-panel`);
    tab.textContent = label;
    list.append(tab);
    panel.id = `${id}-panel`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", id);
  });
  list.hidden = false;
  block.dataset["ready"] = "";
  select(block, panels[0]?.dataset["tabLabel"] ?? "");
}

function choose(label: string): void {
  writeInstallTarget(getStorage(), label);
  selectEverywhere(label);
}

function handleClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const label = event.target.closest<HTMLElement>(`${BLOCK} [role='tab']`)?.dataset["tab"];
  if (label !== undefined) choose(label);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!(event.target instanceof Element)) return;
  const current = event.target.closest<HTMLElement>(`${BLOCK} [role='tab']`);
  const block = current?.closest<HTMLElement>(BLOCK);
  if (!current || !block) return;
  const tabs = tabsOf(block);
  const target = resolveTabIndex(event.key, tabs.indexOf(current), tabs.length);
  const next = target === null ? undefined : tabs[target];
  const label = next?.dataset["tab"];
  if (!next || label === undefined) return;
  event.preventDefault();
  next.focus();
  choose(label);
}

function init(): void {
  document.querySelectorAll<HTMLElement>(BLOCK).forEach(build);
  const remembered = readInstallTarget(getStorage());
  if (remembered !== null) selectEverywhere(remembered);
}

document.addEventListener("click", handleClick);
document.addEventListener("keydown", handleKeydown);
init();
