/**
 * The toolchain pin table (spec S1). Every value here is the exact pin the repo must carry;
 * `tools/toolchain-drift.test.ts` fails when a manifest, `.node-version` or a workflow
 * drifts from it. Renovate moves the pins, and this table moves with them in the same PR.
 */
export const TOOLCHAIN: Readonly<Record<string, string>> = {
  oxlint: "1.95.0",
  "@oxlint/plugins": "1.95.0",
  oxfmt: "0.80.0",
  "oxlint-tsgolint": "7.0.2009",
  typescript7: "npm:typescript@7.1.0-beta",
  typescript: "npm:@typescript/typescript6@6.0.2",
  bun: "1.4.5",
  "@types/bun": "1.4.5",
  node: "26.13.1",
  actionlint: "1.7.12",
  zizmor: "1.33.1",
  "lycheeverse/lychee-action": "e7477775783ea5526144ba13e8db5eec57747ce8",
};
