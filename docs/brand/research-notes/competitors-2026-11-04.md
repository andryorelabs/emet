# Raw notes — competitor research, 2026-11-04

Working log behind `docs/brand/competitors.md`. Everything here was collected on
2026-11-04 by hand with `gh api`, `npm view`, the npm downloads API, `curl` of
public HTML (only the `<title>`, `og:description`, `og:image` and `theme-color`
tags) and WebFetch of official pages. Visual notes come from looking at each
site's own Open Graph image or README logo, not from third-party coverage.

## GitHub repository metadata (`gh api repos/<owner>/<repo>`)

Stars, license (SPDX as reported by the API), last push, description.

| Repository                                                                            | Stars   | License     | Last push  | Description (verbatim)                                                                                   |
| ------------------------------------------------------------------------------------- | ------- | ----------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)                         | 92,593  | MIT         | 2026-11-04 | "🙌 OpenHands: AI-Driven Development"                                                                    |
| [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent)                         | 20,716  | MIT         | 2026-11-02 | "SWE-agent takes a GitHub issue and tries to automatically fix it, using your LM of choice. …"           |
| [github/spec-kit](https://github.com/github/spec-kit)                                 | 146,683 | MIT         | 2026-11-03 | "💫 Toolkit to help you get started with SDD or any other process!"                                      |
| [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) | 28,296  | NOASSERTION | 2026-04-28 | "An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others."     |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad)                       | 8,727   | AGPL-3.0    | 2026-08-20 | "Manage multiple AI terminal agents like Claude Code, Codex, OpenCode, and Amp."                         |
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)                         | 28,581  | Apache-2.0  | 2026-11-03 | "Get 10X more out of Claude Code, Codex or any coding agent"                                             |
| [imbue-ai/sculptor](https://github.com/imbue-ai/sculptor)                             | 244     | MIT         | 2026-11-03 | "Build product with grounded, parallel coding agents."                                                   |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)             | 54,956  | NOASSERTION | 2026-11-03 | "Breakthrough Method for Agile Ai Driven Development"                                                    |
| [stravu/crystal](https://github.com/stravu/crystal)                                   | 3,130   | MIT         | 2026-02-26 | "(Crystal is now Nimbalyst) Run multiple Codex and Claude Code AI sessions in parallel git worktrees. …" |
| [cyrusagents/cyrus](https://github.com/cyrusagents/cyrus)                             | 882     | Apache-2.0  | 2026-11-03 | "The Claude Code background agent for Linear, Slack, Github, GitLab etc. you deploy anywhere. …"         |
| [openai/codex](https://github.com/openai/codex)                                       | 133,016 | Apache-2.0  | 2026-11-04 | "Lightweight coding agent that runs in your terminal"                                                    |
| [sweepai/sweep](https://github.com/sweepai/sweep)                                     | 7,708   | NOASSERTION | 2025-09-18 | "Sweep: AI coding assistant for JetBrains"                                                               |
| [tailcallhq/forgecode](https://github.com/tailcallhq/forgecode)                       | 7,633   | Apache-2.0  | 2026-11-03 | "AI enabled pair programmer for Claude, GPT, O Series, Grok, Deepseek, Gemini and 300+ models"           |

Notes on the API answers:

- `All-Hands-AI/OpenHands` now resolves to `OpenHands/OpenHands`.
- `ceedaragents/cyrus` resolves to `cyrusagents/cyrus`.
- `antinomyhq/forge` resolves to `tailcallhq/forgecode` (homepage
  `forgecode.dev`). This is a coding agent that was named "forge"; relevant to
  the rename study.
- `sweepai/sweep` used to be a GitHub issue-to-PR bot; its description now
  says it is a JetBrains assistant. It is left out of the main table because
  it no longer does the job in scope.
- SWE-agent's README says development moved to `mini-swe-agent`, which
  "has superseded SWE-agent".

## npm (`npm view` and `api.npmjs.org/downloads/point/last-month`)

Window 2026-10-04 to 2026-11-02.

| Package          | Version | License (`npm view`)    | Downloads last month |
| ---------------- | ------- | ----------------------- | -------------------- |
| `task-master-ai` | 0.43.1  | MIT WITH Commons-Clause | 46,765               |
| `vibe-kanban`    | 0.1.44  | (empty)                 | 10,896               |
| `@openai/codex`  | not run | not run                 | 84,964,065           |

## Official pages: titles and meta tags (`curl`)

| Site                                                 | `<title>`                                                    | `theme-color`         | `og:image` seen                 |
| ---------------------------------------------------- | ------------------------------------------------------------ | --------------------- | ------------------------------- |
| [devin.ai](https://devin.ai)                         | Devin: the autonomous software engineer                      | none                  | yes, viewed                     |
| [jules.google](https://jules.google)                 | Jules - An Autonomous Coding Agent                           | none                  | yes, viewed                     |
| [factory.com](https://factory.com/)                  | Factory \| Agent-Native Software Development                 | `#f9f9f9`             | yes, viewed                     |
| [openhands.dev](https://openhands.dev)               | OpenHands \| Open Source AI Coding Agent Platform            | none                  | yes, viewed                     |
| [vibekanban.com](https://www.vibekanban.com)         | Vibe Kanban - Orchestrate AI Coding Agents                   | `#1f2937`             | product screenshot, not viewed  |
| [conductor.build](https://www.conductor.build)       | Conductor - Run a team of coding agents in the cloud         | `#2c2826` / `#eae8e6` | yes, viewed                     |
| [kiro.dev](https://kiro.dev)                         | Kiro: Move beyond AI coding to agentic engineering           | none                  | yes, viewed                     |
| [ampcode.com](https://ampcode.com)                   | Amp: Coding agent and dev environment built for the frontier | `#091c1e` / `#dfdfc1` | yes, viewed                     |
| [tessl.io](https://www.tessl.io)                     | Tessl - Software factory                                     | none                  | yes, viewed                     |
| [atcyrus.com](https://atcyrus.com)                   | Cyrus \| The BYOK Solution for Claude Code in Linear         | none                  | product screenshot, viewed      |
| [cursor.com](https://cursor.com)                     | AI Coding Agent for Building Ambitious Software \| Cursor    | `#14120b` / `#f7f7f4` | yes, viewed                     |
| [imbue.com/sculptor](https://imbue.com/sculptor/)    | Sculptor: the missing UI for parallel coding agents - Imbue  | none                  | product screenshot, viewed      |
| [docs.bmad-method.org](https://docs.bmad-method.org) | Build Software with BMad \| BMad Method                      | not checked           | none found                      |
| [linear.app/agents](https://linear.app/agents)       | Linear for Agents                                            | not checked           | generic Linear card, not viewed |

Two theme colors means a light and a dark value. Kiro's homepage HTML contains
`#C6A0FF` (a light purple) among its few literal hex values; its OG image uses a
purple cursor next to a white ghost.

## What the Open Graph images and README logos show

- **Devin:** black wordmark and a mark built from three rounded hexagon-like
  lobes, on a light grid with photo and sketch collage tiles.
- **Jules:** a white octopus (round head, two eyes, curling tentacles) next to a
  lowercase rounded wordmark, on a flat saturated purple.
- **Factory:** black uppercase geometric wordmark and a radial pinwheel or
  starburst mark of curved blades, on white with a grey dot field.
- **OpenHands:** the "raising hands" emoji (🙌) as the logo, a dark sans
  wordmark, on a cream background with ASCII-art texture.
- **SWE-agent:** a black line illustration of a hand reaching out of a monitor
  onto a keyboard, wordmark in a DIN-like sans, on cream.
- **Kiro:** a white ghost with two eyes next to a pixel-outlined uppercase
  wordmark; black UI with a purple text cursor. Headline: "Meet Kiro, an agent
  for structured AI coding."
- **Conductor:** a pixel or bitmap uppercase wordmark over a blue sky with
  clouds; the app UI shows a "Ready to merge" state.
- **Amp:** a lowercase "amp" mark in cream on a near-black, with a serif
  display headline "Engineered For The Frontier".
- **Tessl:** an isometric cube built from interlocking segments, white on
  near-black.
- **Cursor:** a hexagonal cube with an arrow cut into it, next to an uppercase
  wide wordmark, light grey on near-black.
- **Spec Kit:** a 3D seedling emoji in a rounded square with a purple to pink to
  blue gradient; README title uses 🌱.
- **Taskmaster:** a knot-like interlaced mark and a lowercase wordmark, white on
  black.
- **Cyrus:** no logo in the OG image; it is a Linear issue thread where the
  agent posts a plan checklist and "Work Completed", on a blue to pink
  gradient.
- **Sculptor:** no logo in the OG image; it is the app UI in warm beige and
  olive neutrals with a "Merge" button.

## Official pages read with WebFetch (summaries of the fetched text)

- **Devin** ([devin.ai](https://devin.ai)): headline "Meet Devin, your team's
  autonomous software engineer"; Jira integration "Assign a ticket, get a PR";
  Linear "picks up issues when they're assigned"; enterprise customers listed.
- **Jules** ([jules.google](https://jules.google)): "Jules does coding tasks you
  don't want to do"; flow is pick repo and branch or add the `jules` label to a
  GitHub issue, plan in a cloud VM, approve plan, review diff, open PR.
- **Factory** ([factory.com](https://factory.com/)): "Build Your Software
  Factory"; agents are called Droids and run in CLI, desktop, web, Slack,
  Teams, Jira, Linear and CI; "Missions" for long multi-phase work with human
  approval checkpoints.
- **Vibe Kanban** ([vibekanban.com](https://www.vibekanban.com)): "Product
  management for teams building with AI"; kanban of issues, agents run in
  parallel in git worktrees, review in-app; the page announces the product is
  sunsetting and continues as community-maintained open source.
- **Codex cloud**
  ([learn.chatgpt.com/docs/cloud](https://learn.chatgpt.com/docs/cloud)):
  "Run coding tasks in the cloud"; one workspace per task, several tasks from
  one environment, review then commit or open a PR. `openai.com/codex/`
  answered 403 to WebFetch, so that page was not read.
- **GitHub Copilot**
  ([github.com/features/copilot](https://github.com/features/copilot)): "AI
  coding agent for tasks, projects and automated work"; "Start from an issue or
  pull request"; follow-up changes go to the "Copilot cloud agent".
- **Copilot brand**
  ([brand.github.com/brand-identity/copilot](https://brand.github.com/brand-identity/copilot)):
  "Beginning in 2025, GitHub Copilot no longer has a standalone logo that heros
  the Copilot icon"; primary color Copilot Purple `#8534F3`; purple and orange
  ramps; a mascot "with a soft, cool tone and blue shading with a splash of
  pink", to be used sparingly.
- **BMad Method** ([docs.bmad-method.org](https://docs.bmad-method.org)): "Turn
  ideas into software. At any scale."; skills for Claude Code and Cursor; loop
  Clarify, Plan, Build and verify, Learn and adjust; a named persona "Sofia, the
  Product Owner"; "BMad is a trademark of BMad Code, LLC"; MIT.
- **Linear for Agents** ([linear.app/agents](https://linear.app/agents)):
  "Artificial colleagues. Natural collaboration."; agents are workspace members
  that can be assigned or delegated issues; partners listed include Cursor,
  OpenAI Codex, Devin, Factory, Charlie and Tembo.

## Not checked, and why

- Vibe Kanban, Claude Squad, BMad, Codex and Amp logos beyond what the OG image
  shows: not opened, to stay inside the research budget.
- Kiro's and Devin's corporate parents: not stated on the pages read, so the
  main document does not name them.
- Star counts for closed products (Devin, Jules, Factory, Cursor, Kiro, Amp,
  Conductor, Tessl): no public repository to count.
