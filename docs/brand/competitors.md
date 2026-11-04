# Competitor analysis — orchestrating coding agents from spec to merge

Run 1 research for the claude-forge rebrand. This is input for the naming,
mascot, palette and type work, not a decision on any of them.

## Scope

In scope: tools that take a spec, a ticket or an issue and drive one or more
coding agents to a reviewed, mergeable change. That covers three groups:

1. **Hosted ticket-to-PR agents.** You assign an issue in a tracker or chat and
   get a pull request back.
2. **Local parallel-agent managers.** Run several agent sessions at once in
   isolated git worktrees, then review and merge.
3. **Spec and process frameworks.** Turn an idea into a spec, a plan and tasks
   that a coding agent then executes.

claude-forge sits across all three: an interview, a spec, tickets, one approval,
then parallel worktree agents that implement, test and merge unattended, inside
Claude Code, with Linear, GitHub Issues or no tracker.

Out of scope: plain code-completion and chat assistants, IDEs without an
assign-and-forget mode, and code-review-only bots.

Method: data collected on **2026-11-04** from each tool's own site, docs,
repository and brand pages, plus the GitHub API, `npm view` and the npm
downloads API. Visual notes come from each tool's own Open Graph image or README
logo. Every source below was accessed on 2026-11-04. Raw data, commands and
what was not checked are in
[research-notes/competitors-2026-11-04.md](research-notes/competitors-2026-11-04.md).

## Our own listing (baseline)

- **What it does:** the `/forge` command for Claude Code: interview → spec →
  tickets → one approval → parallel worktree agents that implement, test and
  merge a feature unattended. One wave is one dependency layer and lands as one
  PR or one local merge.
- **Audience:** a developer or small team that already uses Claude Code and
  wants a feature taken from idea to merged change with a single approval.
- **Name:** "claude-forge", binary `forge`, command `/forge:run`. It carries
  "Claude", which the rename removes (S3). The metaphor is craft: heat, shape,
  temper.
- **Collision already found:** a coding agent called Forge exists,
  [tailcallhq/forgecode](https://github.com/tailcallhq/forgecode) (7,633 stars,
  Apache-2.0, homepage `forgecode.dev`; formerly `antinomyhq/forge`). The
  naming study (S3) owns the full collision check.
- **Visual identity:** none yet.

## Competitors

Stars are GitHub stars from the API on 2026-11-04; "closed" means no public
repository to count.

| #   | Tool                                                              | Group           | What it does                                                                                     | Audience                                          | Name and metaphor                                           | Visual identity                                                                                | Reach                                           |
| --- | ----------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | [GitHub Copilot cloud agent](https://github.com/features/copilot) | Hosted          | Starts agent sessions from an issue or PR, works in the background, opens a pull request         | Every GitHub user on a paid Copilot plan          | Copilot: aviation, the second pilot beside you              | Copilot Purple `#8534F3`, purple and orange ramps, a soft blue mascot; standalone logo retired | closed                                          |
| 2   | [Devin](https://devin.ai)                                         | Hosted          | Autonomous engineer; "Assign a ticket, get a PR" from Jira, Linear, Slack                        | Engineering teams, large enterprises              | A human first name: the agent as a colleague                | Black three-lobed hex mark, plain sans wordmark, light grid with collage tiles                 | closed                                          |
| 3   | [OpenAI Codex cloud](https://learn.chatgpt.com/docs/cloud)        | Hosted          | Runs each task in its own cloud workspace, then you review and open a PR                         | ChatGPT users and developers                      | Codex: a bound manuscript, code as a book                   | not checked (OpenAI brand; `openai.com/codex` refused the fetch)                               | CLI repo 133,016 stars; 85M npm/month           |
| 4   | [Jules](https://jules.google)                                     | Hosted          | Label a GitHub issue `jules` or prompt it; plans in a cloud VM, you approve, it opens a PR       | Developers, from first tasks to "agents at scale" | A human first name, made friendly by a mascot               | White octopus mascot, rounded lowercase wordmark, flat saturated purple                        | closed                                          |
| 5   | [Factory](https://factory.com/)                                   | Hosted          | "Droids" take backlog work from Jira, Linear, Slack and CI; "Missions" for long multi-phase work | Engineering organisations                         | Factory and droids: industrial production, robots           | Black geometric uppercase wordmark, radial pinwheel or starburst mark, white and grey dots     | closed                                          |
| 6   | [Cursor](https://cursor.com)                                      | Hosted          | Editor with agents you hand tasks to; Linear lists it as drafting branches from assigned issues  | Professional developers                           | Cursor: the text caret, the place where you act             | Hex cube with an arrow cut in, wide uppercase wordmark, near-black `#14120b` and `#f7f7f4`     | closed                                          |
| 7   | [Cyrus](https://atcyrus.com)                                      | Hosted          | Claude Code (and other harnesses) as a background agent for Linear, Slack, GitHub, GitLab        | Product teams on Linear, bring-your-own-key       | A human first name                                          | No logo in its card; Linear-thread screenshot on a blue to pink gradient                       | 882 stars, Apache-2.0                           |
| 8   | [OpenHands](https://openhands.dev)                                | Hosted, open    | Open platform for cloud coding agents; local or hosted, any model                                | Developers and enterprises wanting open source    | Hands: the agent does the manual work                       | The 🙌 emoji as logo, dark sans wordmark, cream with ASCII texture                             | 92,593 stars, MIT                               |
| 9   | [SWE-agent](https://github.com/SWE-agent/SWE-agent)               | Research        | Takes a GitHub issue and tries to fix it with the model of your choice                           | Researchers and benchmarkers                      | Literal: software engineer + agent                          | Black line drawing of a hand coming out of a monitor onto a keyboard, on cream                 | 20,716 stars, MIT; superseded by mini-swe-agent |
| 10  | [Conductor](https://www.conductor.build)                          | Local and cloud | "Run a team of coding agents"; per-workspace agents with a ready-to-merge view                   | Developers running several agents                 | Conductor: an orchestra, one person directing many          | Pixel uppercase wordmark, blue sky with clouds, warm neutrals `#2c2826` and `#eae8e6`          | closed                                          |
| 11  | [Vibe Kanban](https://www.vibekanban.com)                         | Local           | Kanban of issues; agents run in parallel git worktrees; review in-app; status follows PRs        | Teams building with AI agents                     | "Vibe coding" + kanban board                                | Dark slate `#1f2937`; logo not checked                                                         | 28,581 stars, Apache-2.0; sunsetting            |
| 12  | [Claude Squad](https://github.com/smtg-ai/claude-squad)           | Local           | Terminal app that runs Claude Code, Codex, Gemini, Aider in separate isolated workspaces         | Terminal-first developers                         | Squad: a small team; borrows the "Claude" name              | not checked                                                                                    | 8,727 stars, AGPL-3.0                           |
| 13  | [Sculptor](https://imbue.com/sculptor/)                           | Local           | "The missing UI for parallel coding agents": plan, changes, merge per agent                      | Developers running parallel agents                | Sculptor: craft, shaping material by hand                   | Warm beige and olive UI neutrals, blue accent; no logo in its card                             | 244 stars, MIT                                  |
| 14  | [Spec Kit](https://github.com/github/spec-kit)                    | Spec            | Spec-Driven Development toolkit: spec → plan → tasks → implementation, for any coding agent      | Developers adopting a spec-first process          | Kit: a toolbox; 🌱 growth                                   | 3D seedling in a rounded square, purple to pink to blue gradient                               | 146,683 stars, MIT                              |
| 15  | [Taskmaster](https://github.com/eyaltoledano/claude-task-master)  | Spec            | Turns a PRD into tasks an agent in Cursor, Windsurf, Roo and others works through                | Solo developers in AI editors                     | Taskmaster: the boss who assigns work; repo still "claude-" | Interlaced knot mark, lowercase wordmark, white on black                                       | 28,296 stars; 46,765 npm/month                  |
| 16  | [BMad Method](https://docs.bmad-method.org)                       | Spec            | Skills for Claude Code and Cursor: Clarify, Plan, Build and verify, Learn; named agent personas  | Developers who want control over what ships       | An acronym turned name; agile vocabulary                    | not checked                                                                                    | 54,956 stars                                    |
| 17  | [Kiro](https://kiro.dev)                                          | Spec            | "Turn prompts into executable specs", hooks and steering, parallel agents                        | Developers and teams                              | A short invented name                                       | White ghost mascot, pixel-outlined wordmark, black UI with a purple cursor (`#C6A0FF` on site) | closed                                          |
| 18  | [Tessl](https://www.tessl.io)                                     | Spec            | "Software factories through versioned context and repeatable agent workflows"                    | Teams scaling agent-written code                  | Tessellation: tiles that fit together                       | Isometric interlocking cube, white on near-black                                               | closed                                          |

Adjacent and not counted: [Amp](https://ampcode.com) (a coding agent whose
"orbs" run unsupervised; cream lowercase mark on near-black `#091c1e`, serif
headline), [Linear for Agents](https://linear.app/agents) (the tracker surface
many of the hosted agents plug into), and
[Sweep](https://github.com/sweepai/sweep) (once an issue-to-PR bot, now
described as a JetBrains assistant).

## Per-competitor notes

1. **GitHub Copilot cloud agent.** The default for anyone on GitHub. Its brand
   guide says "Beginning in 2025, GitHub Copilot no longer has a standalone
   logo" and it now sits inside the GitHub lockup; purple `#8534F3` is its
   colour, and the mascot is to be used "sparingly"
   ([brand.github.com](https://brand.github.com/brand-identity/copilot)).
   Lesson: a product name can outlive its own mark.
2. **Devin.** Positions as a teammate: "your team's autonomous software
   engineer … won't stop until the PR is ready to merge"
   ([devin.ai](https://devin.ai)). Restrained black-and-white identity; the
   person-name does the warmth.
3. **OpenAI Codex cloud.** One workspace per task, several tasks from one
   environment, then commit or PR
   ([learn.chatgpt.com](https://learn.chatgpt.com/docs/cloud)). The CLI is huge
   on npm (84,964,065 downloads in the 30 days to 2026-11-02), so "agent in the
   terminal" is a crowded phrase.
4. **Jules.** The clearest mascot in the category: a simple octopus that reads
   at any size, on one flat purple ([jules.google](https://jules.google)). Many
   arms is an obvious "parallel work" metaphor, and it is now taken.
5. **Factory.** Owns the industrial vocabulary: Factory, Droids, Missions,
   "Build Your Software Factory" ([factory.com](https://factory.com/)). Its
   radial pinwheel mark is visually close to the starburst family that Claude's
   spark also belongs to.
6. **Cursor.** Not an orchestrator first, but Linear lists it among agents that
   draft branches from assigned issues
   ([linear.app/agents](https://linear.app/agents)). Near-black and warm
   off-white palette ([cursor.com](https://cursor.com)).
7. **Cyrus.** Closest in mechanism to claude-forge's Linear path: an agent that
   is assigned a Linear issue, posts a plan checklist and opens a PR
   ([atcyrus.com](https://atcyrus.com),
   [cyrusagents/cyrus](https://github.com/cyrusagents/cyrus)). Its repo
   description calls it "The Claude Code background agent", which ties its
   positioning to one vendor.
8. **OpenHands.** The open-source reference (92,593 stars). Using a stock emoji
   as a logo is cheap and friendly but not ownable
   ([openhands.dev](https://openhands.dev)).
9. **SWE-agent.** The research ancestor of "issue in, fix out"; its README
   now says mini-swe-agent "has superseded SWE-agent"
   ([SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent)).
10. **Conductor.** Musical metaphor for one human directing many agents; its
    card shows a "Ready to merge" state, the same end state claude-forge aims
    for ([conductor.build](https://www.conductor.build)).
11. **Vibe Kanban.** Board-first orchestration with worktrees. Its site
    announces it is sunsetting and continuing as community-maintained open
    source ([vibekanban.com](https://www.vibekanban.com)).
12. **Claude Squad.** Manages Claude Code, Codex, Gemini and Aider
    ([smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad)), yet the
    name says "Claude". A live example of the vendor-name problem the rename
    avoids.
13. **Sculptor.** Craft metaphor, parallel agents with a per-agent plan and a
    merge button ([imbue.com/sculptor](https://imbue.com/sculptor/)). Its warm
    beige UI sits close to the Anthropic-adjacent warm-neutral look.
14. **Spec Kit.** The largest repository in scope (146,683 stars) and the owner
    of "Spec-Driven Development" as a term
    ([github/spec-kit](https://github.com/github/spec-kit)). Growth metaphor
    (🌱) on a purple gradient.
15. **Taskmaster.** The brand is "taskmaster" while the repository is still
    `claude-task-master`
    ([eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master)):
    the rename path claude-forge is about to take, half done.
16. **BMad Method.** Methodology as product, with named personas such as
    "Sofia, the Product Owner"; "BMad is a trademark of BMad Code, LLC"
    ([docs.bmad-method.org](https://docs.bmad-method.org)).
17. **Kiro.** Spec-first with a ghost mascot and a purple accent
    ([kiro.dev](https://kiro.dev)). Second purple-plus-mascot brand in the
    category after Jules.
18. **Tessl.** Also uses "software factory"
    ([tessl.io](https://www.tessl.io)); a cube mark like Cursor's.

## Lessons

- **The category splits by where the work runs, not by what it does.** Hosted
  agents (Copilot, Devin, Codex, Jules, Factory, Cyrus) sell to organisations;
  local managers (Conductor, Vibe Kanban, Claude Squad, Sculptor) sell a UI for
  watching many agents; spec frameworks (Spec Kit, Taskmaster, BMad, Kiro,
  Tessl) sell a process. Few tools do all three steps (spec, parallel
  execution, merge) in one command with one approval. That end-to-end,
  "approve once, come back to a merge" promise is the unclaimed position.
- **Local and tracker-agnostic is a real difference.** Hosted agents run in
  their own cloud; claude-forge runs on the developer's machine and works with
  Linear, GitHub Issues or no tracker. The brand can say "your repo, your
  machine, your tracker" without claiming more than ships.
- **Vendor names age badly.** Claude Squad runs four agent families under a
  "Claude" name; Taskmaster rebranded but kept a `claude-` repository; Cyrus
  calls itself "the Claude Code background agent". The rename should not
  borrow any model or vendor name.
- **Churn is high, so the brand should not depend on a host.** In this one
  sample: Vibe Kanban is sunsetting, Crystal became Nimbalyst, Sweep changed
  product, SWE-agent was superseded, and Copilot retired its standalone logo.
  A name and mark that describe the job (spec → merge) survive a change of
  agent runtime better than ones tied to it.
- **Personal names and mascots carry warmth in an austere category.** Devin,
  Jules, Cyrus and Kiro are first names; Jules and Kiro add a simple mascot.
  A mascot works when it is one silhouette, one colour, readable at small sizes
  (Jules' octopus, Kiro's ghost); the mascot study (S2) covers this in depth.
- **Metaphors cluster.** Workforce and industry (Factory, Droids, Squad,
  Taskmaster, Conductor, "software factory" twice), hands and craft (OpenHands,
  SWE-agent's hand, Sculptor, Forge), and growth (Spec Kit). A craft metaphor is
  still open but now shares space with Sculptor and with forgecode's "Forge".
- **The visual default is near-black plus warm off-white.** Cursor, Amp,
  Conductor and Sculptor all use it, and it is also close to Anthropic's warm
  neutrals. Standing apart means either a cooler neutral base or a distinct
  accent, not another cream-and-charcoal page.
- **Purple is the crowded accent.** Copilot (`#8534F3`), Jules, Kiro and Spec
  Kit all lead with purple or violet.

## Territories to avoid

These are areas where a new name or visual would be confused with a competitor
or with Anthropic and Claude. They are risks to weigh, not rules.

### Naming

- **Any model or vendor word:** "Claude", "Anthropic", "Codex", "Copilot",
  "Gemini", "GPT". Required by the rename, and confirmed by the Claude Squad and
  Taskmaster cases above.
- **"Forge" as the lead word:** taken by a coding agent
  ([tailcallhq/forgecode](https://github.com/tailcallhq/forgecode)). Other
  same-name products were not checked here; S3 owns that.
- **Industrial workforce words:** factory, droid, mission, squad, crew,
  taskmaster, foreman. Factory and Tessl already own "software factory".
- **Orchestra words:** conductor, maestro, orchestra. Conductor holds the lead
  one.
- **Plain human first names:** Devin, Jules, Cyrus and Kiro make this the
  default move; a new one would blend in.
- **"Spec kit", "spec-driven", "kanban", "squad", "sculptor":** each belongs to
  one tool above.

### Visual

- **Anthropic and Claude proximity:** no clay or terracotta orange, no warm
  cream-and-charcoal pairing as the main identity, no radial starburst or spark
  mark, no small pixel creature that could read as Clawd. Factory's pinwheel
  shows how close a starburst lands to Claude's spark.
- **Purple or violet as the hero accent:** Copilot, Jules, Kiro, Spec Kit.
- **Octopus, ghost and hand mascots:** Jules, Kiro, OpenHands and SWE-agent.
- **Hexagon and isometric cube marks:** Devin, Cursor, Tessl.
- **Pixel or bitmap wordmarks:** Conductor and Kiro already use them.
- **A stock emoji as the logo:** OpenHands and Spec Kit do it; it is not
  ownable.

## Open questions for the maintainer

- Lead with the end-to-end promise ("one approval, merged change") or with the
  local, tracker-agnostic angle? Both are open; the evidence above favours the
  first as the headline and the second as proof.
- Is a mascot wanted at all, given that two of the strongest marks here
  (Jules, Kiro) are mascot-led and the field is getting crowded? S2 weighs
  this.
