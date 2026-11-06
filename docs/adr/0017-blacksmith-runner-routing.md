# 0017. Blacksmith runner routing

Status: Accepted (2026-11-06)

## Context

The andryorelabs repos (andryore-web, animated-fluent-emojis, snug, emet, aokit) agreed on one CI runner standard. emet is public, so GitHub-hosted `ubuntu-latest` is free, unlimited and 4 vCPU. The Blacksmith free tier is 3000 minutes a month on 2 vCPU, shared by the whole org, and the light jobs of the public repos already exceed it. A repo variable `CI_RUNNER=vps-dind` pointed at a self-hosted VPS runner; an expression without a `private` gate would have sent fork PRs onto that machine.

Last 30 days in emet, billed minutes on `ubuntu-latest`: PR title 110, markdown links 92, test 63, actionlint and zizmor 29, labels 16, about 310 in total. macOS is about 377 and CodeQL about 85.

## Decision

- **One variable, `BLACKSMITH_RUNNER`**, that only ever holds a Blacksmith label such as `blacksmith-2vcpu-ubuntu-2404`. It is unset by default in this public repo.
- **Routed jobs** use exactly `${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}`: `ci.yml` check, test, commitlint and ci-passed, `labels.yml` sync, `lint-docs.yml` check-links, `lint-pr.yml` validate-title and `lint-workflows.yml` lint. Fork PRs always stay on GitHub-hosted runners.
- **Never routed**: the macOS job, CodeQL, Scorecard and the release jobs keep a literal `runs-on`. Release needs GitHub-hosted runners for provenance.
- **No self-hosted or VPS runners**, and no Blacksmith actions. `CI_RUNNER` was deleted.
- `tools/workflows-invariants.test.ts` lists the routed jobs and fails on any other expression, `vps-*`, `self-hosted` or `CI_RUNNER`.
- To enable: `gh variable set BLACKSMITH_RUNNER --body blacksmith-2vcpu-ubuntu-2404`, only after a before and after measurement. To roll back: `gh variable delete BLACKSMITH_RUNNER`.

## Consequences

- Behaviour is unchanged until the variable is set.
- Adding a workflow job means choosing routed or literal, and updating the test list.
- Speed comes from splitting jobs, not from the runner label.

## Alternatives considered

- **Keep the `private &&` gate**: safe, but it ignores the variable on public repos, so the standard would do nothing.
- **Keep `CI_RUNNER`**: the name is ambiguous with the VPS runner label used elsewhere.
- **Route every job**: the public repos would spend the shared 3000 minutes in about a week.
