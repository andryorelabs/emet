---
title: CLI 레퍼런스
description: 모든 emet 하위 명령, 게이트와 기록 표, 종료 코드, 환경 변수를 설명합니다.
seoTitle: emet CLI 레퍼런스
sourceHash: 8bb02104970da0a8
---

모든 `emet` 하위 명령, 게이트와 기록 표, 종료 코드, 환경 변수입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다. [README](../../README.md)로 돌아가기. 모든 명령은 `--help`로 사용법을 출력합니다.

## 하위 명령

Claude Code 안에서는 슬래시 명령 세 가지가 CLI를 감쌉니다. `/emet:run`(파이프라인), `/emet:init`(`emet init`), `/emet:doctor`(`emet doctor .`)입니다. 일반 터미널에서 `emet`을 쓰려면 `install.sh`가 필요합니다. 그렇지 않으면 세션 안에서 `! emet <subcommand>`를 실행하세요.

`emet <command> [...args]`. `emet --version`은 버전을 출력합니다.

### 설정과 감사

- `emet migrate [--dry-run]`: 예전 형식의 리포지토리를 emet 이름으로 바꿉니다.
- `emet init [--tracker linear|github|local] [--force]`: 패키지 매니저, 트렁크 브랜치, 트래커 종류를 자동으로 감지하고 `emet.config.json`과 `docs/agents/*.md` 파일을 작성합니다. `--tracker local`은 로컬 트래커를 설정합니다.
- `emet doctor [--all] [<path> ...]`: 원하는 수의 리포지토리를 한 번에 읽기 전용으로 감사합니다. 기본값은 현재 디렉터리입니다.
- `emet preflight [--run <id>] [--post-dispatch]`: 리포지토리가 디스패치할 준비가 되었는지 확인합니다.
- `emet skill-path <name>`: mattpocock-skills 스킬의 `SKILL.md` 절대 경로를 출력합니다. 스킬을 찾지 못하면 종료 코드 1로 끝납니다.
- `emet selftest`: CLI 자체의 단위 테스트를 실행합니다. 소스 설치에서만 가능하며, 컴파일된 바이너리는 종료 코드 1로 끝나고 `emet doctor`를 실행하라고 안내합니다.

아무 git 리포지토리에서나:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init`은 스스로 추론할 수 없는 항목(공유 테스트 데이터베이스 락, 스키마 소유권 등)에 대해 생성된 `docs/agents/*.md` 파일에 `TODO(emet):` 마커를 남깁니다. 이 부분을 채워 주세요. 마커가 하나라도 남아 있으면 `emet preflight`는 디스패치를 거부합니다.

그런 다음 Claude Code 안에서:

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### 플릿 점검

`emet doctor`는 여러 리포지토리를 읽기 전용으로 한 번에 감사합니다.

```bash
emet doctor ~/code/*
```

리포지토리마다 다음 항목을 보고합니다. 유효한 `emet.config.json`, 네 개의 `docs/agents/*.md` 파일이 모두 있는지, 남아 있는 `TODO(emet):` 마커가 없는지, `commands.selfCheck`의 명령이 실제로 해석되는지, 그리고 해당 리포지토리의 트래커별 의존성 점검 결과(`gh`, Linear. [의존성](dependencies.md#무엇이-무엇을-확인하는가) 참고)입니다. mattpocock-skills 플러그인과 외부 CLI 플래그(`gh`, `claude --bg`, `claude agents --json`. `--help`로 확인)는 리포지토리마다가 아니라 전체 스윕에서 한 번만 확인합니다.

### 실행, 워커, 슬롯

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: 실행을 위해 티켓을 예약합니다. `--release <ticket>`, `--list`, `--prune [--dry-run]`은 각각 클레임을 해제하고, 클레임을 나열하고, 오래된 클레임을 정리합니다.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: `~/.local/state/emet/slots`에 있는 호스트 전체 풀에서 워커 슬롯을 가져옵니다. `--release --run <id>`, `--release-index <index>`, `--list`는 슬롯을 해제하거나 나열합니다.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: 인자 없이 실행하면 작업이 랜딩된 종료되었거나 죽은 실행을 회수합니다. `--run`은 해당 실행을 정리하고, `--all`은 리포지토리 전체의 브랜치 정리입니다. 병합 후 `emet cleanup --run <runId>`를 실행하면 웨이브의 브랜치, 티켓 클레임, 워커 슬롯이 해제됩니다.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: 워커가 부트스트랩 때 기록하는 `git worktree lock` 사유를 출력합니다.
- `emet launch <spec-id> --wave <n>`: 웨이브를 `claude --bg` 세션으로 시작하고 `handoff.launcher`에 따라 Orca 탭을 엽니다. 시작 전체(중복 세션 확인, `claude --bg`, 탭)를 수행하고 `{ name, id, attach, orcaTab: { opened, reason } }`를 출력합니다. 다른 세션에서 웨이브를 직접 실행하고 싶을 때는 단순한 `claude --bg` 대신 이것을 사용하세요.
- `emet status [--spec <id>]`: 웨이브별 Working / Checking / Ready / Needs-decision을 JSON과 요약 줄로 출력합니다. `emet status --help`에 JSON 설명이 있습니다.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: 세션 사용량을 보고합니다. `--stalled`는 멈춘 워커를 나열합니다.
- `emet handoff --check <path> | --render <path>`: 워커의 `.emet/handoff-<ticket>.md` 노트를 검증하거나 렌더링합니다.
- `emet metrics [--run <id>]`: 세션 트랜스크립트를 바탕으로 티켓별, 웨이브별, 실행별 토큰, API 환산 비용, 경과 시간을 보고합니다. 또한 티켓별로 추정한 컨텍스트 예산과 각 워커가 실제로 사용한 양을 비교합니다. 이 요약은 실행의 최종 보고서 끝에 들어갑니다.

### 계획, 리뷰, 랜딩

- `emet validate --spec <id> | --file <path>`: 계획 검증입니다. [게이트와 기록](#게이트와-기록)을 참고하세요.
- `emet surfaces --check <file.json | ->`: 웨이브 안의 티켓들 사이에서 허용된 편집 범위 글롭이 겹치면 거부합니다.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: [게이트와 기록](#게이트와-기록)을 참고하세요.
- `emet assess --base <ref> --head <ref>`: diff를 `passive`, `medium`, `high`로 분류하고 티어, 그 이유, 권장 리뷰어 모델과 추론 강도를 JSON으로 출력합니다. [모델과 추론 강도](../../README.md#models--effort)와 [`review`](configuration.md#review)를 참고하세요.
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: 통합 브랜치를 로컬 트렁크에 병합합니다(`landing.mode`가 `merge`일 때). CI 대신 `commands.selfCheck`를 사용하며 아무것도 푸시하지 않습니다.
- `emet spec-merge --spec <id>`: 웨이브가 자동 병합된 뒤 스펙의 `ADDED`/`MODIFIED`/`REMOVED` 요구 사항 델타를 `docs/specs/<area>.md`(`specs.dir`)에 병합합니다. 아무것도 쓰기 전에 모든 영역을 검사합니다. 충돌이 있거나 시나리오를 잃게 되는 요구 사항이 있으면 종료 코드 1로 끝나며 어떤 파일도 건드리지 않습니다.
- `emet map [--refresh]`: 기존 코드베이스의 개요(스택, 구조, 규약, 테스트, 핫스팟)를 `docs/agents/codebase.md`(`map.path`)에 작성하고, 생성에 사용한 커밋 SHA를 찍어 둡니다. 같은 커밋에서는 항상 같은 파일이 만들어집니다. `emet map --stale`은 HEAD가 찍어 둔 값보다 앞서 나가면 종료 코드 1로 끝나며, 이 경우 `emet preflight`가 경고합니다. `emet map --for <globs>`는 티켓의 편집 대상과 일치하는 섹션만 출력합니다. 이 출력이 워커 브리프에 포함되는 맵의 유일한 부분입니다.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: `.scratch/` 위의 로컬 트래커이며 표준 출력은 JSON입니다. [로컬 트래커](#로컬-트래커)를 참고하세요.
- `emet guard`: Claude Code의 `PreToolUse` 훅으로, 표준 입력에서 훅 JSON을 읽습니다. `install.sh`가 `~/.claude/settings.json`에 연결합니다. 무인 실행에서 실패를 일으키는 것으로 알려진 몇 가지 동작을 차단합니다(`emet/src/guard.ts` 참고).

### 로컬 트래커

`tracker.kind: "local"`일 때 스펙과 티켓은 메인 워크트리의 `.scratch/` 아래(버전 관리되지 않음)에 있는 마크다운 파일입니다. `.scratch/<slug>/spec.md`와 `.scratch/<slug>/issues/<NN>-<slug>.md`이며, 각각 `Status:` 줄과 `Blocked by:` 줄을 갖고 코멘트는 `## Comments` 아래에 둡니다. 코디네이터는 `emet tracker`(`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`)를 통해 이 파일들을 읽고 씁니다. `emet init --tracker local`로 이 구성을 설정합니다. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.

`landing.mode`는 `"pr"`(기본값) 또는 `"merge"`이며 트래커와는 독립적입니다. `merge` 모드에서는 웨이브가 `emet land`를 통해 트렁크로의 로컬 병합 한 번으로 랜딩하고, CI 대신 `commands.selfCheck`를 사용하며 푸시는 하지 않습니다. `gh`는 트래커가 `github`이거나 랜딩이 `pr`일 때만 필요합니다. [ADR-0010](../adr/0010-local-merge-landing.md)과 [`landing`](configuration.md#landing)을 참고하세요.

### PR 랜딩과 웨이브 연결

웨이브 하나는 PR 하나입니다. 본문에는 각 티켓에 대한 `Closes #N`(트래커의 닫기 키워드)이 들어가며, 코디네이터는 PR을 열 때 티켓을 리뷰 중 상태로 옮깁니다. 이후 PR은 `pr.autoMerge`에 따라 병합되며, 웨이브에 플래그가 지정되었거나 `autoMerge`가 `false`이거나 CI 수정 횟수를 모두 소진한 경우에는 열린 채로 남습니다(이 경우 PR에는 사람의 판단이 필요하다는 라벨이 붙습니다). 이후 웨이브는 웨이브 1을 실행한 세션이 아니라 각자의 세션에서 실행됩니다. 다음에 일어나는 일은 `pr`과 `handoff` 섹션이 제어합니다. [`pr`](configuration.md#pr)과 [`handoff`](configuration.md#handoff)를 참고하세요.

### Codex 호스트

이 명령들은 Codex 에이전트 호스트(`agentHost`가 `"codex"`)를 위한 것입니다. [Codex 가이드](../guide/codex.md)를 참고하세요.

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: 클레임과 슬롯을 확인한 뒤 `.emet/worktrees/agent-<ticket>`을 만들고, 실행별 `CODEX_HOME` 오버레이를 구성하여 워커를 분리된 `codex exec`로 시작합니다. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`는 종료될 때까지 기다렸다가 기록된 결과 상태를 출력합니다.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: `emet review-package`가 만든 패키지에 대해 리뷰어를 읽기 전용 `codex exec`로 실행하고, `emet review --findings`에 넘길 지적 사항 JSON을 출력합니다. `passive` 등급에서는 프로세스를 시작하지 않습니다.
- `emet launch <spec-id> --wave <n>`: 이 호스트에서는 `$emet:run --dispatch <spec>`을 실행하는 분리된 `codex exec`를 시작하고 그 스레드 ID를 기록합니다. Orca 탭은 열리지 않으며, `codex exec resume <id>`로 세션을 이어갑니다.
- `emet guard`: `EMET_AGENT_HOST=codex`일 때 Codex 훅 입력을 읽고, `apply_patch` 경로를 `.emet/surface.json`과 대조하며, 프롬프트 줄 `approve <id>`가 올 때까지 승인 게이트를 닫아 둡니다.

## 게이트와 기록

각 단계는 티켓이 끝났는지, 병합할 수 있는지, 재시도할 가치가 있는지를 스스로 판단하지 않습니다. 디스크의 기록을 읽고 판단을 출력하는 CLI 명령을 호출합니다. 실행 기록은 `.emet/runs/<run-id>/`에, 리뷰 원장은 `.emet/review/`에 있으며, 둘 다 워커의 워크트리가 아니라 메인 체크아웃에 있습니다.

| 단계           | 명령                                                 | 강제하는 내용                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 승인 전        | `emet validate --file <plan.json>`                   | 모든 `S#`가 하나 이상의 티켓에 포함되고 인수 시나리오를 가질 것. 모든 티켓이 하나 이상의 `S#`를 다룰 것. 웨이브 안에서 편집 범위가 겹치지 않을 것. 의존성 순환이 없을 것. `emet preflight`는 승인된 계획에 대해 이를 다시 실행합니다.          |
| 승인           | `emet approve --run <id> --spec <file>`              | 스펙과 티켓 목록의 해시를 담은 `approval.json`을 기록합니다. 이후 둘 중 하나가 바뀌면 디스패치가 거부됩니다(`--check`).                                                                                                                        |
| 티켓 생성      | `emet materialize-log --run <id> --record/--lookup`  | 생성된 각 티켓의 ID를 만들어지는 즉시 저장하므로, 중단된 실행이 중복을 만들지 않습니다.                                                                                                                                                        |
| 워커 완료      | `emet results --run <id> --write/--read <ticket>`    | 워커는 로컬 결과 파일(`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`와 `Risk:` 줄)을 작성합니다. 트래커에 쓸 수 있는 것은 코디네이터뿐입니다.                                                                                        |
| 각 워커 이후   | `emet verify <ticket> --run <id>`                    | 디스패치 기준선 이후에 커밋이 있는지, 변경된 모든 경로가 티켓의 편집 범위 안에 있는지, 핸드오프 노트가 `handoff --check`를 통과하는지, `commands.workerScopedSuite`가 통과하는지 확인합니다. 리뷰와 병합은 통과 기록이 없는 티켓을 거부합니다. |
| 리뷰 입력      | `emet review-package <base> <head> --out <file>`     | 리뷰어에게 줄 diff를 하나로 묶습니다. 리뷰어는 파일 경로로 받습니다. 범위가 비어 있거나 base의 후손이 아니면 종료 코드 3으로 끝납니다.                                                                                                         |
| 리뷰           | `emet review --ticket <t> --findings <file>`         | 지적 원장을 관리하고 분류 순서(`intent_gap` → `bad_plan` → `patch` → `defer`)와 라운드 상한을 강제합니다. `--escalate`는 다음 모델 티어로 넘어갑니다. `--rule`/`--rulings`는 보고서와 PR 본문에 들어갈 "내가 내린 판정"을 기록하고 나열합니다. |
| 병합 또는 체인 | `emet gate <ticket> --tier … --ci … --integration …` | `merge`, `hold`, `chain`, `stop`, `defer` 중 하나를 이유와 함께 JSON으로 출력합니다. verify 기록, 열린 지적, 위험 티어, CI, 통합 스위트, 예산을 읽습니다.                                                                                      |

웨이브의 브랜치들이 함께 병합된 뒤에는 통합 브랜치에서 `commands.fullSuite`가 한 번 실행됩니다. 실패하면 PR과 `autoChain`이 차단됩니다. 게이트는 그 결과를 `--integration`으로 받습니다. 게이트가 읽는 예산은 [`budgets`](configuration.md#budgets)를 참고하세요.

## 종료 코드

종료 코드는 모든 하위 명령에서 같은 의미를 가집니다.

| 코드 | 의미                                                                                      |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | 정상.                                                                                     |
| `1`  | 조치가 필요한 지적이 있습니다.                                                            |
| `2`  | 설정 또는 사용법 오류로, 도구가 실제로 실행되지 않았습니다. 알 수 없는 명령도 포함합니다. |
| `3`  | 내부 오류.                                                                                |

## 환경 변수

사용자용 변수입니다. 설정하면 대응하는 설정 값보다 우선합니다.

| 변수                          | 효과                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight`는 그 한 번의 실행에 한해 의존성 차단을 경고로 낮춥니다. 본인의 셸에서 설정하고, 코디네이터가 무인으로 실행하는 곳에는 설정하지 마세요. |
| `EMET_MAX_LIVE_WORKERS`       | [`concurrency.maxLiveWorkers`](configuration.md#concurrency)를 덮어씁니다. 양의 정수 또는 `auto`를 받습니다.                                                                          |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | [`concurrency.runIdleThresholdMs`](configuration.md#concurrency)를 밀리초 단위로 덮어씁니다.                                                                                          |
| `EMET_STATE_DIR`              | 호스트 전체의 상태 디렉터리이며 워커 슬롯 풀을 담고 있습니다. 확인 순서는 `$EMET_STATE_DIR`, 그다음 `$XDG_STATE_HOME/emet`, 그다음 `~/.local/state/emet`입니다.                       |
| `EMET_MEM_RESERVE_GIB`        | 비워 두어야 하는 메모리 여유분(GiB)입니다. 사용 가능한 메모리가 이보다 적으면 슬롯 획득이 거부됩니다. 기본값은 8입니다. `auto` 워커 상한 계산에도 쓰입니다.                           |
| `EMET_MEM_PER_WORKER_GIB`     | `maxLiveWorkers`가 `auto`일 때 워커 하나당 가정하는 메모리(GiB)입니다. 기본값은 2입니다. 워크트리마다 브라우저 기반 E2E 스위트를 돌리는 것처럼 워커별 스택이 무거우면 값을 높이세요.  |
| `EMET_CPU_OVERSUBSCRIBE`      | `auto` 워커 상한에 쓰는 CPU 배수입니다. 기본값은 1입니다.                                                                                                                             |
| `EMET_AGENT_HOST`             | `codex`로 설정하면 `emet guard`가 Codex 훅 입력을 읽습니다. Codex 훅이 설정하며, Claude Code에서는 설정하지 않은 채로 두세요.                                                         |

`auto` 상한은 `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`입니다. 예전 `FORGE_*` 이름도 여전히 읽으며, 둘 다 설정되어 있으면 `EMET_*`가 우선합니다.
