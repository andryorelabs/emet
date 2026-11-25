import { describe, expect, mock, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { interactionDirective } from "./interaction-integration";

describe("interactionDirective integration", () => {
  test("registers the client:interaction directive on config setup", () => {
    const integration = interactionDirective();
    const addClientDirective = mock();
    const setup = integration.hooks["astro:config:setup"];
    expect(integration.name).toBe("interaction-directive");
    expect(setup).toBeDefined();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the hook only reads addClientDirective
    void setup?.({ addClientDirective } as never);
    expect(addClientDirective).toHaveBeenCalledWith({
      name: "interaction",
      entrypoint: fileURLToPath(new URL("interaction-directive.ts", import.meta.url)),
    });
  });
});
