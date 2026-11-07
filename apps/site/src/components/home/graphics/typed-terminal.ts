/**
 * Typed terminal of how it works: when an exchange enters the viewport its
 * command types in with a lamp-coloured block cursor and its output blocks
 * reveal line by line. The final state is the HTML itself, so without script
 * or with reduced motion nothing is touched. Only characters kept in place
 * (the untyped tail is transparent, so layout never shifts) and the opacity
 * of whole lines change.
 */
import { createSchedule, progressAt, revealCounts, type TypingSchedule } from "./typing-schedule";

const VIEW_THRESHOLD = 0.3;

interface TypedCommand {
  heads: Text[];
  tails: HTMLElement[];
  texts: string[];
  cursor: HTMLElement;
}

interface TypedExchange {
  command: TypedCommand | undefined;
  outputs: HTMLElement[][];
  schedule: TypingSchedule;
}

function textNodesOf(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && node.data.length > 0) nodes.push(node);
  }
  return nodes;
}

function prepareCommand(block: Element): TypedCommand | undefined {
  const panel = block.querySelector(".emet-code__panel:not([hidden])");
  const code = panel?.querySelector("pre");
  if (!code) return undefined;
  const heads: Text[] = [];
  const tails: HTMLElement[] = [];
  const texts: string[] = [];
  for (const node of textNodesOf(code)) {
    const tail = document.createElement("span");
    tail.className = "tt-tail";
    tail.textContent = node.data;
    texts.push(node.data);
    node.after(tail);
    node.data = "";
    heads.push(node);
    tails.push(tail);
  }
  const cursor = document.createElement("span");
  cursor.className = "tt-cursor";
  return { heads, tails, texts, cursor };
}

function renderCommand(command: TypedCommand, chars: number): void {
  const counts = revealCounts(
    command.texts.map((text) => text.length),
    chars,
  );
  let last = 0;
  for (const [index, count] of counts.entries()) {
    const text = command.texts[index] ?? "";
    const head = command.heads[index];
    const tail = command.tails[index];
    if (!head || !tail) continue;
    head.data = text.slice(0, count);
    tail.textContent = text.slice(count);
    if (count > 0) last = index;
  }
  command.heads[last]?.after(command.cursor);
}

function linesOf(block: Element): HTMLElement[] {
  if (block instanceof HTMLPreElement) {
    const lines = (block.textContent ?? "").split("\n");
    block.textContent = "";
    return lines.map((line, index) => {
      const element = document.createElement("span");
      element.textContent = line;
      block.append(element, index < lines.length - 1 ? "\n" : "");
      return element;
    });
  }
  return [...block.querySelectorAll<HTMLElement>(".ec-line")];
}

function prepareExchange(exchange: Element): TypedExchange | undefined {
  const blocks = [...exchange.querySelectorAll(".emet-code, .fragment pre.terminal")];
  const first = blocks[0];
  const hasCommand = first?.classList.contains("emet-code") === true;
  const command = hasCommand && first ? prepareCommand(first) : undefined;
  const outputs = blocks.slice(hasCommand ? 1 : 0).map((block) => linesOf(block));
  if (!command && outputs.length === 0) return undefined;
  const commandChars = command ? command.texts.join("").length : 0;
  const schedule = createSchedule(
    commandChars,
    outputs.map((lines) => lines.length),
  );
  return { command, outputs, schedule };
}

function play(typed: TypedExchange): void {
  const started = performance.now();
  const frame = (now: number): void => {
    const progress = progressAt(typed.schedule, now - started);
    if (typed.command) renderCommand(typed.command, progress.chars);
    for (const [block, lines] of typed.outputs.entries()) {
      const shown = progress.lines[block] ?? 0;
      for (const [index, line] of lines.entries()) {
        line.classList.toggle("tt-off", index >= shown);
      }
    }
    if (progress.done) typed.command?.cursor.remove();
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Arms every `[data-typed]` exchange under `root`; does nothing with reduced motion. */
export function initTypedTerminal(root: ParentNode): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const armed = new Map<Element, TypedExchange>();
  for (const exchange of root.querySelectorAll("[data-typed]")) {
    const typed = prepareExchange(exchange);
    if (!typed) continue;
    armed.set(exchange, typed);
    for (const lines of typed.outputs) {
      for (const line of lines) line.classList.add("tt-line", "tt-off");
    }
    if (typed.command) renderCommand(typed.command, 0);
  }
  if (armed.size === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const typed = armed.get(entry.target);
        if (!entry.isIntersecting || !typed) continue;
        observer.unobserve(entry.target);
        play(typed);
      }
    },
    { threshold: VIEW_THRESHOLD },
  );
  for (const exchange of armed.keys()) observer.observe(exchange);
}
