import { describe, expect, mock, test } from "bun:test";

import { installSearchTrustedTypesPolicy, type TrustedTypesFactory } from "./search-trusted-types";

const ORIGIN = "https://emet.andryore.dev";

function registeredRules(): Parameters<TrustedTypesFactory["createPolicy"]>[1] {
  const createPolicy = mock<TrustedTypesFactory["createPolicy"]>();
  installSearchTrustedTypesPolicy({ createPolicy }, ORIGIN);
  const rules = createPolicy.mock.calls[0]?.[1];
  if (!rules) throw new Error("no policy registered");
  return rules;
}

describe("the registered default policy", () => {
  test("createScriptURL lets the same-origin Pagefind worker through", () => {
    const worker = `${ORIGIN}/pagefind/pagefind-worker.js`;
    expect(registeredRules().createScriptURL(worker)).toBe(worker);
  });

  test("createScriptURL blocks any other script URL", () => {
    expect(() => registeredRules().createScriptURL("https://evil.example/x.js")).toThrow(TypeError);
  });

  test("createHTML keeps mark tags and neutralises the rest", () => {
    const createHtml = registeredRules().createHTML;
    expect(createHtml("<mark>a</mark><b>b</b>")).toBe("<mark>a</mark>&lt;b>b&lt;/b>");
  });
});
