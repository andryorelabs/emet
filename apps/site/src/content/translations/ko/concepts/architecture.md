---
title: 아키텍처
description: emet/src의 코드 맵과 /emet 프롬프트가 이를 어떻게 구동하는지 설명합니다.
seoTitle: emet 아키텍처
sourceHash: ac65f41cf78af13e
---

`emet/src`의 코드 맵과 `/emet` 프롬프트가 이를 어떻게 구동하는지 설명합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따르며, 이 구조의 배경이 된 결정은 [docs/adr](../adr/README.md)에 있습니다. 문제가 생기면 [문제 해결](../troubleshooting.md)을 참고하세요.

- [구조](#구조)
- [프롬프트가 CLI를 구동하는 방식](#프롬프트가-cli를-구동하는-방식)
- [모듈 맵](#모듈-맵)
- [프롬프트 배치](#프롬프트-배치)
- [배포](#배포)
- [함께 보기](#함께-보기)

## 구조

두 부분으로 이루어져 있습니다. 프롬프트(`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, 그리고 Codex용으로 생성되는 `codex/skills/**`와 `codex/hooks.json`)는 각 단계에서 에이전트가 무엇을 해야 하는지 알려 줍니다. `emet` CLI(`emet/bin/emet.ts`와 `emet/src/`)는 결정적이어야 하는 모든 일, 즉 점검, 클레임, 슬롯, 게이트, 트래커 쓰기, 랜딩을 처리합니다. 프롬프트는 CLI가 이미 수행하는 점검을 다시 구현하지 않습니다.

`emet/bin/emet.ts`는 얇은 디스패처입니다. 첫 번째 인자를 읽고 하위 명령 모듈 하나에 넘기며, 그 모듈이 나머지 `process.argv`를 직접 읽습니다. 종료 코드는 모든 하위 명령에서 같은 의미를 가집니다.

## 프롬프트가 CLI를 구동하는 방식

`commands/run.md`는 짧은 라우터입니다. `emet/reference/`의 단계 파일을 한 번에 하나씩 불러오므로, 컴팩션이 일어나도 현재 단계의 규칙이 사라지지 않습니다.

| 단계                         | 프롬프트                                                                                      | CLI 호출                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 인터뷰, 스펙, 티켓, 승인 | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 디스패치와 워커          | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 리뷰, 게이트, 랜딩, 마무리 | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 핸드오프와 체이닝          | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

코디네이터는 유일하게 트래커에 쓸 수 있는 주체입니다(ADR-0005). 워커는 핸드오프 노트와 `emet results`로 보고하고, 코디네이터가 이를 게시합니다. `emet guard`는 `PreToolUse` 훅으로 실행되어 무인 실행에서 실패를 일으키는 것으로 알려진 동작을 차단합니다.

## 모듈 맵

각 모듈 옆에는 `*.test.ts`가 있습니다. `tools/architecture-map.test.ts`는 `emet/src`의 테스트가 아닌 모듈이 이 목록에서 빠지면 실패합니다.

**설정, 설치, 감사**

- `init.ts`는 설정과 문서 골격을 작성하고, `config.ts`는 `emet.config.json`을 읽으며(예전 `forge.config.json`도 여전히 읽음), `names.ts`는 이름을 현재 또는 예전 표기로 해석합니다.
- `doctor.ts`는 플릿 스윕이고, `preflight.ts`는 디스패치 위생을 점검하며, `dependencies.ts`와 `skills.ts`(mattpocock-skills 계약)는 실행에 필요한 것을 점검하고, `map.ts`는 코드베이스 개요를 작성하며, `plugin-detect.ts`는 어떤 플러그인이 설치되어 있는지 보고합니다.
- `setup.ts`는 선택 사항 추가 항목을 설치하고, `setupledger.ts`는 되돌릴 수 있도록 각 변경을 기록하며, `settingsapply.ts`는 권장 Claude Code 설정을 담고 있습니다.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts`, `self-host-codex.ts`는 `emet self`, 즉 설치, 소스 설치, 업데이트, 호스트별 파일을 구현합니다. `hooks-merge.ts`는 emet 훅을 호스트 설정에 병합하고, `uninstall.ts`는 원장을 보고 설치를 되돌리며, `migrate.ts`는 예전 이름을 옮기고, `update-notice.ts`와 `whats-new.ts`는 새 릴리스를 사용자에게 알리며, `embedded-tree.generated.ts`는 컴파일된 바이너리에 내장된 파일을 담고 있습니다.
- `assets.ts`는 그 내장 파일을 읽습니다.

**실행 상태**

- `claims.ts`는 티켓 예약을, `slots.ts`는 워커 슬롯 풀을, `resources.ts`는 호스트 정보를, `runs.ts`는 생존 여부를, `runcurrent.ts`는 체크아웃의 현재 실행을 담당합니다.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts`, `landed.ts`는 워크트리, 락, 그리고 랜딩된 브랜치의 정리를 관리합니다.
- `status.ts`는 웨이브와 세션을 보고하고, `launch.ts`와 `chain.ts`는 실행과 다음 웨이브를 무인으로 시작하며, `fleet.ts`는 여러 저장소에 걸쳐 동작하고, `phase.ts`는 현재 단계를 기록합니다.
- `signals.ts`는 인터럽트 시 정리합니다.

**트래커와 스펙**

- `tracker.ts`와 `tracker-files.ts`(로컬 `.scratch/` 트래커)는 티켓을 읽고 쓰고, `ticketclose.ts`는 티켓을 닫고, `validate.ts`는 스펙 커버리지를 검사하고, `approve.ts`는 승인을 기록하고, `surfaces.ts`는 편집 범위 겹침을 찾습니다.
- `specmerge.ts`는 스펙 델타를 살아 있는 스펙에 합칩니다. `specbranch.ts`, `speclanding.ts`, `specabandon.ts`는 `spec/<id>` 브랜치를 관리하고, `landing-unit.ts`는 실행이 스펙 단위로 랜딩하는지 웨이브 단위로 랜딩하는지 결정하며, `afterspec.ts`와 `promote.ts`는 스펙 이후 단계를 실행합니다.

**워커 핸드오프**

- `handoff.ts`, `results.ts`, `materializelog.ts`는 워커가 보고하는 내용을 코디네이터에게 전달하고, `mailbox.ts`는 Codex 워커를 위한 CLI 소유 메일박스입니다.

**리뷰와 랜딩**

- `verify.ts`, `reviewpackage.ts`, `review.ts`(지적 원장), `review-run.ts`(Codex 리뷰어), `assess.ts`(위험 분류기), `gate.ts`, `land.ts`, `ci.ts`는 웨이브를 점검하고, 리뷰하고, 랜딩합니다. `deploycheck.ts`는 배포 후 점검을 실행합니다.

**저널, 어텐션, 보고**

- `journal.ts`는 이벤트를 추가하고 `insights.ts`는 그것을 읽으며, `attention.ts`는 세션의 어텐션 상태를 기록하고 `attention-alert.ts`는 알림을 발생시키며, `metrics.ts`와 `usage.ts`는 비용과 결과를 보고합니다.
- `memory.ts`와 `engram-client.ts`는 Engram에서 교훈을 검색하고 저장합니다.

**안전**

- `guard.ts`, `guard-destructive.ts`, `guard-codex.ts`는 가드 훅입니다.

**명령 배선과 공유 헬퍼**

- `commands.ts`는 명령과 그 플래그를, `flags.ts`는 모든 명령이 받는 플래그를, `envelope.ts`는 `--json` 출력을, `errors.ts`는 오류 코드를, `exit-codes.ts`와 `exit-code.ts`는 종료 코드를, `env.ts`는 환경 보기를, `color.ts`와 `banner.ts`는 터미널 출력을, `present.ts`, `narrow.ts`, `optional.ts`는 작은 좁히기 헬퍼를 설명합니다.
- `test-preload.ts`와 `expect-rejection.ts`는 테스트를 지원합니다.

호스트별 값은 `agenthost.ts`의 `AgentHost` 인터페이스 뒤에 있습니다. `agenthost-claude.ts`는 Claude Code 어댑터, `agenthost-codex.ts`는 Codex 어댑터이며 설정의 `agentHost`로 선택됩니다. Codex 쪽에는 `codex-models.ts`(모델 결정), `codex-home.ts`(실행별 `CODEX_HOME` 오버레이), `codex-process.ts`와 `codex-session.ts`(프로세스 실행기와 인계), `codex-usage.ts`(`exec --json`에서 읽는 사용량), `guard-codex.ts`(훅 입력과 승인 게이트), `dispatch.ts`가 추가됩니다. [Codex 가이드](../how-to/use-codex.md)를 참고하세요.

## 프롬프트 배치

`commands/run.md`(약 130줄)가 Claude Code에서 `/emet` 라우터이며, Codex에서는 생성된 `codex/skills/**`와 `codex/hooks.json`이 그 역할을 합니다. `emet/reference/`의 각 파일은 단계 그룹 하나(`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`)이며, 현재 실행의 모드가 필요로 할 때만 불러옵니다. 어느 하나라도 20,000바이트를 넘으면 테스트가 실패하므로, 파일 하나가 컴팩션 이후의 컨텍스트를 차지할 수 없습니다. 각 단계는 수정이나 리뷰 라운드 전에 코디네이터가 관련 섹션을 다시 읽도록 안내합니다. `emet self install`은 설치 매니페스트와 여전히 일치하는 남아 있는 `phases-8-closeout.md`를 삭제하고, 그렇지 않으면 `phases-8-closeout.md.retired`로 옆에 옮겨 둡니다. 이 파일은 `phases-8-review.md`(리뷰와 게이트)와 `phases-8-landing.md`(랜딩과 마무리)로 나뉘었습니다. `phases-8-spec-landing.md`에는 `landing.unit: spec`의 규칙이 담겨 있습니다. 각 웨이브를 `spec/<id>`에 통합하고, 트렁크를 동기화하고, 스펙을 한 번만 랜딩합니다. 또한 `emet self install`은 `PreToolUse` 훅인 `emet guard`를 포함한 emet 훅을 `~/.claude/settings.json`에 병합합니다.

## 배포

`emet self install`은 독립 실행형 바이너리를 배치하고, 다시 쓴 프롬프트를 `~/.claude/` 아래에 기록하며, `--from <checkout>`을 지정하면 `emet/` 소스를 `~/.claude/emet`에 복사합니다. Codex 플러그인은 `.codex-plugin/plugin.json`으로 기술되며, `codex/skills/**`, `codex/hooks.json`과 함께 `bun run build:codex`로 생성됩니다. Claude Code 플러그인 경로는 `tools/build-binaries.ts`가 빌드한 체크섬 검증 독립 실행형 바이너리를 내려받는 심을 제공합니다. [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md)을 참고하세요.

## 함께 보기

- [시작하기](../start/install.md)와 [트래커와 랜딩](../how-to/configure-tracker.md)
- [설정 레퍼런스](../reference/configuration.md), [CLI 레퍼런스](../reference/cli.md), [의존성](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md)와 [emet/AGENTS.md](../../emet/AGENTS.md)
- [문서 색인](../README.md)
