### Requirement: Every published page has a current translation in each locale

Source: #924 S1

Every published Website page except `whats-new` has a current translation in each of the 9 locales.

#### Scenario: Translation status is clean

- **WHEN** `bun run i18n:status` runs after the last translation ticket
- **THEN** it reports no `stale` or `missing` line other than `whats-new`

### Requirement: Translations preserve code and front matter

Source: #924 S2

Translations keep code, commands, file paths and links unchanged and keep the front matter keys defined in `docs/contributing/translate.md`.

#### Scenario: Checks pass on translated pages

- **WHEN** `bun run check` and `bun run lint:docs` run
- **THEN** they pass
