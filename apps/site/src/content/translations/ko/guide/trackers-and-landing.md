---
title: 트래커와 랜딩
description: 티켓이 있는 곳, 웨이브가 풀 리퀘스트나 로컬 병합으로 랜딩하는 방식, 웨이브를 이어 붙이는 방법을 설명합니다.
seoTitle: emet의 트래커와 랜딩
sourceHash: a8b11b49ae9e48ab
---

티켓이 있는 곳, 웨이브가 랜딩하는 방식, 웨이브를 이어 붙이는 방법을 설명합니다. 여기서 언급하는 모든 키는 [설정 레퍼런스](../reference/configuration.md)에, 모든 하위 명령은 [CLI 레퍼런스](../reference/cli.md)에 있습니다.

<img src="../brand/mascot/mascot-work.svg" alt="emet 마스코트, 작업 중" width="96" align="right">

## 트래커

emet은 Linear, GitHub Issues 또는 로컬 파일과 함께 동작하며 `tracker.kind`로 설정합니다. `github` 트래커에는 `gh`가 필요합니다. `linear` 트래커에는 Linear MCP 서버가 `.mcp.json`(또는 사용자 범위)에 선언되어 있어야 합니다. [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.

### 로컬 트래커

`tracker.kind: "local"`일 때 스펙과 티켓은 메인 워크트리의 `.scratch/` 아래(버전 관리되지 않음)에 있는 마크다운 파일입니다. `.scratch/<slug>/spec.md`와 `.scratch/<slug>/issues/<NN>-<slug>.md`이며, 각각 `Status:` 줄과 `Blocked by:` 줄을 갖고 코멘트는 `## Comments` 아래에 둡니다. 코디네이터는 `emet tracker`(`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`)를 통해 이 파일들을 읽고 씁니다. `emet init --tracker local`로 이 구성을 설정합니다. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.

## 랜딩

`landing.mode`는 `"pr"`(기본값) 또는 `"merge"`이며 트래커와는 독립적입니다. `merge` 모드에서는 웨이브가 `emet land`를 통해 트렁크로의 로컬 병합 한 번으로 랜딩하고, CI 대신 `commands.selfCheck`를 사용하며 푸시는 하지 않습니다. `gh`는 트래커가 `github`이거나 랜딩이 `pr`일 때만 필요합니다. [ADR-0010](../adr/0010-local-merge-landing.md)을 참고하세요.

### PR 랜딩

웨이브 하나는 PR 하나입니다. 본문에는 각 티켓에 대한 `Closes #N`(트래커의 닫기 키워드)이 들어가며, 코디네이터는 PR을 열 때 티켓을 리뷰 중 상태로 옮깁니다. 이후 PR은 `pr.autoMerge`에 따라 병합되며, 웨이브에 플래그가 지정되었거나 `autoMerge`가 `false`이거나 CI 수정 횟수를 모두 소진한 경우에는 열린 채로 남습니다(이 경우 PR에는 사람의 판단이 필요하다는 라벨이 붙습니다). 병합 후에는 `emet cleanup --run <runId>`가 웨이브의 브랜치, 티켓 클레임, 워커 슬롯을 해제합니다. 또한 PR이 브랜치의 최신 커밋에서 병합된 로컬 브랜치를 통합 브랜치까지 포함해 삭제합니다.

웨이브의 브랜치들이 함께 병합된 뒤에는 통합 브랜치에서 `commands.fullSuite`가 한 번 실행됩니다. 실패하면 PR과 `autoChain`이 차단됩니다. 게이트는 그 결과를 `--integration`으로 받습니다.

### 웨이브 이어 붙이기

이후 웨이브는 웨이브 1을 실행한 세션이 아니라 각자의 세션에서 실행됩니다. 다음에 일어나는 일은 `emet.config.json`의 선택 섹션 두 개로 제어합니다(둘 다 `emet preflight`가 검증합니다).

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge`(기본값 `true`): PR의 체크를 기다렸다가 병합합니다. 체크가 없으면 즉시 병합합니다. 실패한 체크는 수정해 푸시하며 최대 `maxCiFixAttempts`번 반복하고, 그래도 안 되면 사람이 처리하도록 PR을 열어 둡니다. 플래그가 지정된 항목이 있는 웨이브는 자동 병합되지 않습니다.
- `handoff.autoChain`(기본값 `false`): 깔끔하게 병합된 웨이브 뒤에 남은 웨이브가 있으면 `/emet:run --dispatch <spec-id>`를 출력하는 대신 `claude --bg`로 다음 웨이브를 시작합니다. `claude agents` / `claude attach emet-<spec-id>-w<n>`으로 확인할 수 있습니다. Claude Code에서의 요구 사항:
  1. `claude`가 PATH에 있고 `--bg`를 지원할 것.
  2. 신뢰할 수 있는 작업 공간일 것. `--bg`는 비대화형으로 실행되므로 신뢰 대화상자가 나타나지 않습니다. 리포지토리에서 `claude`를 대화형으로 한 번 열어 수락하세요.
  3. 대화형 세션에서 우회 경고를 한 번 수락했을 것(`skipDangerousModePermissionPrompt`). 다음 웨이브는 시작한 세션의 모드가 아니라 `handoff.permissionMode`(아래 참고)로 실행되기 때문입니다.

  Codex 호스트에서는 다음 웨이브가 대신 분리된 `codex exec`로 시작되므로(아래 `handoff.launcher` 참고), 요구 사항은 PATH에 `codex`가 있고 `codex.minVersion` 이상이며 `codex exec`에 `--json`과 `--output-schema`가 있는 것입니다. `emet doctor`는 버전 번호가 아니라 플래그를 확인합니다. Claude의 신뢰 대화상자와 우회 경고는 적용되지 않습니다. 분리된 실행에 Codex가 신뢰할 수 있는 작업 공간을 요구하는지는 이 리포지토리의 문서에서 확인되지 않았습니다.

  PR이 병합되었고 플래그가 지정된 항목이 없을 때만 시작하며, `emet-<spec-id>-*` 세션이 이미 실행 중이면(`claude agents --json`) 건너뜁니다. 시작에 실패하면 `/emet:run --dispatch <spec-id>`를 출력하는 방식으로 되돌아갑니다.

- `handoff.launcher`(기본값 `auto`): `claude attach`를 실행하는 Orca 탭에서도 웨이브를 엽니다. `auto`는 Orca 런타임(`orca status`)에 물어보므로 `TERM_PROGRAM`이 없는 `claude --bg` 세션에서도 동작합니다. `orca`는 항상 시도하고 `bg`는 시도하지 않습니다. `launcher`는 Claude Code 호스트에만 적용되며, Codex에서 `emet launch`는 항상 `bg`처럼 동작합니다. 어느 쪽이든 웨이브는 백그라운드에서 실행되며, 탭을 열지 못해도 체인이 멈추지 않습니다.

  `emet launch <spec-id> --wave <n>`은 시작 전체(중복 세션 확인, `claude --bg`, 탭)를 수행하고 `{ name, id, attach, orcaTab: { opened, reason } }`를 출력합니다. 다른 세션에서 웨이브를 직접 실행하고 싶을 때는 단순한 `claude --bg` 대신 이것을 사용하세요.

  Codex 에이전트 호스트에서 `emet launch`는 `$emet:run --dispatch <spec-id>`를 실행하는 분리된 `codex exec`를 시작하고 그 스레드 ID를 기록합니다. Orca 탭은 열지 않으며, `codex exec resume <id>`로 세션을 이어 갈 수 있습니다. [CLI 레퍼런스](../reference/cli.md#codex-호스트)와 [Codex에서 emet 실행하기](codex.md)를 참고하세요.

- `handoff.permissionMode`(기본값 `bypassPermissions`): Claude Code 전용이며, 이어 붙인 세션의 권한 모드입니다. Codex 호스트에서는 무시되며 이어 붙인 세션은 `codex.sandbox`(기본값 `danger-full-access`. [Codex에서 emet 실행하기](codex.md) 참고)를 사용합니다. 시작한 세션에서 상속되지 않습니다. `auto` 모드의 분류기가 `gh pr merge` 같은 단계를 거부해 웨이브가 반쯤 끝난 상태로 남을 수 있기 때문입니다. `permissions.deny` 규칙은 계속 적용되지만, 우회 경고를 대화형으로 한 번 수락해 두어야 합니다(`skipDangerousModePermissionPrompt`).

## 게이트, 예산, 기록

각 단계는 티켓이 끝났는지, 병합할 수 있는지, 재시도할 가치가 있는지를 스스로 판단하지 않습니다. 디스크의 기록을 읽고 판단을 출력하는 CLI 명령을 호출합니다. 실행 기록은 `.emet/runs/<run-id>/`에, 리뷰 원장은 `.emet/review/`에 있으며, 둘 다 워커의 워크트리가 아니라 메인 체크아웃에 있습니다. 모든 명령은 `--help`로 사용법을 출력합니다. 명령 표와 각 명령이 강제하는 내용은 [게이트와 기록](../reference/cli.md#게이트와-기록)에 있습니다.

**예산**(`emet.config.json`, 모두 선택 사항):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: 티켓이 `verify`에 실패할 수 있는 횟수이며, 이를 넘으면 게이트가 `defer`로 답합니다. 티켓에는 보류 라벨이 붙고 웨이브의 나머지는 계속됩니다. 테스트 명령이 126/127로 종료되거나 제공자 장애가 발생하는 등의 환경 문제는 시도 횟수를 소모하지 않고 실행을 일시 중지합니다.
- `reviewRounds`: 티켓이 다음 모델 티어로 한 번 에스컬레이션되기 전에 받을 수 있는 리뷰/수정 라운드 수입니다. 그 뒤에도 남아 있는 항목에는 판정이 내려집니다.
- `stallNudgeCap`: 멈춘 워커를 재촉하는 횟수입니다. 이 횟수는 초기화되지 않습니다.

## 살아 있는 스펙, 맵, 지표

**살아 있는 스펙.** 웨이브가 자동 병합된 뒤 `emet spec-merge --spec <id>`가 스펙의 `ADDED`/`MODIFIED`/`REMOVED` 요구 사항 델타를 `docs/specs/<area>.md`(`specs.dir`)에 병합합니다. 아무것도 쓰기 전에 모든 영역을 검사합니다. 충돌이 있거나 시나리오를 잃게 되는 요구 사항이 있으면 종료 코드 1로 끝나며 어떤 파일도 건드리지 않습니다.

**코드베이스 맵.** `emet map`은 기존 코드베이스의 개요(스택, 구조, 규약, 테스트, 핫스팟)를 `docs/agents/codebase.md`(`map.path`)에 작성하고, 생성에 사용한 커밋 SHA를 찍어 둡니다. 같은 커밋에서는 항상 같은 파일이 만들어집니다. `emet map --stale`은 HEAD가 찍어 둔 값보다 앞서 나가면 종료 코드 1로 끝나며, 이 경우 `emet preflight`가 경고합니다. `emet map --for <globs>`는 티켓의 편집 대상과 일치하는 섹션만 출력합니다. 이 출력이 워커 브리프에 포함되는 맵의 유일한 부분입니다.

**지표.** `emet metrics --run <id>`는 세션 트랜스크립트를 바탕으로 티켓별, 웨이브별, 실행별 토큰, API 환산 비용, 경과 시간을 보고합니다. 또한 티켓별로 추정한 컨텍스트 예산과 각 워커가 실제로 사용한 양을 비교합니다. 이 요약은 실행의 최종 보고서 끝에 들어갑니다.
