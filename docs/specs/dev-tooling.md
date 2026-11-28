### Requirement: Toolchain pins match the pin table

Source: #1093 S2

The toolchain pin table `tools/toolchain.ts` matches every pinned tool: oxlint, oxfmt, oxlint-tsgolint, bun, node and zizmor.

#### Scenario: The pin test runs

- **WHEN** `bun run test` runs
- **THEN** `toolchain pins match tools/toolchain.ts` passes for every row

### Requirement: The zizmor action runs the pinned zizmor

Source: #1093 S3

`zizmorcore/zizmor-action` is SHA-pinned at the release that runs the zizmor version in the pin table.

#### Scenario: The workflow invariants run

- **WHEN** `tools/workflows-invariants.test.ts` runs
- **THEN** it passes

### Requirement: Major bumps are fixed in code, never by loosening config

Source: #1093 S5

Lint and type fallout from a dependency major is fixed in code, and no tsconfig or lint setting is loosened.

#### Scenario: Checks run after a major bump

- **WHEN** `bun run check` runs
- **THEN** typecheck, lint, format, knip and docs-link checks pass with no new rule-off in config
