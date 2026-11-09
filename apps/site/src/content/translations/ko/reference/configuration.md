---
title: 설정 레퍼런스
description: emet.config.json의 모든 키를 기본값과 의미와 함께 설명합니다.
seoTitle: emet 설정 레퍼런스
sourceHash: f93a93f72cc341b1
---

`emet.config.json`의 모든 키를 기본값과 의미와 함께 정리했습니다. 기준이 되는 원본은 [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json)입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다. [README](../../README.md)로 돌아가기.

`emet init`이 이 파일을 작성하고, `emet preflight`와 `emet doctor`가 검증합니다. prose-only로 표시된 키는 CLI가 아니라 `/emet` 프롬프트가 읽습니다. deprecated로 표시된 키도 계속 허용됩니다. 스키마는 메모용 자유 형식 `"//"` 키(어떤 도구도 읽지 않음)와 항상 `1`인 `"version"`도 허용합니다.

## pr

웨이브의 PR을 어떻게 병합할지 정합니다.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge`(기본값 `true`): PR의 체크를 기다렸다가 병합합니다. 체크가 없으면 즉시 병합합니다. 실패한 체크는 수정해 푸시하며 최대 `maxCiFixAttempts`번 반복하고, 그래도 안 되면 사람이 처리하도록 PR을 열어 둡니다. 플래그가 지정된 항목이 있는 웨이브는 자동 병합되지 않습니다.
- `mergeMethod`(기본값 `squash`): `squash`, `merge`, `rebase` 중 하나이며 `gh pr merge`에 전달됩니다.
- `maxCiFixAttempts`(기본값 `2`, 최솟값 `0`): PR을 사람이 처리하도록 열어 두기 전에 코디네이터가 실패한 체크를 고치려고 시도할 수 있는 횟수입니다.

## handoff

웨이브가 끝난 뒤에 일어나는 일과 워커의 핸드오프 노트 크기 제한을 정합니다. `emet preflight`가 검증합니다.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines`(기본값 `60`): `.emet/handoff-<ticket>.md` 노트가 `emet handoff --check`에서 실패하기 전까지 가질 수 있는 최대 줄 수입니다.
- `maxChars`(기본값 `8000`, 약 2k 토큰): 핸드오프 노트가 가질 수 있는 최대 문자 수입니다.
- `autoChain`(기본값 `false`): 깔끔하게 병합된 웨이브 뒤에 남은 웨이브가 있으면 `/emet:run --dispatch <spec-id>`를 출력하는 대신 `claude --bg`로 다음 웨이브를 시작합니다. `claude agents` 또는 `claude attach emet-<spec-id>-w<n>`으로 확인할 수 있습니다. 요구 사항:
  1. `claude`가 PATH에 있고 `--bg`를 지원할 것.
  2. 신뢰할 수 있는 작업 공간일 것. `--bg`는 비대화형으로 실행되므로 신뢰 대화상자가 나타나지 않습니다. 리포지토리에서 `claude`를 대화형으로 한 번 열어 수락하세요.
  3. 대화형 세션에서 우회 경고를 한 번 수락했을 것(`skipDangerousModePermissionPrompt`). 다음 웨이브는 시작한 세션의 모드가 아니라 `handoff.permissionMode`로 실행되기 때문입니다.

  PR이 병합되었고 플래그가 지정된 항목이 없을 때만 시작하며, `emet-<spec-id>-*` 세션이 이미 실행 중이면(`claude agents --json`) 건너뜁니다. 시작에 실패하면 `/emet:run --dispatch <spec-id>`를 출력하는 방식으로 되돌아갑니다.

- `launcher`(기본값 `auto`, `auto`, `orca`, `bg` 중 하나): `claude attach`를 실행하는 Orca 탭에서도 웨이브를 엽니다. `auto`는 Orca 런타임(`orca status`)에 물어보므로 `TERM_PROGRAM`이 없는 `claude --bg` 세션에서도 동작합니다. `orca`는 항상 시도하고 `bg`는 시도하지 않습니다. 어느 쪽이든 웨이브는 백그라운드에서 실행되며, 탭을 열지 못해도 체인이 멈추지 않습니다. `emet launch <spec-id> --wave <n>`이 시작 전체를 수행합니다. [`emet launch`](cli.md#실행-워커-슬롯)를 참고하세요.
- `permissionMode`(기본값 `bypassPermissions`, `bypassPermissions`, `auto`, `acceptEdits` 중 하나): 이어 붙인 세션의 권한 모드입니다. 시작한 세션에서 상속되지 않습니다. `auto` 모드의 분류기가 `gh pr merge` 같은 단계를 거부해 웨이브가 반쯤 끝난 상태로 남을 수 있기 때문입니다. `permissions.deny` 규칙은 계속 적용되지만, 우회 경고를 대화형으로 한 번 수락해 두어야 합니다(`skipDangerousModePermissionPrompt`).

## budgets

모두 선택 사항입니다.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`(기본값 `2`, 최솟값 `1`): 티켓이 `verify`에 실패할 수 있는 횟수이며, 이를 넘으면 게이트가 `defer`로 답합니다. 티켓에는 보류 라벨이 붙고 웨이브의 나머지는 계속됩니다. 테스트 명령이 126/127로 종료되거나 제공자 장애가 발생하는 등의 환경 문제는 시도 횟수를 소모하지 않고 실행을 일시 중지합니다.
- `reviewRounds`(기본값 `2`, 최솟값 `1`): 티켓이 다음 모델 티어로 한 번 에스컬레이션되기 전에 받을 수 있는 리뷰/수정 라운드 수입니다. 그 뒤에도 남아 있는 항목에는 판정이 내려집니다.
- `stallNudgeCap`(기본값 `6`, 최솟값 `1`): 멈춘 워커를 재촉하는 횟수입니다. 이 횟수는 초기화되지 않습니다.

## models

역할별 모델과 추론 강도입니다. 모든 키는 선택 사항이며, 이 섹션을 생략하면 워커는 `sonnet`/`medium`, 리뷰어는 `opus`/`medium`이 유지됩니다. 추론 강도(effort)는 `low`, `medium`, `high`, `xhigh`, `max` 중 하나입니다.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model`(기본값 `sonnet`), `worker.effort`(기본값 `medium`): 워커입니다. 티켓의 `Model:` 줄은 해당 워커에 한해 `worker`를 덮어씁니다.
- `reviewer.medium`과 `reviewer.high`(기본값은 각각 `opus`, `medium`): `emet assess`가 반환하는 위험 티어별 리뷰어입니다. 위험한 웨이브를 더 엄격하게 검토하려면 `reviewer.high.effort`를 (예를 들어 `high`로) 높이세요.
- `triage`(기본값 `haiku`): CI 로그 분류와 passive 티어 리뷰에 쓰는 저렴한 모델입니다. 실패한 체크는 이 모델의 에이전트에 넘겨지며, 이 에이전트는 `file:line` 포인터와 함께 최대 약 2k 토큰을 반환합니다.
- `escalation`(기본값 `{ "sonnet": "opus" }`): 티켓이 수정 횟수 상한에 도달했을 때 쓰는, 모델 이름별 다음 모델 티어입니다.

## agentHost

`agentHost` (기본값 `"claude"`): 실행이 동작하는 에이전트 호스트입니다. `"claude"` 또는 `"codex"`. [Codex 가이드](../guide/codex.md)를 참고하세요.

## codex

`agentHost`가 `"codex"`일 때만 읽습니다. 모든 키는 선택 사항입니다. 노력 수준은 `low`, `medium`, `high`, `xhigh`, `max` 중 하나이며 `ultra`는 허용되지 않습니다.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: 각각 `{ "model", "effort", "fallback" }` 형태입니다. `fallback`은 `model`이 Codex 모델 캐시에 없을 때 순서대로 시도할 슬러그 목록입니다. 기본값은 [모델과 노력 수준](../guide/models-and-effort.md)에 있습니다.
- `models.session`: `$emet:run`을 실행하는 세션용 `{ "model", "effort", "planEffort", "fallback" }`. `planEffort`는 첫 승인 전까지 적용됩니다.
- `effort`: 설정하면 모든 역할의 노력 수준을 대체합니다.
- `minVersion` (기본값 `0.167.0`): `emet doctor`가 허용하는 가장 오래된 `codex` CLI 버전입니다.
- `sandbox` (기본값 `workspace-write`): Codex 워커의 샌드박스 모드입니다. `danger-full-access`는 명시적으로 선택해야 합니다.

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths`(기본값 `[]`): 내장된 집합(인증, 보안, 결제, 웹훅, CI, 설치 프로그램, 락파일, 마이그레이션, 원시 SQL이나 파이프로 셸에 전달하는 코드 같은 위험한 싱크)에 더해, `emet assess`에서 `high` 리뷰 티어를 강제하는 대소문자 구분 없는 추가 경로 부분 문자열입니다.

## landing

- `mode`(기본값 `pr`): `pr`은 풀 리퀘스트를 엽니다(`gh` 필요). `merge`는 `emet land`로 통합 브랜치를 로컬 트렁크에 병합하며 푸시하지 않고, CI 대신 `commands.selfCheck`를 사용합니다. 트래커와는 독립적입니다. [ADR-0010](../adr/0010-local-merge-landing.md)을 참고하세요.

## tracker

`/emet`이 어떤 이슈 트래커와 연동할지 정합니다. CLI는 `kind`를 읽어 어떤 의존성 점검을 적용할지 결정하며, 나머지는 `/emet` 명령이 따르는 어댑터를 설명합니다([`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) 참고).

- `kind`(필수): `linear`, `github`, `local` 중 하나입니다. `local`은 [로컬 트래커](cli.md#로컬-트래커)와 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: 각 티켓 상태 전환을 누가 기록하는지를 `worker`, `coordinator`, `automatic` 중 하나로 지정합니다. `automatic`은 트래커 연동이 처리한다는 뜻입니다(예: PR을 열거나 병합할 때의 Linear GitHub 연동). 코디네이터는 `automatic`으로 지정된 전환을 기록하지 않습니다.
- `github.priorityLabels`: 우선순위 수준(`"1"` = P0 최고에서 `"4"` = P3까지)을 GitHub 라벨 이름에 대응시킵니다. 예: `{"1":"P0","2":"P1"}`. 선언하지 않으면 티켓은 `createdAt` 오름차순으로 정렬되며 `emet doctor`가 이를 알려 줍니다.
- `github.stateLabels`: 워크플로 상태(`todo`, `in-progress`, `in-review`)를 GitHub 라벨 이름에 대응시킵니다. 예: `{"todo":"status:todo"}`. `done`과 `canceled`는 이슈의 닫힘 상태와 `state_reason`에서 추론합니다.
- `linear`: Linear 전용 설정(팀 키, 워크플로 상태 이름)입니다. `docs/agents/issue-tracker.md`를 따르는 모델만 읽으며 CLI는 읽지 않습니다.
- `local.idPrefix`(deprecated): 로컬 티켓 ID는 이제 `<feature-slug>-<NN>` 형식입니다.
- `readyLabel`, `triageLabels`, `prReference`(deprecated): 라벨과 PR 참조 템플릿입니다. 예: `Closes #{number}`(github) 또는 `Refs: {id}`(linear).

## preflight

- `requiredFiles`(기본값 없음): 웨이브를 디스패치하기 전에 `emet preflight`가 리포지토리 루트에 있어야 한다고 요구하는 파일이며, 각각 `{ "path", "why" }` 형식입니다. `why`는 실패 메시지에 표시됩니다. 비어 있으면 이 점검은 실행되지 않습니다.
- `requiredCommands`(기본값 없음): 디스패치 전에 PATH에서 해석되어야 하는 바이너리입니다. 그렇지 않은 것이 있으면 `emet preflight`는 그 이름을 밝히며 종료 코드 1로 실패하고, `emet doctor`도 이를 보고합니다. 이것은 리포지토리 자체의 목록이며 트래커에 따른 [의존성 점검](dependencies.md#무엇이-무엇을-확인하는가)과는 별개입니다. `gh`에는 이미 전용 점검이 있으므로 나열은 선택 사항입니다. 흔히 추가하는 것은 `rg`와 `sg`입니다.

## specs

- `dir`(기본값 `docs/specs`): `emet spec-merge`가 작성하는 살아 있는 스펙의, 리포지토리 기준 상대 디렉터리입니다.

## map

- `path`(기본값 `docs/agents/codebase.md`): `emet map`이 생성하는 맵의 리포지토리 기준 상대 경로입니다.

## concurrency

- `waveSize`(기본값 `4`, 최솟값 `1`): 한 웨이브에서 함께 디스패치하는 Agent 호출의 최대 수입니다.
- `maxLiveWorkers`(기본값 `auto`): 이 호스트에서 실행 중인 모든 `/emet` 코디네이터가 모든 리포지토리에 걸쳐 공유하는 전역 상한입니다. 슬롯 풀은 `~/.local/state/emet/slots` 아래에 있으며 특정 리포지토리 안에 있지 않습니다. `auto`는 호스트의 CPU 수와 RAM으로 상한을 계산하고, 양의 정수는 값을 고정합니다. 이와 별개로 메모리 여유 점검(`EMET_MEM_RESERVE_GIB`, 기본값 8 GiB)이 있어, 이 상한과 관계없이 사용 가능한 메모리가 너무 적으면 슬롯 획득을 거부합니다. 환경 변수 `EMET_MAX_LIVE_WORKERS`는 이 필드를 덮어쓰며 `auto`도 받습니다.
- `runIdleThresholdMs`(기본값 `5400000`, 90분): 살아 있는 앵커가 없는 실행을 종료가 아니라 유휴로 분류하는 기간이며, 트랜스크립트의 최신성만을 기준으로 합니다. 환경 변수 `EMET_RUN_IDLE_THRESHOLD_MS`가 이를 덮어씁니다.

[환경 변수](cli.md#환경-변수)를 참고하세요.

## ticket

- `idPattern`: 티켓 ID가 일치해야 하는 앵커 정규식 소스입니다. 예: `^PROJ-\d+$`. 잘못된 패턴은 치명적인 설정 오류입니다.
- `branchPrefix`: 워커의 로컬 브랜치에 붙는 소문자 접두사(`^[a-z0-9-]+$`)입니다. 브랜치는 `<branchPrefix>-<number>-<slug>` 형식이며 `cleanup`은 글롭 `<branchPrefix>-*`를 정리합니다.
- `idExample`(deprecated, prose-only): `idPattern`에 맞는 예시 ID 하나입니다.
- `branchPattern`(deprecated, prose-only): 전체 브랜치 이름 템플릿입니다.

## commands

모두 prose-only입니다.

- `selfCheck`: 워커가 변경을 끝났다고 판단하기 전에 실행하는 명령입니다. 예: `["npm run check"]`. `landing.mode`가 `merge`이면 CI를 대신합니다.
- `workerScopedSuite`: 워커가 자신이 건드린 영역만 테스트하려고 실행하는 명령입니다. `emet verify`는 이것이 통과하기를 요구합니다.
- `fullSuite.run`: 리포지토리 전체 스위트를 실행하는 명령으로, 웨이브의 브랜치가 병합된 뒤 통합 브랜치에서 한 번 실행됩니다. 실패하면 PR과 `autoChain`이 차단됩니다.
- `fullSuite.singleton`: 한 번에 하나의 워크트리만 스위트를 실행할 수 있으면 `true`입니다.
- `fullSuite.runInBackground`, `fullSuite.reset`(deprecated): 백그라운드 실행 플래그와 상태 초기화 명령입니다.

## worktree

- `lockReason`: 워커가 부트스트랩 때 기록하는 `git worktree lock` 사유의 템플릿으로, `emet lock-reason`이 채웁니다. 기본값은 `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`입니다. 필드를 추가할 때만 덮어쓰세요. `emet lock-reason`은 리터럴 `emet` 토큰이나 `run=`, `ticket=`, `anchor=`, `at=`, `slug=` 중 하나라도 빠진 템플릿을 거부합니다.
- `copyFromMain`(prose-only): 부트스트랩 전에 트렁크 체크아웃에서 새 워크트리로 복사하는 경로입니다. 예: 추적되지 않는 env 파일.
- `bootstrap`(prose-only): 워커가 시작하기 전에 새 워크트리에서 한 번 실행하는 셸 명령입니다. 예: `["npm ci"]`. `/emet` 6단계가 실행하며 CLI는 실행하지 않습니다.
- `stateDir`(deprecated, prose-only): 실행 로컬 로그용 디렉터리입니다. 예: `.emet`.

## usage

- `oversizedReadLines`(기본값 `400`, 최솟값 `1`): 오프셋이나 제한 없이 이 줄 수를 넘는 파일을 대상으로 한 Read는 `emet usage`에서 과대로 집계됩니다.
- `stalledMinutes`(기본값 `10`, 최솟값 `1`): `emet usage --stalled`의 기본 `--minutes` 임계값입니다.

## sizing

- `inlineMaxLines`(기본값 `100`, 최솟값 `1`): 워커 프롬프트에 인라인으로 포함하는 티켓 본문의 최대 줄 수입니다.

## schema

prose-only입니다. 이 리포지토리의 데이터 스키마 소유권을 나타내며, 3단계에서 티켓을 나눌 때 충돌 회피 규칙에 사용됩니다. 비어 있거나 생략하면 이 규칙을 건너뜁니다.

- `ownedPaths`: 공유 스키마를 정의하는 경로입니다. 예: `["prisma/schema.prisma"]`. 한 웨이브에서 이를 건드릴 수 있는 워커는 최대 하나입니다.
- `sharedDatabase`(deprecated): 워커들이 하나의 물리 데이터베이스를 공유하면 `true`입니다.

## commit

prose-only입니다.

- `trailer`: 티켓을 참조하는 커밋에 워커가 덧붙이는 git 트레일러 키입니다. 예: `Refs`.
- `trailerPosition`: `body` 또는 `footer`입니다.

## repo

- `trunk`: 모든 워커의 변경이 병합되는 대상 브랜치이며, 모든 정리와 preflight의 git 비교 기준이기도 합니다. 예: `main`.
- `remote`(기본값 `origin`): `trunk`가 있는 git 원격입니다.
- `integrationBranch`(deprecated, prose-only): 웨이브가 트렁크에 앞서 통합하는, 오래 유지되는 선택적 브랜치입니다.
- `commitTypes`(deprecated, prose-only): 워커 커밋에 허용되는 Conventional Commit 타입입니다.

## design

선택 사항이며 prose-only입니다. `null`이거나 생략하면 디자인/UI 리뷰 단계를 건너뜁니다.

- `canvasIndex`(deprecated): 워커가 UI 변경 전에 확인하는 디자인 캔버스 파일의 경로입니다.
