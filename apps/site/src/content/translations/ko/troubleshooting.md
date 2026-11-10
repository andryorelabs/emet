---
title: 문제 해결
description: emet doctor와 emet preflight의 실패를 눈에 보이는 증상별로 묶어, 각각의 원인과 해결 방법을 설명합니다.
seoTitle: emet doctor와 preflight 문제 해결
sourceHash: c1ebb76c9250d743
---

`emet doctor`와 `emet preflight`의 실패를 눈에 보이는 증상별로 묶어, 각각의 원인과 해결 방법을 정리했습니다. 용어는 [GLOSSARY.md](../GLOSSARY.md)를 따릅니다. 점검들이 어떻게 맞물리는지는 [아키텍처](architecture.md)를 참고하세요.

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

`forge.config.json`, `.forge/`, `FORGE_*` 변수만 있는 리포지토리도 계속 동작합니다. `emet`은 예전 이름을 읽고, 각 예전 파일을 밝히는 stderr 줄을 한 줄 출력하며, `emet migrate`가 이를 이름 변경해 줍니다.

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [의존성 점검이 실패합니다](#의존성-점검이-실패합니다)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [설치된 파일이 없거나 설치 후 수정되었습니다](#설치된-파일이-없거나-설치-후-수정되었습니다)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [사용 가능한 워커 슬롯이 없습니다](#사용-가능한-워커-슬롯이-없습니다)
- [잠긴 워크트리가 예상보다 적습니다](#잠긴-워크트리가-예상보다-적습니다)
- [티켓이 여러 워크트리 또는 브랜치에서 클레임되어 있습니다](#티켓이-여러-워크트리-또는-브랜치에서-클레임되어-있습니다)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [함께 보기](#함께-보기)

## no emet.config.json

**증상:** `emet doctor`가 `no emet.config.json — run "emet init" here`를 출력합니다.

**원인:** 리포지토리에 아직 `/emet` 설정이 없습니다.

**해결:** 리포지토리 루트에서 `emet init`을 실행한 다음, 생성된 설정을 검토하고 `docs/agents/` 파일을 채우세요.

## emet.config.json is malformed

**증상:** `emet.config.json is malformed: <reason>`. `emet preflight`가 종료 코드 2로 끝납니다.

**원인:** 설정은 엄격한 JSON이며 `emet/schema/emet.config.schema.json`에 대해 검증됩니다. 주석과 후행 쉼표는 거부됩니다.

**해결:** 사유에 나온 필드를 고치거나 `emet init --force`로 다시 생성하세요.

## docs/agents still has TODO(emet) markers

**증상:** `docs/agents/ still has N TODO(emet): marker(s)`. `emet doctor`는 `docs/agents/<file>`이 없다는 것도 보고합니다.

**원인:** `emet init`은 값을 감지하지 못한 곳마다 마커를 남깁니다.

**해결:** 표시된 각 줄을 채우거나, 해결한 뒤 `emet init --force`를 실행하세요. 마커가 남아 있는 동안 preflight는 디스패치를 거부합니다.

## 의존성 점검이 실패합니다

**증상:** `emet doctor`에 `dependency: ...` 줄이 나타나거나, `emet preflight`에서 의존성 실패로 차단됩니다(예: `gh`가 없거나 인증되지 않음, 또는 mattpocock-skills 플러그인이 없거나 검증되지 않은 버전임).

**원인:** `/emet`에는 `git`, `gh`, mattpocock-skills 플러그인이 필요합니다. `emet/src/dependencies.ts`와 `emet/src/skills.ts`를 참고하세요.

**해결:** 도구를 설치하거나 인증하거나 `setup-matt-pocock-skills` 스킬을 실행하세요(Claude Code에서는 `/setup-matt-pocock-skills`, Codex에서는 Codex의 `$` 구문으로 같은 스킬을 호출합니다). 사용 환경에서 점검이 잘못된 경우 `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight`로 경고로 낮출 수 있습니다.

## no longer documents a flag in --help

**증상:** `<tool> no longer documents <flags> in --help — emet relies on it`, 또는 `could not be run — cannot verify <flags>`.

**원인:** `emet doctor`는 바이너리가 있는지만이 아니라 `emet`이 의존하는 플래그를 확인합니다. 설치된 버전에서 해당 플래그가 제거되었거나 이름이 바뀌었습니다.

**해결:** 해당 플래그를 여전히 문서화하는 버전의 도구를 설치하세요.

## 설치된 파일이 없거나 설치 후 수정되었습니다

**증상:** `~/<path> is missing — re-run install.sh` 또는 `~/<path> was edited since install`.

**원인:** 설치된 사본이 설치 매니페스트와 더 이상 일치하지 않습니다.

**해결:** `install.sh`를 다시 실행하세요. 수정된 파일 옆에 보류 중인 `.new` 파일이 있으면 병합하거나 삭제하세요.

## Stop hook error: forge: No such file or directory

**증상:** Claude Code가 매 턴이 끝날 때마다 `Stop hook error: … forge: No such file or directory`(또는 `emet`에 대해 같은 메시지)를 출력합니다.

**원인:** `~/.claude/settings.json`에 바이너리가 옮겨졌거나 제거된 `forge guard` 또는 `emet guard` 훅이 아직 남아 있습니다.

**해결:** `emet doctor .`를 실행하세요. 죽은 가드 훅을 이벤트와 함께 각각 나열하고, `settings.json`을 백업한 뒤 해당 훅만 제거하는 `cp … && jq …` 명령 하나를 출력합니다. doctor가 파일을 직접 수정하지는 않습니다.

## 사용 가능한 워커 슬롯이 없습니다

**증상:** `No free worker slots at all: 0 free out of N` 또는 `only K/N worker slot(s) free`.

**원인:** `~/.local/state/emet/slots`의 모든 슬롯을 실행 중이거나 유휴 상태인 실행이 점유하고 있어, 웨이브를 완전히 디스패치할 수 없습니다.

**해결:** 실행이 슬롯을 해제할 때까지 기다리거나, 끝났다고 알고 있는 실행에 대해 `emet cleanup --run <runId>`를 실행하세요. `emet status`로 누가 무엇을 점유하고 있는지 볼 수 있습니다.

## 잠긴 워크트리가 예상보다 적습니다

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**증상:** `Expected N locked worktree(s) for run <id>, found M`.

**원인:** 워커가 잠금 사유와 함께 자신의 워크트리를 클레임하지 않았거나, `isolation: "worktree"`가 워커를 다른 곳에 배치했습니다. [`incidents.md`](../emet/reference/incidents.md)를 참고하세요.

**해결:** `git worktree list --porcelain`으로 잠긴 항목을 확인하고, 기대하는 사유 형식은 `emet lock-reason`으로 확인하세요.

## 티켓이 여러 워크트리 또는 브랜치에서 클레임되어 있습니다

**증상:** `<ticket> is claimed by N worktrees`, `has N branches`, 또는 `is checked out on branch ..., but its own lock names ticket ...`.

**원인:** 재시도나 잘못 라우팅된 셸 때문에 중복이 남았습니다.

**해결:** 정식 워크트리나 브랜치를 남기고 나머지는 삭제하거나 다시 잠근 뒤, `emet preflight`를 다시 실행하세요.

## requiredCommands not on PATH

**증상:** `preflight.requiredCommands not on PATH: <names>`.

**원인:** `emet.config.json`의 `preflight.requiredCommands`에 리포지토리가 필요로 하는 바이너리가 나열되어 있습니다.

**해결:** 지정된 바이너리를 설치하거나, 더 이상 필요하지 않다면 설정에서 제거하세요.

## Codex 호스트

`agentHost`가 `"codex"`일 때 해당합니다. [Codex에서 emet 실행하기](guide/codex.md)를 참고하세요.

**`codex.minVersion`보다 오래된 `codex`.** `emet doctor .`가 보고합니다. `codex.minVersion`(기본값 `0.167.0`) 이상 버전의 `codex` CLI를 설치한 뒤 `emet doctor .`를 다시 실행하세요.

**`--json` 또는 `--output-schema` 플래그 없음.** `emet doctor .`는 두 플래그 중 하나라도 문서화하지 않는 `codex exec`를 보고하며, emet은 워커와 리뷰어를 시작하는 데 둘 다 사용합니다. 두 플래그를 여전히 문서화하는 `codex` 버전을 설치하세요.

**설정한 모델이 목록에 없음.** emet은 모델을 실행 홈의 `models_cache.json`, 없으면 실제 Codex 홈의 `models_cache.json`(읽기 전용)에서 확정합니다. 목록에 없는 슬러그는 대체되며 그 대체는 기록됩니다. 아무것도 확정되지 않으면 `emet review-run`은 모델 호출 전에 역할과 목록에 있는 슬러그를 밝히며 실패합니다. `codex.models`에는 목록에 있는 슬러그를 설정하세요. [설정 레퍼런스](reference/configuration.md#codex)를 참고하세요.

## 함께 보기

- [문서 색인](README.md)
- [README](../README.md)
- [시작하기](guide/getting-started.md)
- [설정 레퍼런스](reference/configuration.md)
- [의존성 레퍼런스](reference/dependencies.md)
