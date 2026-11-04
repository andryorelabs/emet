# Naming checks: category collisions

Raw log for `docs/brand/naming-candidates.md`, second half. Registries say
whether a name is free as a slug or a binary. They do not say whether another
tool that orchestrates coding agents already uses the word. That is checked
here, with a web search per name and then a look at the primary source of each
hit. All searches and fetches on 2026-11-04.

Method: one web search per name, phrased `"<name>" AI coding agents ...`,
`"<name>" CLI ...` or similar. Each hit was then opened at its primary source
(GitHub repository through `gh api graphql`, or the project's own page through
a fetch). Star counts come from the GitHub API on the same day. A search that
found nothing is written as "none found", which is weaker than "none exists".

## Hits in the same category

These tools run or coordinate AI coding agents, often in git worktrees, which
is what this project does.

| Name      | Who uses it                                                                                                                                                                                                                                                                                                                                                    | Source checked                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| temper    | Claude Code plugin named `temper`, installed as `/plugin install temper`, command `/temper:temper` ([galando.github.io/temper](https://galando.github.io/temper), [galando/temper](https://github.com/galando/temper), 18 stars). Several more `temper` plugins exist (see `naming-checks.md`)                                                                 | Page fetched, repo via API                         |
| regatta   | "tmux-backed orchestrator for running AI coding agents in parallel git worktrees" ([Someblueman/regatta](https://github.com/Someblueman/regatta), 0 stars)                                                                                                                                                                                                     | Page fetched                                       |
| armada    | [jchristn/Armada](https://github.com/jchristn/Armada), "multi-agent orchestration system", 17 stars; [rafmacalaba/armada](https://github.com/rafmacalaba/armada), "Turn any repository into a self-organizing AI engineering team", 105 stars; a PyPI package `armada-ai` ([pypi.org/project/armada-ai](https://pypi.org/project/armada-ai/), page not opened) | Repos via API                                      |
| grove     | [CodingSinger/grove](https://github.com/CodingSinger/grove) (Kanban TUI for parallel AI coding in worktrees), [MichaelVessia/grove](https://github.com/MichaelVessia/grove) ("Workspace manager for AI coding agents", 8 stars), [ZiiMs/Grove](https://github.com/ZiiMs/Grove) (24 stars), [Linkuistics/grove](https://github.com/Linkuistics/grove)           | Repos via API                                      |
| arbor     | [penso/arbor](https://github.com/penso/arbor), "Run agentic coding workflows in a fully native desktop app for Git worktrees", 839 stars                                                                                                                                                                                                                       | Repo via API                                       |
| colony    | [opencue/colony](https://github.com/opencue/colony) ("Local-first coordination for fleets of coding agents", reached from `recodeee/colony`), [mcfearsome/cc-colony](https://github.com/mcfearsome/cc-colony) ("Claude Code on tmux")                                                                                                                          | Repos via API                                      |
| apiary    | Apiary, "the control plane for AI coding agents", runs Claude Code, Codex and Gemini, CLI `apiary` ([docs](https://apiary-marketing-dev.pages.dev/docs)). The product domain `apiary.run` did not resolve on the day                                                                                                                                           | Docs page fetched                                  |
| baton     | [mraza007/baton](https://github.com/mraza007/baton), "polls GitHub Issues, runs agents in isolated worktrees", 28 stars; [coderhyme/baton](https://github.com/coderhyme/baton), "Conduct your AI orchestra"; a desktop app at getbaton.dev seen in search results, not opened                                                                                  | Repos via API                                      |
| copse     | `@copse/cli`, a CLI for managing pull requests opened by coding agents, site copse.dev. Seen through a search result ([pkgstats](https://www.pkgstats.com/pkg:@copse/cli)); the npm page itself was not opened                                                                                                                                                 | Secondary only: not verified at the primary source |
| flotilla  | `create-flotilla`, described in a Reddit post as an orchestration layer for several coding agents. Only a Reddit snapshot was found                                                                                                                                                                                                                            | Not verified: no primary source found              |
| smelt     | [leonardcser/smelt](https://github.com/leonardcser/smelt), "A fast, Lua-scriptable coding agent for the terminal", 67 stars, binary `smelt`                                                                                                                                                                                                                    | Repo via API                                       |
| heddle    | [roackb2/heddle](https://github.com/roackb2/heddle), "terminal coding agent runtime and CLI", 27 stars; npm `@roackb2/heddle`                                                                                                                                                                                                                                  | Repo via API                                       |
| weft      | [WeaveMindAI/weft](https://github.com/WeaveMindAI/weft), "A programming language for AI orchestrations", 2024 stars                                                                                                                                                                                                                                            | Repo via API                                       |
| hive      | [aden-hive/hive](https://github.com/aden-hive/hive), "Multi-Agent Harness for Production AI", 11141 stars                                                                                                                                                                                                                                                      | Repo via API                                       |
| swarm     | [openai/swarm](https://github.com/openai/swarm), "Educational framework exploring ergonomic, lightweight multi-agent orchestration", 22107 stars                                                                                                                                                                                                               | Repo via API                                       |
| maestro   | Homebrew cask `maestro`, "AI agent command center" ([formulae.brew.sh/cask/maestro](https://formulae.brew.sh/cask/maestro))                                                                                                                                                                                                                                    | Homebrew API                                       |
| specsmith | npm `specsmith`, "Claude Code skills, agents, and scripts that drive an end-to-end devel[opment workflow]" ([npmjs.com/package/specsmith](https://www.npmjs.com/package/specsmith)), v0.29.0                                                                                                                                                                   | Registry API                                       |
| kiln      | [Kiln-AI/Kiln](https://github.com/Kiln-AI/Kiln), "Build, Evaluate, and Optimize AI Systems", 5254 stars                                                                                                                                                                                                                                                        | Repo via API                                       |
| fanout    | `agent-fanout`, a skill that delegates work to parallel agent CLIs in git worktrees, seen through a skills directory listing ([skillselion](https://skillselion.com/skills/gbasin/agent-fanout)); the source repository was not opened                                                                                                                         | Secondary only                                     |
| wrought   | npm `wrought`, "Wrought by FluxForge AI — Engineering and operations control system" ([npmjs.com/package/wrought](https://www.npmjs.com/package/wrought)), v0.0.1                                                                                                                                                                                              | Registry API                                       |
| bellows   | Claude Code plugin `bellows` in the `samuel-stidham/smithy` marketplace ("Recurring automation plugin for the smithy family"), 1 star. The same marketplace names plugins `forge`, `foundry`, `anvil` and `temper` ([samuel-stidham/smithy](https://github.com/samuel-stidham/smithy))                                                                         | Repo and `plugin.json` via API                     |
| ingot     | Claude Code plugin `ingot` ("Ingot for Claude Code: working rules, per-project specialization ...") in [CIGIBWARIN/ingot](https://github.com/CIGIBWARIN/ingot), a personal setup repository, 0 stars                                                                                                                                                           | Repo and `plugin.json` via API                     |

## Adjacent, different job

| Name   | Who uses it                                                                                                                                                                                                                                                             | Source checked             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| wright | "Wright", local-first agent orchestration for physical engineering (CAD, CAE, CAM); pip package `wright-engineering` ([pypi.org/project/wright-engineering](https://pypi.org/project/wright-engineering/), page not opened). PyPI `wright` is an AI docstring generator | PyPI JSON API for `wright` |
| weir   | Claude Code plugin `weir` for X and Reddit data through Weir's MCP server ([tarun-khatri/weir-mcp](https://github.com/tarun-khatri/weir-mcp)). A data product, not an orchestrator                                                                                      | Repo and `plugin.json`     |
| swell  | Swell Commerce ships Claude Code plugins (`swell-app`) ([swellstores/swell-claude-plugins](https://github.com/swellstores/swell-claude-plugins)); Swell is also an API-testing tool, [open-source-labs/Swell](https://github.com/open-source-labs/Swell), 983 stars     | Repos via API              |
| anvil  | Foundry ships an `anvil` binary (local Ethereum node) next to `forge`, `cast` and `chisel` ([foundry-rs/foundry](https://github.com/foundry-rs/foundry))                                                                                                                | Repo README fetched        |

## None found

Searches that found no tool in the category:

- `wavesmith`: the only product is WaveSmith, a legacy Windows analog
  waveform tool listed on G2. No coding-agent tool, no plugin, npm free.
- `unspool`: nothing in the category. The GitHub repository with the name is a
  3-star Mac writing app.
- `joiner`: no tool by that name. The word appears only as the join step in
  "fan-out / fan-in" writing.
- `ingot`, `bellows`, `weir`: no orchestrator found by web search; the
  Claude Code plugin hits above came from GitHub code search instead.

## Observation

The words most tools in this category reach for are fleets of ships (armada,
flotilla, regatta, convoy), groups of trees for worktrees (grove, arbor, copse,
orchard), insect colonies (hive, swarm, colony, apiary) and conductors (baton,
maestro). The forge and smithing vocabulary is crowded in Claude Code plugins
too: one marketplace alone uses `forge`, `foundry`, `anvil`, `bellows` and
`temper`.
