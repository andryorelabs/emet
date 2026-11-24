---
title: 트래커와 랜딩
description: 티켓이 있는 곳, 스펙이 풀 리퀘스트나 로컬 병합으로 랜딩하는 방식, 웨이브를 이어 붙이는 방법을 설정합니다.
seoTitle: emet의 트래커와 랜딩
sourceHash: c79d8a04687b4620
---

티켓이 있는 곳, 스펙이 랜딩하는 방식, 웨이브를 이어 붙일지 여부를 선택합니다. 여기서 언급하는 모든 키는 [설정 레퍼런스](../reference/configuration.md)에, 모든 하위 명령은 [CLI 레퍼런스](../reference/cli.md)에 있습니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

<img src="../brand/mascot/mascot-work.svg" alt="emet 마스코트, 작업 중" width="96" align="right">

## 사전 준비

- emet이 설치되어 있고 `emet.config.json`이 있는 리포지토리가 있어야 합니다. 없으면 `emet init`을 실행하세요.
- `github` 트래커 또는 `pr` 랜딩에는 `gh`가 `PATH`에 있고 인증되어 있어야 합니다.
- `linear` 트래커에는 `.mcp.json`(또는 사용자 범위)에 Linear MCP 서버가 선언되어 있어야 합니다. [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.
- 이 설정들이 무엇을 바꾸는지 이해하려면 [랜딩](../concepts/landing.md)과 [실행, 웨이브, 스펙](../concepts/runs-waves-specs.md)을 읽으세요.

## 트래커 선택하기

:::steps

1. `emet.config.json`의 `tracker.kind`를 `"linear"`, `"github"`, `"local"` 중 하나로 설정합니다.
2. 로컬 트래커라면 `emet init --tracker local`을 실행합니다. 이후 스펙과 티켓은 메인 워크트리의 `.scratch/` 아래(버전 관리되지 않음)에 있는 마크다운 파일입니다. `.scratch/<slug>/spec.md`와 `.scratch/<slug>/issues/<NN>-<slug>.md`이며, 각각 `Status:` 줄과 `Blocked by:` 줄을 갖고 코멘트는 `## Comments` 아래에 둡니다. 코디네이터는 `emet tracker`를 통해 이 파일들을 읽고 씁니다. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.
3. 그 밖의 종류라면 위의 해당 사전 준비 항목을 확인합니다.

:::

## 스펙이 랜딩하는 방식 선택하기

:::steps

1. `landing.mode`를 `"pr"`(기본값) 또는 `"merge"`로 설정합니다. `merge` 모드에서는 스펙이 트렁크로의 로컬 병합 한 번으로 랜딩하고(`emet spec-branch land`, 또는 `landing.unit: "wave"`일 때 웨이브마다 `emet land`), CI 대신 `commands.selfCheck`를 사용하며 아무것도 푸시하지 않습니다. [ADR-0010](../adr/0010-local-merge-landing.md)을 참고하세요.
2. `landing.unit`을 `"spec"`(기본값, 스펙 전체를 한 번에 랜딩) 또는 `"wave"`(각 웨이브를 따로 랜딩)로 설정합니다. [ADR-0037](../adr/0037-landing-per-spec.md)을 참고하세요.
3. `landing.unit: "spec"`에서는 워커 워크트리가 `spec/<id>` 브랜치에서 시작하도록 Claude Code 설정에 `worktree.baseRef: "head"`를 지정합니다. `emet preflight`와 `emet doctor`가 이를 확인합니다.
4. `pr` 모드에서는 `landing.specMergeMethod`(기본값은 병합 커밋)를 리포지토리 설정과 트렁크 룰셋이 허용하는 방식으로 지정합니다. 허용하지 않으면 `emet doctor`가 경고합니다.
5. 병합을 제어하려면 `pr.autoMerge`(기본값 `true`)와 `pr.maxCiFixAttempts`를 설정합니다. `pr.mergeMethod`는 `landing.unit: "wave"`에서만 설정하세요. 스펙 PR은 4단계의 `landing.specMergeMethod`를 사용하며 이 값은 무시합니다. 플래그가 지정된 항목이 있는 웨이브는 자동 병합되지 않습니다.

:::

스펙 브랜치 명령(`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`)은 코디네이터가 실행하며, 그 플래그는 [CLI 레퍼런스](../reference/cli.md)에 있습니다.

## 웨이브 이어 붙이기

이후 웨이브는 각자의 세션에서 실행됩니다. 이어 붙이기는 기본적으로 꺼져 있습니다.

:::steps

1. `emet.config.json`에 `handoff` 섹션을 설정합니다.

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. Claude Code에서는 `claude`가 PATH에 있고 `--bg`를 지원하는지, 작업 공간을 신뢰하는지(리포지토리에서 `claude`를 대화형으로 한 번 열어 수락), 그리고 대화형 세션에서 우회 경고를 한 번 수락했는지(`skipDangerousModePermissionPrompt`) 확인합니다.
3. Codex에서는 `codex`가 PATH에 있고 `codex.minVersion` 이상이며 `codex exec`에 `--json`과 `--output-schema`가 있는지 확인합니다. 다음 웨이브는 분리된 `codex exec`로 시작됩니다. [Codex에서 emet 실행하기](use-codex.md)를 참고하세요.
4. `handoff.launcher`(Claude Code 전용)를 `auto`, `orca`, `bg` 중 하나로 설정해 웨이브가 Orca 탭도 열지 선택합니다. `permissionMode`는 Claude Code 전용이며, Codex에서 이어 붙인 세션은 `codex.sandbox`를 사용합니다.
5. 다른 세션에서 웨이브를 직접 시작하려면 단순한 `claude --bg` 대신 `emet launch <spec-id> --wave <n>`을 실행합니다. `{ name, id, attach, orcaTab: { opened, reason } }`를 출력합니다.

:::

이어 붙이기는 PR이 병합되었고 플래그가 지정된 항목이 없을 때만 시작하며, `emet-<spec-id>-*` 세션이 이미 실행 중이면 건너뛰고, 시작에 실패하면 `/emet:run --dispatch <spec-id>`를 출력하는 방식으로 되돌아갑니다. 이어 붙인 웨이브는 `claude agents` 또는 `claude attach emet-<spec-id>-w<n>`으로 확인하세요.

## 예산과 선택 기능 설정하기

:::steps

1. 기본값이 맞지 않으면 `budgets` 섹션을 설정합니다.

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts`는 티켓이 `verify`에 실패한 뒤 보류되기까지 허용되는 횟수이고, `reviewRounds`는 티켓이 한 번 에스컬레이션되기 전에 받을 수 있는 리뷰 라운드 수이며(수정 라운드는 별도의 `budgets.fixRounds`가 있고 기본값은 2), `stallNudgeCap`은 멈춘 워커를 재촉하는 횟수입니다. [리뷰와 게이트](../concepts/review-and-gates.md)를 참고하세요.

2. [살아 있는 스펙](../concepts/living-specs.md)을 `docs/specs/`(`specs.dir`)에 유지하려면 `specs.enabled`를 설정합니다.
3. `emet map`을 실행해 코드베이스 맵을 `docs/agents/codebase.md`(`map.path`)에 작성합니다. HEAD가 찍어 둔 값보다 앞서 나가면 `emet map --stale`은 종료 코드 1로 끝납니다.
4. 실행 후 `emet metrics --run <id>`를 실행해 티켓별, 웨이브별, 실행별 토큰, 비용, 경과 시간을 확인합니다.

:::

티켓 하나짜리 작은 변경에는 전체 파이프라인 대신 `/emet:run --quick <request>`를 시작하세요. 항상 웨이브 단위로 랜딩하며 고위험 diff에서는 멈춥니다.

## 확인

:::steps

1. `emet preflight`를 실행합니다. `tracker`, `landing`, `pr`, `handoff`, `budgets` 섹션을 검증하며, 설정이 잘못되었으면 종료 코드 2로 끝납니다.
2. `emet doctor .`를 실행해 트래커, `gh`, Linear MCP 서버, 랜딩 설정을 지목하는 실패가 없는지 확인합니다.
3. 로컬 트래커라면 `emet tracker frontier --spec <slug>`를 실행해 예상한 티켓이 나열되는지 확인합니다.

:::
