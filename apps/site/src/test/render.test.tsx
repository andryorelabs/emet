import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { useEffect, useState } from "react";

import { renderIsland } from "./render";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(1);
  }, []);
  return <button type="button">{count}</button>;
}

describe("renderIsland", () => {
  test("renders the node and flushes its effects", () => {
    const { container, unmount } = renderIsland(<Counter />);
    expect(container.querySelector("button")?.textContent).toBe("1");
    unmount();
  });

  test("removes the container on unmount", () => {
    const { container, unmount } = renderIsland(<p>hello</p>);
    expect(document.body.contains(container)).toBe(true);
    unmount();
    expect(document.body.contains(container)).toBe(false);
  });
});
