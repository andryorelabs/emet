---
title: 아키텍처
description: emet/src의 코드 맵과 /emet 프롬프트가 이를 어떻게 구동하는지 설명합니다.
seoTitle: emet 아키텍처
sourceHash: 3145bbde94eade03
---

`emet/src`의 코드 맵과 `/emet` 프롬프트가 이를 어떻게 구동하는지 설명합니다. 용어는 [GLOSSARY.md](../GLOSSARY.md)를 따르며, 이 구조의 배경이 된 결정은 [docs/adr](adr/README.md)에 있습니다. 문제가 생기면 [문제 해결](troubleshooting.md)을 참고하세요.

- [구조](#구조)
- [프롬프트가 CLI를 구동하는 방식](#프롬프트가-cli를-구동하는-방식)
- [모듈 맵](#모듈-맵)
- [프롬프트 배치](#프롬프트-배치)
- [배포](#배포)
- [함께 보기](#함께-보기)

## 구조

두 부분으로 이루어져 있습니다. 프롬프트(`commands/run.md`, `agents/*.md`, `emet/reference/*.md`)는 각 단계에서 Claude가 무엇을 해야 하는지 알려 줍니다. `emet` CLI(`emet/bin/emet.ts`와 `emet/src/`)는 결정적이어야 하는 모든 일, 즉 점검, 클레임, 슬롯, 게이트, 트래커 쓰기, 랜딩을 처리합니다. 프롬프트는 CLI가 이미 수행하는 점검을 다시 구현하지 않습니다.

`emet/bin/emet.ts`는 얇은 디스패처입니다. 첫 번째 인자를 읽고 하위 명령 모듈 하나에 넘기며, 그 모듈이 나머지 `process.argv`를 직접 읽습니다. 종료 코드는 모든 하위 명령에서 같은 의미를 가집니다.

## 프롬프트가 CLI를 구동하는 방식

`commands/run.md`는 짧은 라우터입니다. `emet/reference/`의 단계 파일을 한 번에 하나씩 불러오므로, 컴팩션이 일어나도 현재 단계의 규칙이 사라지지 않습니다.

| 단계                         | 프롬프트                                     | CLI 호출                                                                      |
| ---------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 인터뷰, 스펙, 티켓, 승인 | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 디스패치와 워커          | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 리뷰, 게이트, 랜딩, 마무리 | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 핸드오프와 체이닝          | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

코디네이터는 유일하게 트래커에 쓸 수 있는 주체입니다(ADR-0005). 워커는 핸드오프 노트와 `emet results`로 보고하고, 코디네이터가 이를 게시합니다. `emet guard`는 `PreToolUse` 훅으로 실행되어 무인 실행에서 실패를 일으키는 것으로 알려진 동작을 차단합니다.

## 모듈 맵

각 모듈 옆에는 `*.test.ts`가 있습니다.

| 영역          | 모듈                                                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 설정과 감사   | `init.ts`(설정과 문서 골격), `config.ts`(`emet.config.json`, 예전 `forge.config.json`도 여전히 읽음), `doctor.ts`(플릿 스윕), `preflight.ts`(디스패치 위생), `dependencies.ts`, `skills.ts`(mattpocock-skills 계약), `map.ts`(코드베이스 개요) |
| 실행 상태     | `claims.ts`(티켓 예약), `slots.ts`(워커 슬롯 풀), `resources.ts`(호스트 정보), `runs.ts`(생존 여부), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                        |
| 트래커        | `tracker.ts`, `tracker-files.ts`(로컬 `.scratch/` 트래커), `validate.ts`(스펙 커버리지), `specmerge.ts`, `approve.ts`, `surfaces.ts`(편집 범위 겹침)                                                                                           |
| 워커 핸드오프 | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                |
| 리뷰와 랜딩   | `verify.ts`, `reviewpackage.ts`, `review.ts`(지적 원장), `assess.ts`(위험 분류기), `gate.ts`, `land.ts`                                                                                                                                        |
| 보고          | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                       |
| 안전          | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                             |
| 공유 헬퍼     | `narrow.ts`, `optional.ts`, `assets.ts`(컴파일된 바이너리에 내장된 파일)                                                                                                                                                                       |

호스트별 값은 `agenthost.ts`의 `AgentHost` 인터페이스 뒤에 있습니다. `agenthost-claude.ts`는 Claude Code 어댑터, `agenthost-codex.ts`는 Codex 어댑터이며 설정의 `agentHost`로 선택됩니다. Codex 쪽에는 `codex-models.ts`(모델 결정), `codex-home.ts`(실행별 `CODEX_HOME` 오버레이), `codex-process.ts`와 `codex-session.ts`(프로세스 실행기와 인계), `codex-usage.ts`(`exec --json`에서 읽는 사용량), `guard-codex.ts`(훅 입력과 승인 게이트), `dispatch.ts`, `review-run.ts`가 추가됩니다. [Codex 가이드](guide/codex.md)를 참고하세요.

## 프롬프트 배치

`commands/run.md`(약 130줄)가 `/emet` 라우터입니다. `emet/reference/`의 각 파일은 단계 그룹 하나(`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`)이며, 현재 실행의 모드가 필요로 할 때만 불러옵니다. 어느 하나라도 20,000바이트를 넘으면 테스트가 실패하므로, 파일 하나가 컴팩션 이후의 컨텍스트를 차지할 수 없습니다. 각 단계는 수정이나 리뷰 라운드 전에 코디네이터가 관련 섹션을 다시 읽도록 안내합니다. `install.sh`는 예전의 단일 `phases-6-9.md`를, 직접 수정했거나 설치 매니페스트보다 오래된 경우에는 `phases-6-9.md.retired`로 옆에 옮겨 두고, 그렇지 않으면 삭제합니다. 또한 `install.sh`는 `emet guard`를 `PreToolUse` 훅으로 `~/.claude/settings.json`에 연결합니다.

## 배포

`install.sh`는 `emet/`를 `~/.claude/emet`에 복사하고 프롬프트를 다시 씁니다. 플러그인 경로는 `tools/build-binaries.ts`가 빌드한 체크섬 검증 독립 실행형 바이너리를 내려받는 심을 제공합니다. [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md)을 참고하세요.

## 함께 보기

- [시작하기](guide/getting-started.md)와 [트래커와 랜딩](guide/trackers-and-landing.md)
- [설정 레퍼런스](reference/configuration.md), [CLI 레퍼런스](reference/cli.md), [의존성](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md)와 [emet/AGENTS.md](../emet/AGENTS.md)
- [문서 색인](README.md)
