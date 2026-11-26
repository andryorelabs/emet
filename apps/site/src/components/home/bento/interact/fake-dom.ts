/**
 * Minimal DOM stand-in for the interaction tests: an event target with a
 * dataset, attributes, text, an inert flag and child lookup by selector.
 */

function closestOf(node: FakeElement | null, selector: string): FakeElement | null {
  if (node === null || node.matches.has(selector)) return node;
  return closestOf(node.parent, selector);
}

export class FakeElement extends EventTarget {
  dataset: Record<string, string | undefined> = {};
  attributes = new Map<string, string>();
  children = new Map<string, FakeElement | null>();
  textContent = "";
  inert = true;
  offsetWidth = 0;
  styleValues = new Map<string, string>();
  style = {
    setProperty: (name: string, value: string): void => {
      this.styleValues.set(name, value);
    },
  };
  rect = { left: 10, top: 20 };
  parent: FakeElement | null = null;
  matches = new Set<string>();

  querySelector(selector: string): FakeElement | null {
    return this.children.get(selector) ?? null;
  }

  closest(selector: string): FakeElement | null {
    return closestOf(this, selector);
  }

  getBoundingClientRect(): { left: number; top: number } {
    return this.rect;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  fire(type: string, props: Record<string, unknown> = {}): Event {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries(props)) {
      Object.defineProperty(event, name, { value });
    }
    this.dispatchEvent(event);
    return event;
  }
}

/**
 * Views a fake as the `HTMLElement` the modules under test expect.
 */
export function asElement(fake: FakeElement): HTMLElement {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the modules only use the members the fake implements
  return fake as unknown as HTMLElement;
}
