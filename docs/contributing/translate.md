# Translate the docs

How to add or refresh a translation of a page on the Website. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

English is the source. Every other locale lives in `apps/site/src/content/translations/<locale>/<id>.md`, where `<id>` is the page's route below `/docs/`. Each file records the `sourceHash` of the English text it was translated from. When the English page changes, the hash no longer matches and the translation is stale: the Website serves the English page until the translation is refreshed.

## Find what needs work

From the repository root:

```bash
bun install --frozen-lockfile
bun run i18n:status
```

The script prints one line per outdated translation and exits `1`. It exits `0` when everything is current.

```text
translations: 2 outdated
stale  es/architecture.md  sourceHash: ff28425abc92b5c9
missing  fr/guide/codex.md  sourceHash: 0a1b2c3d4e5f6071
```

- `stale`: the file exists but its `sourceHash` differs from the English source.
- `missing`: the locale has no file for that page.
- `sourceHash`: the value the file must carry once it matches the current English text.

## Write the translation

1. Open the English source for the page and the existing translation, if any.
2. Create or edit `apps/site/src/content/translations/<locale>/<id>.md`.
3. Keep the front matter fields `title` and `sourceHash`, plus `description` and `seoTitle` where the English page has them. Translate the values; keep the keys.
4. Set `sourceHash` to the value `bun run i18n:status` printed for that file.
5. Translate the body. Keep code, commands, file paths and links as they are.

## Check your work

Run `bun run i18n:status` again. The file must no longer appear in the report. Then run `bun run check` and `bun run test` before opening a pull request. The conventions in [CONTRIBUTING.md](../../CONTRIBUTING.md) apply.
