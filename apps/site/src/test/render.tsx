import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/**
 * A mounted island: its container and a way to unmount it.
 */
export interface RenderedIsland {
  readonly container: HTMLElement;
  readonly unmount: () => void;
}

/**
 * Mounts a React node into a fresh container on the happy-dom document and
 * flushes its effects. The caller registers happy-dom before calling it.
 * @param node - The React node to render.
 * @returns The container holding the rendered markup and an `unmount` that
 * removes it.
 */
export function renderIsland(node: ReactNode): RenderedIsland {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
