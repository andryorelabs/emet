# Naming checks: raw registry log

Raw log for `docs/brand/naming-candidates.md`. Every check below was run on
2026-11-04 from a Linux shell. The tables keep what the commands returned;
judgement lives in the main study, not here.

## Commands

| Check                              | Command (with `<name>` as the candidate)                                                                                                                                                   | Read as                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| GitHub slug under `AndryOre`       | GraphQL `repository(owner: "AndryOre", name: "<name>")` through `gh api graphql`, batched 7 names per query                                                                                | `null` with "Could not resolve to a Repository" means free                                                       |
| Same-name repositories on GitHub   | GraphQL `search(query: "<name> in:name sort:stars", type: REPOSITORY, first: 20)` through `gh api graphql`                                                                                 | `total` is every repository with the word in its name; `exact` counts the top 20 by stars named exactly `<name>` |
| npm package name                   | `curl -s https://registry.npmjs.org/<name>`, piped to `jq` (latest dist-tag, `time.modified`, description)                                                                                 | `{"error":"Not found"}` means free                                                                               |
| Debian package name                | `curl -s 'https://packages.debian.org/search?keywords=<name>&searchon=names&exact=1&suite=all&section=all'`, counting `<h3>Package` headings                                               | `1` means a binary package with that exact name exists in some suite                                             |
| Debian executable                  | `curl -s 'https://packages.debian.org/search?searchon=contents&keywords=<name>&mode=exactfilename&suite=stable&arch=any'`, matching `/bin/<name>`, `/usr/bin/<name>` or `/usr/sbin/<name>` | `1` means a stable package installs an executable with that name                                                 |
| Ubuntu package name and executable | The same two queries against `packages.ubuntu.com`, contents search in `noble`                                                                                                             | Same reading                                                                                                     |
| Homebrew formula and cask          | `curl -s -o /dev/null -w '%{http_code}' https://formulae.brew.sh/api/formula/<name>.json` and `.../api/cask/<name>.json`                                                                   | `200` taken, `404` free                                                                                          |
| Claude Code plugin name            | Official marketplace: `gh api repos/anthropics/claude-plugins-official/contents/.claude-plugin/marketplace.json`, decoded, `jq -r '.plugins[].name'`, exact match against the list         | See the section below                                                                                            |

The `npm view <name>` and per-name `gh repo view` forms were not used: the
worker sandbox refuses `gh` and `npm` calls whose arguments come from a shell
variable. The registry and GraphQL calls above return the same facts.

## Results for all 58 names

Columns: GitHub `AndryOre/<name>`; total repositories with the word in their
name; exact-name repositories in the top 20 by stars; the top exact match; npm;
Debian package / executable; Ubuntu package / executable; Homebrew formula /
cask.

| Name       | AndryOre | Total  | Exact | Top exact match                                            | npm                                                                                                       | Debian pkg / bin | Ubuntu pkg / bin | Brew formula / cask |
| ---------- | -------- | ------ | ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ------------------- |
| anvil      | free     | 4826   | 5     | anvil-ui/anvil 1439 stars, pushed 2021-05-29               | taken: v0.0.6; modified 2022-04-11; Anvil is a library of useful interactive tools.                       | 0 / 0            | 0 / 0            | 404 / 404           |
| smelt      | free     | 847    | 5     | leonardcser/smelt 67 stars, pushed 2026-11-03              | taken: v0.0.2; modified 2022-06-26; simple command utilities for ficion                                   | 0 / 0            | 0 / 0            | 404 / 404           |
| temper     | free     | 96616  | 6     | raeedcho/temper 485 stars, pushed 2026-06-25               | taken: v0.3.2; modified 2022-06-27; Temper compiles template for client and server side usage.            | 0 / 0            | 0 / 0            | 404 / 404           |
| ingot      | free     | 513    | 13    | liuweichaox/Ingot 52 stars, pushed 2026-11-02              | taken: v0.1.4; modified 2022-06-19; Automation platform for building and testing software                 | 0 / 0            | 0 / 0            | 404 / 404           |
| bellows    | free     | 248    | 7     | zigpy/bellows 222 stars, pushed 2026-10-23                 | taken: v1.1.2; modified 2022-06-13; DOM Accordion UI module                                               | 0 / 0            | 0 / 0            | 404 / 404           |
| kiln       | free     | 2262   | 8     | Kiln-AI/Kiln 5254 stars, pushed 2026-11-03                 | taken: v0.0.1; modified 2022-06-19; Provides Kiln API functionality                                       | 0 / 0            | 0 / 0            | 404 / 404           |
| foundry    | free     | 34150  | 5     | foundry-rs/foundry 10752 stars, pushed 2026-11-04          | taken: v4.7.0; modified 2022-06-18; Release manager for npm, bower, component, PyPI, git tags             | 1 / 0            | 1 / 0            | 200 / 404           |
| crucible   | free     | 2136   | 12    | GaloisInc/crucible 781 stars, pushed 2026-11-03            | taken: no latest tag; modified 2025-11-20                                                                 | 0 / 0            | 0 / 0            | 404 / 404           |
| tide       | free     | 12977  | 5     | http-rs/tide 5092 stars, pushed 2024-01-05                 | taken: v2.3.0; modified 2022-06-27; A Flux-like State Management Library for React                        | 0 / 0            | 0 / 0            | 404 / 404           |
| swell      | free     | 1585   | 7     | open-source-labs/Swell 983 stars, pushed 2026-10-15        | taken: v0.0.5; modified 2022-06-27; Dead simple monorepo tooling for NodeJS services, coming soon.        | 0 / 0            | 0 / 0            | 404 / 404           |
| surge      | free     | 15907  | 9     | Jounce/Surge 5325 stars, pushed 2023-07-20                 | taken: v0.56.0; modified 2026-11-02; Static web publishing                                                | 0 / 0            | 0 / 0            | 404 / 200           |
| crest      | free     | 7562   | 8     | wave-harmonic/crest 3938 stars, pushed 2026-06-18          | taken: v0.0.4; modified 2022-06-14; REST Server for MongoDB                                               | 0 / 0            | 0 / 0            | 404 / 200           |
| undertow   | free     | 701    | 3     | undertow-io/undertow 3761 stars, pushed 2026-10-20         | taken: v0.0.6; modified 2022-06-28; An extension to underscore.js                                         | 0 / 0            | 0 / 0            | 404 / 404           |
| riptide    | free     | 962    | 12    | RiptideNetworking/Riptide 1296 stars, pushed 2026-08-19    | taken: v0.1.0; modified 2022-06-26; REST in peace - helper for REST web services                          | 0 / 0            | 0 / 0            | 404 / 404           |
| loom       | free     | 13209  | 10    | tokio-rs/loom 2859 stars, pushed 2026-11-03                | taken: v3.1.2; modified 2026-10-02; Weave your wefts betwixt the warps of loom generators                 | 0 / 0            | 0 / 0            | 404 / 200           |
| weft       | free     | 893    | 13    | WeaveMindAI/weft 2024 stars, pushed 2026-11-03             | taken: v1.3.1; modified 2022-06-29; NodeJS API Wrapper for Google Web Fonts                               | 0 / 0            | 0 / 0            | 404 / 404           |
| warp       | free     | 17620  | 6     | warpdotdev/warp 65858 stars, pushed 2026-11-04             | taken: no latest tag; modified 2026-07-07                                                                 | 1 / 1            | 1 / 1            | 404 / 200           |
| shuttle    | free     | 7766   | 8     | shuttle-hq/shuttle 6905 stars, pushed 2026-01-09           | taken: v0.6.4; modified 2022-06-26; A massively-distributable, service-oriented architecture              | 0 / 1            | 0 / 0            | 404 / 404           |
| heddle     | free     | 93     | 16    | roackb2/heddle 27 stars, pushed 2026-09-30                 | taken: v0.0.1; modified 2026-02-15; A full stack framework.                                               | 0 / 0            | 0 / 0            | 404 / 404           |
| braid      | free     | 2251   | 7     | braidchat/braid 936 stars, pushed 2026-01-22               | taken: no latest tag; modified 2025-10-16                                                                 | 0 / 0            | 0 / 0            | 200 / 404           |
| convoy     | free     | 1298   | 7     | frain-dev/convoy 2888 stars, pushed 2026-11-03             | taken: v0.4.1; modified 2022-06-13; Pluggable, package-aware asset pipeline for node                      | 0 / 0            | 0 / 0            | 404 / 404           |
| flotilla   | free     | 422    | 14    | tylertreat/Flotilla 238 stars, pushed 2016-01-23           | taken: v0.1.4; modified 2022-06-18; Continuous deployment with a HTTP host router                         | 0 / 0            | 0 / 0            | 404 / 404           |
| fleet      | free     | 44742  | 7     | fleetdm/fleet 7123 stars, pushed 2026-11-04                | taken: v0.1.6; modified 2022-11-11; command a cluster of processes                                        | 0 / 0            | 0 / 0            | 404 / 200           |
| armada     | free     | 2142   | 13    | armada-os/armada 2051 stars, pushed 2026-11-03             | taken: v0.0.3; modified 2022-11-16; node-armada                                                           | 0 / 0            | 0 / 0            | 404 / 404           |
| regatta    | free     | 494    | 6     | EWisely/REGATTA 3 stars, pushed 2026-09-14                 | free (Not found)                                                                                          | 0 / 0            | 0 / 0            | 404 / 404           |
| hive       | free     | 49919  | 3     | aden-hive/hive 11141 stars, pushed 2026-11-02              | taken: v2.1.13; modified 2025-10-27                                                                       | 0 / 0            | 0 / 0            | 200 / 404           |
| swarm      | free     | 38530  | 2     | openai/swarm 22107 stars, pushed 2026-04-15                | taken: v0.3.25; modified 2025-10-13; reactive data sync lib                                               | 1 / 1            | 1 / 1            | 404 / 404           |
| colony     | free     | 7989   | 2     | hughsk/colony 522 stars, pushed 2018-06-15                 | taken: v0.0.7; modified 2022-06-13; In-browser network graphs                                             | 0 / 0            | 0 / 0            | 404 / 404           |
| apiary     | free     | 1408   | 9     | DBOS-project/apiary 155 stars, pushed 2023-10-13           | taken: v0.0.2; modified 2022-06-13; Spawn multi-system multi-user node.js clouds                          | 0 / 0            | 0 / 0            | 404 / 404           |
| scaffold   | free     | 29124  | 0     | none in the top 20                                         | taken: v0.2.13; modified 2023-08-02; Conventions and API for creating declarative configuration objects   | 0 / 1            | 0 / 1            | 404 / 404           |
| truss      | free     | 2491   | 5     | basetenlabs/truss 1227 stars, pushed 2026-11-03            | taken: v0.2.2; modified 2022-06-27; Opinionated project generator for node.js                             | 0 / 0            | 0 / 0            | 404 / 404           |
| mason      | free     | 15040  | 2     | DrewDahlman/Mason 1210 stars, pushed 2017-04-18            | taken: v0.1.7; modified 2022-06-19; simple, fun, static-file builder                                      | 1 / 0            | 1 / 0            | 404 / 404           |
| keystone   | free     | 5505   | 7     | keystonejs/keystone 9986 stars, pushed 2026-11-04          | taken: v4.2.1; modified 2026-10-29; Web Application Framework and Admin GUI                               | 1 / 0            | 1 / 0            | 200 / 404           |
| rivet      | free     | 1717   | 6     | rivet-dev/rivet 6571 stars, pushed 2026-11-03              | taken: v1.0.7; modified 2022-06-26; Suite of utilities for the Rivet API contract                         | 0 / 0            | 0 / 0            | 404 / 200           |
| baton      | free     | 1944   | 12    | americanexpress/baton 288 stars, pushed 2021-03-31         | taken: v0.0.0; modified 2022-06-13; An orchestration tool powered by conservatory                         | 0 / 0            | 0 / 0            | 404 / 404           |
| tempo      | free     | 71755  | 4     | grafana/tempo 5553 stars, pushed 2026-11-03                | taken: v0.2.7; modified 2022-06-27; Rotating Counters for Nodejs                                          | 0 / 0            | 0 / 0            | 404 / 404           |
| cadence    | free     | 6111   | 7     | cadence-workflow/cadence 9536 stars, pushed 2026-11-04     | taken: v3.0.6; modified 2022-06-13; A Swiss Army asynchronous control flow function                       | 0 / 0            | 0 / 0            | 200 / 404           |
| quorum     | free     | 2960   | 3     | Consensys-inc-archive/quorum 4762 stars, pushed 2026-06-05 | taken: v0.0.0-1; modified 2022-06-25                                                                      | 1 / 1            | 1 / 1            | 404 / 404           |
| maestro    | free     | 12432  | 13    | mobile-dev-inc/Maestro 16304 stars, pushed 2026-11-03      | taken: v2.1.1; modified 2022-05-08; framework for bootstrapping serverless orchestration                  | 0 / 0            | 0 / 0            | 404 / 200           |
| grove      | free     | 10997  | 7     | rigetti/grove 382 stars, pushed 2021-12-02                 | taken: v0.4.0; modified 2022-06-18                                                                        | 0 / 0            | 0 / 0            | 404 / 404           |
| orchard    | free     | 4702   | 9     | OrchardCMS/Orchard 2426 stars, pushed 2026-10-22           | taken: v3.0.1; modified 2022-06-23; Read-through, fail-through, Redis-backed caching                      | 0 / 0            | 0 / 0            | 404 / 200           |
| arbor      | free     | 4295   | 9     | samizdatco/arbor 2657 stars, pushed 2020-04-10             | taken: v0.8.2; modified 2022-06-13; CLI tool to build projects across several platforms in parallel       | 0 / 0            | 0 / 0            | 404 / 404           |
| canopy     | free     | 5138   | 14    | canopy-network/canopy 14705 stars, pushed 2026-11-03       | taken: v0.4.1; modified 2023-05-29; PEG parser compiler for JavaScript                                    | 0 / 0            | 0 / 0            | 404 / 404           |
| copse      | free     | 104    | 10    | sjdaines/COPSE 15 stars, pushed 2017-12-04                 | free (Not found)                                                                                          | 0 / 0            | 0 / 0            | 404 / 404           |
| relay      | free     | 49474  | 3     | meta/relay 18968 stars, pushed 2026-11-04                  | taken: v0.8.0-1; modified 2025-05-15; higher order functions to control flow                              | 0 / 0            | 0 / 0            | 404 / 200           |
| sluice     | free     | 386    | 12    | sagebind/sluice 103 stars, pushed 2026-04-14               | taken: v0.0.2; modified 2022-06-26; control the flow of model data                                        | 1 / 1            | 1 / 1            | 404 / 404           |
| weir       | free     | 8063   | 1     | inconvergent/weir 639 stars, pushed 2021-04-21             | taken: v0.0.5; modified 2022-06-29; simplified approach to building modern web apps                       | 0 / 0            | 0 / 0            | 404 / 404           |
| flume      | free     | 2517   | 4     | zesterer/flume 3084 stars, pushed 2026-10-15               | taken: v1.2.0; modified 2025-11-05; A node editor for React                                               | 0 / 0            | 0 / 0            | 200 / 404           |
| wright     | free     | 9220   | 1     | porsager/wright 179 stars, pushed 2024-01-09               | taken: v2.2.1; modified 2022-10-24; Hot Module Reloading at the Virtual Machine level                     | 0 / 0            | 0 / 0            | 404 / 404           |
| smithy     | free     | 936    | 4     | smithy-lang/smithy 2384 stars, pushed 2026-11-03           | taken: v0.6.3; modified 2022-06-26; Preprocessing of CSS/JS meta-languages                                | 0 / 0            | 0 / 0            | 404 / 404           |
| wrought    | free     | 109    | 1     | saintaardvark/wrought 1 stars, pushed 2018-08-06           | taken: v0.0.1; modified 2026-02-21; Wrought by FluxForge AI, engineering and operations control system    | 0 / 0            | 0 / 0            | 404 / 404           |
| joiner     | free     | 3150   | 1     | mhkeller/joiner 52 stars, pushed 2023-01-06                | taken: v2.1.3; modified 2022-12-09; SQL-like joins with Json or GeoJson data                              | 0 / 0            | 0 / 0            | 404 / 404           |
| wavesmith  | free     | 10     | 7     | lightboxtiktok-alt/WaveSmith 1 stars, pushed 2026-01-15    | free (Not found)                                                                                          | 0 / 0            | 0 / 0            | 404 / 404           |
| specsmith  | free     | 21     | 13    | murilobauck/specsmith 18 stars, pushed 2026-06-29          | taken: v0.29.0; modified 2026-08-14; Claude Code skills, agents, and scripts that drive an end-to-end dev | 0 / 0            | 0 / 0            | 404 / 404           |
| shipwright | free     | 322    | 10    | HarbourMasters/Shipwright 5836 stars, pushed 2026-11-01    | taken: v0.1.2; modified 2022-06-26; DigitalOcean CLI control                                              | 0 / 0            | 0 / 0            | 404 / 404           |
| fanout     | free     | 1288   | 3     | sunfmin/fanout 390 stars, pushed 2017-11-03                | taken: v0.3.3; modified 2022-06-17; A simple fanout pubsub message server                                 | 0 / 0            | 0 / 0            | 404 / 404           |
| unspool    | free     | 32     | 16    | r3dbars/Unspool 3 stars, pushed 2026-08-26                 | taken: v0.1.0; modified 2026-03-27                                                                        | 0 / 0            | 0 / 0            | 404 / 404           |
| forge      | free     | 174908 | 4     | electron/forge 7169 stars, pushed 2026-11-04               | taken: v2.3.0; modified 2022-06-18; A no customization 'build' system                                     | 0 / 1            | 0 / 1            | 200 / 404           |

`forge` is the current name, checked as a baseline.

## Who owns the hits

Follow-up lookups on the non-zero package and executable cells, same day.

- Debian stable executables, from the contents search's package column:
  `forge` from package `snap`, `shuttle` from `linuxcnc-uspace`, `scaffold`
  from `idba-extra`, `sluice` from `sluice`, `quorum` from `quorum`, `warp`
  from `libghc-wai-app-static-dev`, `swarm` from `swarm`.
- Homebrew formulae (`desc` and `homepage` from the formula JSON): `forge`
  is ArrayFire's visualization library, `foundry` the Ethereum toolkit,
  `braid` a vendor-branch tracker for Git, `hive` and `flume` Apache Hadoop
  tools, `keystone` an assembler framework, `cadence` a smart-contract
  language.
- Homebrew casks: `surge` (network toolbox), `crest` (notch utility), `loom`
  (screen recording), `warp` (terminal), `fleet` (JetBrains IDE), `rivet`
  (visual AI programming environment), `maestro` ("AI agent command center"),
  `orchard` (GUI for Apple Containers), `relay` (menu bar app for LLM prompts).
- `anvil` has no Homebrew formula of its own, but Foundry ships an `anvil`
  binary next to `forge`, `cast` and `chisel`
  ([foundry-rs/foundry](https://github.com/foundry-rs/foundry), accessed
  2026-11-04). The current `forge` binary shares that collision.

## Same-name repositories, descriptions

From one `gh api graphql` query on the repositories that looked closest to the
category:

| Repository          | Description (as published)                                                  | Stars |
| ------------------- | --------------------------------------------------------------------------- | ----- |
| WeaveMindAI/weft    | A programming language for AI orchestrations                                | 2024  |
| leonardcser/smelt   | A fast, Lua-scriptable coding agent for the terminal                        | 67    |
| armada-os/armada    | SteamOS-like ARM handheld distro                                            | 2051  |
| roackb2/heddle      | An open-source terminal coding agent runtime and CLI for real project work. | 27    |
| liuweichaox/Ingot   | Process root-cause tracing and optimization system (description in Chinese) | 52    |
| Kiln-AI/Kiln        | Build, Evaluate, and Optimize AI Systems (evals, RAG, agents, fine-tuning)  | 5254  |
| raeedcho/temper     | a wireless-only split keyboard based on the chocofi                         | 485   |
| porsager/wright     | Work Fast Work Wright                                                       | 179   |
| rigetti/grove       | Quantum algorithms built using pyQuil.                                      | 382   |
| tylertreat/Flotilla | Automated message queue orchestration for scaled-up benchmarking.           | 238   |
| aden-hive/hive      | Multi-Agent Harness for Production AI                                       | n/a   |
| r3dbars/Unspool     | Tiny Mac app for morning pages.                                             | 3     |
| zigpy/bellows       | A Python 3 project to implement EZSP for EmberZNet devices                  | n/a   |
| inconvergent/weir   | (deprecated) A system for making generative systems                         | n/a   |
| samizdatco/arbor    | a graph visualization library using web workers and jQuery                  | n/a   |

## Extra registries for the finalists

Not required by the spec; run because a pip or cargo install can also put a
binary on PATH.

| Name      | PyPI (`https://pypi.org/pypi/<name>/json`)                                   | crates.io (`/api/v1/crates/<name>`) |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| ingot     | 200: "A lightweight, themeable boilerplate for creating tab-based PyQt apps" | 200                                 |
| bellows   | 200: "Library implementing EZSP"                                             | 200                                 |
| weir      | 200: "A Python API for ZFS"                                                  | 200                                 |
| wavesmith | 404                                                                          | 404                                 |
| unspool   | 404                                                                          | 404                                 |
| swell     | 200: no summary                                                              | 200                                 |
| wright    | 200: "AI docstring generator that auto-documents Python, TypeScript, ..."    | 200                                 |
| joiner    | 404                                                                          | 200                                 |

## Claude Code plugin names

- **Official marketplace.** `anthropics/claude-plugins-official` at commit
  `a2e251d9b97b909bf728b3e84fc8d17e6aba0063` (2026-11-03) lists 315 plugins.
  None of the 58 names is a plugin name there. The nearest is `forge-skills`
  (Atlassian Forge skills), which sits next to the current name, not a
  candidate.
- **Marketplaces cached on this machine** (`claude-plugins-official`,
  `cloudflare`, `engram`, `remotion`): no exact match.
- **Community plugins.** There is no central index of third-party
  marketplaces. The checks were a web search per name (see
  `naming-category-search.md` in this folder) and GitHub code search,
  `gh search code <name> --filename plugin.json`, read for paths under
  `.claude-plugin/`. A first attempt with the exact phrase
  `'"name": "<name>"'` returned nothing even for the control name `temper`,
  which does have a plugin (`galando/temper/.claude-plugin/plugin.json`
  appeared once the bare term was searched with `--owner galando`). Exact
  phrase results were thrown away. Results of the bare-term searches for the
  finalists are below.

Command per name: `gh search code <name> --filename plugin.json --limit 100`,
filtered to paths containing `claude-plugin`. Hits whose plugin name was only
a substring (for example `playwright` for `wright`) were read and dropped. The
`name` field of each remaining hit was read with
`gh api repos/<owner>/<repo>/contents/<path>`.

| Name      | Plugin named exactly `<name>`                                                                                                                                   | Notes                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ingot     | Yes: `CIGIBWARIN/ingot`, `plugins/ingot` ("Ingot for Claude Code: working rules, per-project specialization ..."), 0 stars                                      | Also `tjbroodryk/forge` ships `ingot-memory`                                                           |
| bellows   | Yes: `samuel-stidham/smithy`, `plugins/bellows` ("Recurring automation plugin for the smithy family"), 1 star                                                   | The same marketplace also uses `forge`, `foundry`, `anvil` and `temper` as plugin names                |
| weir      | Yes: `tarun-khatri/weir-mcp` ("Public X (Twitter) and Reddit data for Claude Code ... through Weir's remote MCP server"), 0 stars                               | A commercial data product named Weir, not an orchestrator                                              |
| wavesmith | No hit                                                                                                                                                          |                                                                                                        |
| unspool   | No hit                                                                                                                                                          |                                                                                                        |
| swell     | No exact name. `swellstores/swell-claude-plugins` ships `swell-app` (Swell Commerce)                                                                            | `swell-agents/coding-skills` is an org named Swell Agents with a plugin named `coding-skills`, 7 stars |
| wright    | No exact name. Compounds only: `slide-wright`, `system-wright`, `thought-wright`, `loamwright`                                                                  | `-wright` is a popular plugin suffix                                                                   |
| joiner    | No hit                                                                                                                                                          | Hits were skills whose text uses the word                                                              |
| temper    | Control. Yes: `galando/temper`, `miki-przygoda/temper`, `Wet-Ink-Corporation/temper`, `krzemienski/anneal/temper`, `JamesAsuraA93/...`, `samuel-stidham/smithy` | Confirms the method finds real plugins                                                                 |

GitHub code search covers only indexed default branches and caps results, so
"No hit" means none found, not none exists.
