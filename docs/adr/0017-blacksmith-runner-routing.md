# 0017. Blacksmith runner routing

Status: Accepted (2026-11-06)
Revised: 2026-11-16, CodeQL and the `ci.yml` Bun canary are routed; the routed and literal job tables, each with a reason, move to `tools/workflow-rules.ts`

## Context

The andryorelabs repos (andryore-web, animated-fluent-emojis, snug, emet, aokit) agreed on one CI runner standard. emet is public, so GitHub-hosted `ubuntu-latest` is free, unlimited and 4 vCPU. The Blacksmith free tier is 3000 minutes a month on 2 vCPU, shared by the whole org, and the light jobs of the public repos already exceed it. A repo variable `CI_RUNNER=vps-dind` pointed at a self-hosted VPS runner; an expression without a `private` gate would have sent fork PRs onto that machine.

Last 30 days in emet, billed minutes on `ubuntu-latest`: PR title 110, markdown links 92, test 63, actionlint and zizmor 29, labels 16, about 310 in total. macOS is about 377 and CodeQL about 85.

## Decision

- **One variable, `BLACKSMITH_RUNNER`**, that only ever holds a Blacksmith label such as `blacksmith-2vcpu-ubuntu-2404`. It is unset by default in this public repo.
- **Routed jobs** use exactly `${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}`: `ci.yml` check, test, bun-canary, commitlint and ci-passed, `codeql.yml` analyze, `labels.yml` sync, `lint-docs.yml` check-links, `lint-pr.yml` validate-title and `lint-workflows.yml` lint. Fork PRs always stay on GitHub-hosted runners. CodeQL uses build-mode none, so it needs no toolchain beyond a Linux runner.
- **Never routed**: the macOS job, Scorecard, the deploy job and the release jobs keep a literal `runs-on`. Release needs GitHub-hosted runners for provenance, Scorecard's `publish_results` needs one, deploy holds the Coolify token, and Blacksmith has no macOS runner.
- **No self-hosted or VPS runners**, and no Blacksmith actions. `CI_RUNNER` was deleted.
- `tools/workflow-rules.ts` holds `ROUTED_JOBS` and `LITERAL_JOBS`, each entry with its reason, and `workflowViolations`. `tools/workflows-invariants.test.ts` runs it over every workflow and fails on an unlisted job, any other expression, `vps-*`, `self-hosted` or `CI_RUNNER`.
- To enable: `gh variable set BLACKSMITH_RUNNER --body blacksmith-2vcpu-ubuntu-2404`, only after a before and after measurement. To roll back: `gh variable delete BLACKSMITH_RUNNER`.

## Consequences

- Behaviour is unchanged until the variable is set.
- Adding a workflow job means choosing routed or literal, and adding it with a reason to `tools/workflow-rules.ts`.
- Speed comes from splitting jobs, not from the runner label.

## Alternatives considered

- **Keep the `private &&` gate**: safe, but it ignores the variable on public repos, so the standard would do nothing.
- **Keep `CI_RUNNER`**: the name is ambiguous with the VPS runner label used elsewhere.
- **Route every job**: the public repos would spend the shared 3000 minutes in about a week.
