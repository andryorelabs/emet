# Third-party skills

The skills below live under `.claude/skills/`, are tracked in git and are locked in `skills-lock.json` ([ADR-0028](adr/0028-third-party-skills-are-tracked-and-locked.md)). Each folder is byte-identical to its upstream folder at the pinned commit. Install and update them as [development.md](development.md#skills-install-and-update) says, and never edit a vendored file.

Several skills no longer exist at upstream HEAD, so their pins are historical commits. `Upstream path` is the folder at that commit; it can differ from the local name because upstream renamed the folder later.

## Licenses

| Source                                                                                  | License    | Copyright holder                                                                                             |
| --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| [emilkowalski/skills](https://github.com/emilkowalski/skills)                           | MIT        | Emil Kowalski (2026)                                                                                         |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)                         | MIT        | Leonxlnx (2026)                                                                                              |
| [googlechrome/modern-web-guidance](https://github.com/googlechrome/modern-web-guidance) | Apache-2.0 | Google Chrome team; the `LICENSE` file carries no copyright line. Guide content is CC-BY 4.0 per its README. |

## Skills

| Skill                                   | Source                           | Pinned commit                                             | Upstream path                         |
| --------------------------------------- | -------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| `animate`                               | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/animate`                      |
| `animation-performance`                 | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/animation-performance`        |
| `animation-vocabulary`                  | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/animation-vocabulary`         |
| `choreograph`                           | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/choreograph`                  |
| `emil-design-eng`                       | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/emil-design-eng`              |
| `find-animation-opportunities`          | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/find-animation-opportunities` |
| `improve-animations`                    | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/improve-animations`           |
| `remove-animations`                     | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/remove-animations`            |
| `review-animations`                     | emilkowalski/skills              | `f8ff3b0a1b6edbad62a6cd7fc0d06ef2a6f7e4ab`                | `skills/review-animations`            |
| `brandkit`                              | Leonxlnx/taste-skill             | `a206bbf75a9d80554c0de17c1198ee2fbbc555aa`                | `skills/brandkit`                     |
| `design-taste-frontend`                 | Leonxlnx/taste-skill             | `12af471f627f866411b4bd785b19646d3672784c`                | `skills/taste-skill`                  |
| `design-taste-frontend-v1`              | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/taste-skill-v1`               |
| `design-taste-frontend-v2-experimental` | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/taste-skill-v2-experimental`  |
| `gpt-taste`                             | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/gpt-tasteskill`               |
| `high-end-visual-design`                | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/soft-skill`                   |
| `image-to-code`                         | Leonxlnx/taste-skill             | `a206bbf75a9d80554c0de17c1198ee2fbbc555aa`                | `skills/image-to-code-skill`          |
| `imagegen-frontend-mobile`              | Leonxlnx/taste-skill             | `a206bbf75a9d80554c0de17c1198ee2fbbc555aa`                | `skills/imagegen-frontend-mobile`     |
| `imagegen-frontend-web`                 | Leonxlnx/taste-skill             | `a206bbf75a9d80554c0de17c1198ee2fbbc555aa`                | `skills/imagegen-frontend-web`        |
| `industrial-brutalist-ui`               | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/brutalist-skill`              |
| `minimalist-ui`                         | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/minimalist-skill`             |
| `stitch-design-taste`                   | Leonxlnx/taste-skill             | `b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2`                | `skills/stitch-skill`                 |
| `modern-web-guidance`                   | googlechrome/modern-web-guidance | `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` (tag `v1.0.1`) | `skills/modern-web-guidance`          |

## Bundled scripts

The only skill with executable code is `design-taste-frontend` (`scripts/*.mjs`, `assets/*.js`). It was read before it was tracked:

- `scripts/assets.mjs` fetches public image, video and museum-collection APIs (Openverse, Wikimedia Commons, Art Institute of Chicago, the Met, Internet Archive, NASA) and downloads the chosen media with GET requests. It sends only the search query and a fixed User-Agent.
- `scripts/lib/cdp.mjs` launches a local Chrome with a temporary profile and drives it over a local DevTools WebSocket. `scripts/inspect.mjs` and `scripts/scenes.mjs` serve the checked page from a `127.0.0.1` server.
- `scripts/draw.mjs` and `scripts/lib/app-draw.mjs` read and write `~/.taste-skill/history.json` (override with `TASTE_SKILL_HISTORY`).
- Nothing posts data, reads credentials or secrets, or pipes downloaded content into a shell. The scripts run only when an agent invokes them.

`modern-web-guidance` instructs agents to run `npx -y modern-web-guidance@latest`. The repo rule in [AGENTS.md](../AGENTS.md) overrides that: run `bunx modern-web-guidance@1.0.1`.
