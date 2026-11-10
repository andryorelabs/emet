---
title: 시작하기
description: emet을 Claude Code 플러그인으로 설치하고, emet doctor로 동작을 확인한 뒤 처음으로 실행합니다.
seoTitle: emet 시작하기
sourceHash: 7a918962dca60c10
---

emet을 설치하고, 동작하는지 확인한 뒤, 처음으로 실행합니다.

<img src="../brand/mascot/mascot-done.svg" alt="emet 마스코트, 완료" width="96" align="right">

## 요구 사항

Claude Code 또는 Codex CLI, `git`, `gh`(인증 완료), `mattpocock-skills` 플러그인이 필요하며 Linux 또는 macOS에서 동작합니다. Bun은 소스 설치에만 필요합니다. 네이티브 Windows는 지원되지 않습니다(WSL을 사용하세요). 각 항목을 무엇이 확인하는지를 포함한 전체 목록은 [의존성 레퍼런스](../reference/dependencies.md)에 있습니다.

## 설치

설치 방법은 두 가지입니다.

**플러그인**(Bun 불필요). 이 리포지토리를 마켓플레이스로 추가하고 `emet` 플러그인을 설치합니다. 무엇이 포함되는지는 에이전트 호스트에 따라 다릅니다. Claude Code에서는 `/emet:run`, 에이전트, 가드 훅, 그리고 처음 사용할 때 체크섬이 검증된 독립 실행형 바이너리를 내려받는 `emet` 심(shim)이 함께 설치됩니다.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

Codex에서는 `codex plugin`으로 플러그인을 설치합니다. 절차는 [Codex에서 emet 실행하기](codex.md#설치)에 있습니다. Codex 플러그인은 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬과 훅을 제공하지만 에이전트와 `emet` 심은 없으므로, 터미널의 `emet`은 `install.sh`로 설치합니다.

**`install.sh`**(Bun이 있든 없든 동작합니다):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

`bun`이 PATH에 있으면 CLI 소스를 `~/.claude/emet`에, `emet` 래퍼를 `~/.local/bin/emet`에 복사합니다. `bun`이 없으면 대신 독립 실행형 바이너리 심(`~/.local/bin/emet`, `~/.claude/emet/bin/emet`으로 링크됨)을 설치하며, 이 심은 처음 실행할 때 바이너리를 내려받고 체크섬을 검증합니다(`curl`이 필요합니다). 어느 쪽이든 명령은 `~/.claude/commands/emet/`에, 에이전트는 `~/.claude/agents/`에 놓이고, 프롬프트 안의 플러그인 자리표시자는 일반 `~/.claude` 경로로 다시 쓰입니다. 다시 실행해도 안전하며, 직접 수정한 파일은 그대로 유지되고 새 버전은 `<file>.new`로 옆에 기록됩니다.

두 방법 모두 진입점 세 가지를 제공합니다. Claude Code에서는 슬래시 명령 `/emet:run`, `/emet:init`, `/emet:doctor`이고, Codex에서는 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬이며 이는 Codex 플러그인만 제공합니다(`install.sh`는 Claude Code 명령을 설치합니다). 일반 터미널의 `emet` 명령은 `install.sh`를 실행한 뒤에만 동작합니다. 그렇지 않으면 슬래시 명령을 쓰거나 Claude Code 또는 Codex 세션 안에서 `! emet <subcommand>`를 사용하세요. Claude Code에서는 에이전트 이름이 서로 다르며, 플러그인에서는 `emet:emet-worker`, 독립 실행형에서는 `emet-worker`입니다. Codex에는 emet 에이전트가 없으며, 각 워커가 별도의 `codex exec` 프로세스이기 때문입니다.

각 리포지토리에서 권장하는 순서는 먼저 `setup-matt-pocock-skills` 스킬을 실행한 다음(Claude Code에서는 `/setup-matt-pocock-skills`, Codex에서는 `mattpocock-skills` 플러그인의 같은 스킬을 Codex의 `$` 구문으로 실행) `emet init`을 실행하는 것입니다.

제대로 설치되었는지는 Claude Code 안에서 `/emet:doctor`(Codex에서는 `$emet:doctor`)로, 또는 `install.sh` 이후 터미널에서 `emet doctor .`로 확인하세요(`selftest`에는 소스 설치가 필요합니다).

`doctor` 또는 `preflight`가 문제를 보고하면 [문제 해결](../troubleshooting.md)을 참고하세요. 사용자를 대신해 무엇이 설치되거나 로그인되는 일은 없습니다. 누가 무엇을 확인하는지와 `EMET_SKIP_DEPENDENCY_CHECKS`에 대해서는 [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.

## 첫 실행

아무 git 리포지토리에서나:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

세션 안에서는 `/emet:init`이 `emet init`과 같은 일을 합니다. 그런 다음 Claude Code 안에서(Codex에서는 `/emet:run` 대신 `$emet:run`을 사용합니다) 다음과 같이 실행합니다.

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init`은 스스로 추론할 수 없는 항목(공유 테스트 데이터베이스 락, 스키마 소유권 등)에 대해 생성된 `docs/agents/*.md` 파일에 `TODO(emet):` 마커를 남깁니다. 이 부분을 채워 주세요. 마커가 하나라도 남아 있으면 `emet preflight`는 디스패치를 거부합니다.

## 다음 단계

- [트래커와 랜딩](trackers-and-landing.md): GitHub, Linear 또는 로컬 티켓, 그리고 웨이브가 랜딩하는 방식.
- [Codex에서 emet 실행하기](codex.md): 설치, 단일 승인, Codex 에이전트 호스트의 한계.
- [모델과 추론 강도](models-and-effort.md): 각 역할이 사용하는 모델과 추론 강도.
- [플릿 점검](fleet.md): 여러 리포지토리를 한 번에 감사합니다.
- [설정 레퍼런스](../reference/configuration.md)와 [CLI 레퍼런스](../reference/cli.md): 모든 키와 하위 명령.
