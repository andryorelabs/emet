import { describe, expect, test } from "bun:test";

import { INSTALL_COMMAND } from "./copy";

describe("INSTALL_COMMAND", () => {
  test("is the one-line standalone installer", () => {
    expect(INSTALL_COMMAND).toBe("curl -fsSL https://emet.andryore.dev/install.sh | sh");
  });
});
