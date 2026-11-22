---
title: 트래커와 랜딩
description: 티켓이 있는 곳, 웨이브가 풀 리퀘스트나 로컬 병합으로 랜딩하는 방식, 웨이브를 이어 붙이는 방법을 설명합니다.
seoTitle: emet의 트래커와 랜딩
sourceHash: da19ec4cf50e7084
---

티켓이 있는 곳, 웨이브가 랜딩하는 방식, 웨이브를 이어 붙이는 방법을 설명합니다. 여기서 언급하는 모든 키는 [설정 레퍼런스](../reference/configuration.md)에, 모든 하위 명령은 [CLI 레퍼런스](../reference/cli.md)에 있습니다.

<img src="../brand/mascot/mascot-work.svg" alt="emet 마스코트, 작업 중" width="96" align="right">

## 트래커

emet은 Linear, GitHub Issues 또는 로컬 파일과 함께 동작하며 `tracker.kind`로 설정합니다. `github` 트래커에는 `gh`가 필요합니다. `linear` 트래커에는 Linear MCP 서버가 `.mcp.json`(또는 사용자 범위)에 선언되어 있어야 합니다. [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.

### 로컬 트래커

`tracker.kind: "local"`일 때 스펙과 티켓은 메인 워크트리의 `.scratch/` 아래(버전 관리되지 않음)에 있는 마크다운 파일입니다. `.scratch/<slug>/spec.md`와 `.scratch/<slug>/issues/<NN>-<slug>.md`이며, 각각 `Status:` 줄과 `Blocked by:` 줄을 갖고 코멘트는 `## Comments` 아래에 둡니다. 코디네이터는 `emet tracker`(`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`)를 통해 이 파일들을 읽고 씁니다. `emet init --tracker local`로 이 구성을 설정합니다. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.

## 랜딩

`landing.mode`는 `"pr"`(기본값) 또는 `"merge"`이며 트래커와는 독립적입니다. `merge` 모드에서는 웨이브가 `emet land`를 통해 트렁크로의 로컬 병합 한 번으로 랜딩하고, CI 대신 `commands.selfCheck`를 사용하며 푸시는 하지 않습니다. `gh`는 트래커가 `github`이거나 랜딩이 `pr`일 때만 필요합니다. [ADR-0010](../adr/0010-local-merge-landing.md)을 참고하세요.

`landing.unit`은 무엇을 한 덩어리로 랜딩할지 정합니다. `"spec"`(기본값)은 스펙 전체를 한 번에 랜딩하고, `"wave"`는 각 웨이브를 따로 랜딩하는 기존 규칙을 유지합니다. [ADR-0037](../adr/0037-landing-per-spec.md)을 참고하세요. 이 ADR은 [ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)를 대체합니다.

### 스펙 브랜치

`landing.unit: "spec"`에서는 코디네이터가 `emet spec-branch ensure --spec <id>`로 트렁크에서 `spec/<id>`를 만듭니다. 웨이브가 리뷰와 `commands.selfCheck`를 통과하면 `emet spec-branch integrate`가 `--no-ff`로 웨이브 브랜치를 `spec/<id>`에 병합하고, `Emet-Wave`와 `Emet-Tickets` 트레일러가 달린 커밋을 만듭니다. 브랜치가 `spec/<id>`에 들어 있는 티켓은 **Landed**가 아니라 **Integrated**입니다. 다음 웨이브의 프런티어에서는 닫힌 블로커로 계산되지만, 트래커에서는 최종 랜딩까지 열린 상태로 남습니다. 이후 웨이브는 `spec/<id>`의 끝에서 분기하므로, PR의 CI를 기다리는 웨이브는 없습니다.

`emet spec-branch sync`는 트렁크를 `spec/<id>`에 병합하며 리베이스는 하지 않습니다. 충돌이 나면 중단하고, 브랜치를 바꾸지 않은 채 두며, 0이 아닌 코드로 종료합니다. `emet spec-branch land`는 동기화를 실행한 뒤 브랜치를 한 번만 랜딩합니다. `pr` 모드에서는 `spec/<id>`를 푸시하고, 통합된 모든 웨이브의 티켓마다 한 줄씩 `Closes #N`이 들어간 PR을 하나 열고, 그 검사를 기다린 뒤 `landing.specMergeMethod`(기본값은 병합 커밋이며 `pr.mergeMethod`는 무시)로 병합합니다. `merge` 모드에서는 `spec/<id>`를 `--no-ff`로 로컬 트렁크에 병합하며 푸시하지 않습니다. `--partial`은 그때까지 통합된 웨이브만 랜딩합니다. `emet spec-branch abandon --spec <id> --force`는 브랜치에 `abandoned/spec-<id>` 태그를 붙여 삭제하고, 로컬 트래커의 통합된 티켓을 `ready-for-agent`로 되돌립니다.

스펙 모드에서는 워커 워크트리가 스펙 브랜치에서 시작하도록 Claude Code 설정에 `worktree.baseRef: "head"`가 필요하며, `emet preflight`와 `emet doctor`가 이를 확인합니다. 또한 `emet doctor`는 모드가 `pr`인데 저장소 설정이나 트렁크 룰셋이 구성된 `landing.specMergeMethod`를 허용하지 않으면 경고합니다.

### Quick run

`/emet:run --quick <요청>`은 작은 변경을 위한 **Quick run**을 시작합니다. 인터뷰는 한 라운드, `folded` 티켓은 하나, 승인은 한 번입니다. 변경이 화면을 건드리지 않고 티켓 하나에 들어갈 때(새 표면이 `sizing.inlineMaxLines` 이내이고 컨텍스트 예산 트립와이어가 작동하지 않을 때) 사용하세요. 그렇지 않으면 승인 전에 멈추고 `--quick` 없는 `/emet:run`을 권합니다. `domain-modeling`, 캔버스, 프런티어 라운드, `emet chain`은 건너뜁니다. 워커 하나를 실행한 뒤 `emet verify`, `specs.enabled`일 때의 살아 있는 스펙 단계, `emet assess --quick`, 티어가 `passive`가 아니면 리뷰어, 그리고 `emet gate`를 실행합니다. `--quick`을 `--draft` 또는 `--dispatch`와 함께 쓰면 거부되며, `--no-promote`는 허용됩니다.

Quick run은 `landing.unit` 설정과 상관없이 웨이브 단위로 랜딩합니다. `emet approve --quick`이 `"mode": "quick"`을 기록하고 `resolveLandingUnit`이 `"wave"`를 반환하므로 스펙 브랜치를 기대하지 않습니다. 하나의 PR로(`landing.mode`가 `merge`이면 로컬 머지로) 랜딩한 뒤 after-spec 단계를 실행합니다.

고위험 diff는 Quick run을 멈춥니다. `emet assess --quick`은 티어가 `high`이면 종료 코드 1로 끝나며, 이것이 게이트의 **Stop**입니다. 자동 머지는 없고 PR은 열린 채로 남으며, 최종 보고서에 고위험 사유가 적힙니다.

### PR 랜딩

`landing.unit: "spec"`에서는 PR이 스펙의 것입니다. 마지막 웨이브 뒤에 `emet spec-branch land`가 여는, 통합된 모든 웨이브를 아우르는 PR 하나입니다. `landing.unit: "wave"`에서는 웨이브 하나가 PR 하나입니다. 본문에는 각 티켓마다 한 줄씩 `Closes #N`(트래커의 닫기 키워드)이 들어가며, 코디네이터는 PR을 열 때 티켓을 리뷰 중 상태로 옮깁니다. 이후 PR은 `pr.autoMerge`에 따라 병합되며, 웨이브에 플래그가 지정되었거나 `autoMerge`가 `false`이거나 CI 수정 횟수를 모두 소진한 경우에는 열린 채로 남습니다(이 경우 PR에는 사람의 판단이 필요하다는 라벨이 붙습니다). 병합 후에는 GitHub 트래커에서는 `emet tracker close`가 티켓을 닫고, `emet cleanup --run <runId>`가 웨이브의 브랜치, 티켓 클레임, 워커 슬롯을 해제합니다. 또한 PR이 브랜치의 최신 커밋에서 병합된 로컬 브랜치를 통합 브랜치까지 포함해 삭제합니다.

웨이브의 브랜치들이 함께 병합된 뒤에는 통합 브랜치에서 `commands.fullSuite`가 한 번 실행됩니다. 실패하면 PR과 `autoChain`이 차단됩니다. 게이트는 그 결과를 `--integration`으로 받습니다. 스펙 랜딩의 마지막이 아닌 웨이브에서는 코디네이터가 `commands.selfCheck` 결과를 `--ci`로 넘기고, `emet ci --wait`로 CI를 기다리는 것은 최종 랜딩뿐입니다. 그러면 웨이브가 남아 있는 동안 게이트는 `chain`이라고 답합니다.

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

**살아 있는 스펙.** `specs.enabled`로 옵트인합니다. 스펙의 마지막 웨이브에서 그 리뷰 전에, 코디네이터가 스펙의 요구 사항 델타를 작성하고 `emet spec-merge --spec <id>`를 한 번 실행해 `docs/specs/<area>.md`(`specs.dir`)에 병합한 뒤 결과를 커밋하므로, 리뷰를 거쳐 같은 PR로 랜딩됩니다. 아무것도 쓰기 전에 모든 영역을 검사합니다. 충돌이 있거나 시나리오를 잃게 되는 요구 사항이 있으면 종료 코드 1로 끝나며 어떤 파일도 건드리지 않습니다. 코디네이터는 한 번 재시도하고, 그래도 안 되면 업데이트 없이 랜딩하고 이를 알립니다.

**코드베이스 맵.** `emet map`은 기존 코드베이스의 개요(스택, 구조, 규약, 테스트, 핫스팟)를 `docs/agents/codebase.md`(`map.path`)에 작성하고, 생성에 사용한 커밋 SHA를 찍어 둡니다. 같은 커밋에서는 항상 같은 파일이 만들어집니다. `emet map --stale`은 HEAD가 찍어 둔 값보다 앞서 나가면 종료 코드 1로 끝나며, 이 경우 `emet preflight`가 경고합니다. `emet map --for <globs>`는 티켓의 편집 대상과 일치하는 섹션만 출력합니다. 이 출력이 워커 브리프에 포함되는 맵의 유일한 부분입니다.

**지표.** `emet metrics --run <id>`는 세션 트랜스크립트를 바탕으로 티켓별, 웨이브별, 실행별 토큰, API 환산 비용, 경과 시간을 보고합니다. 또한 티켓별로 추정한 컨텍스트 예산과 각 워커가 실제로 사용한 양을 비교합니다. 이 요약은 실행의 최종 보고서 끝에 들어갑니다.
