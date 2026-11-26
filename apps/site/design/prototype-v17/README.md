# Prototype v17

Read-only design reference for the Website home redesign (spec "Website home redesign to prototype v17").

- `index.html`: the approved single-file prototype, with every effect inlined. Open it from a static server to compare against the real site.
- `parts/*.js`: the standalone effect modules it was built from (`painting-fx`, `dither-image`, `topo`, `terminal`). The `topo` port keeps its MIT header.

Never edit these files and never import them from `src/`. Port the ideas into typed, tested modules under `apps/site/src`. The folder is excluded from lint, format, knip and coverage by path only.
