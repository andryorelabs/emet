---
title: 시작하기
description: emet을 설치하고, emet doctor로 동작을 확인한 뒤 처음으로 실행합니다.
seoTitle: emet 시작하기
sourceHash: ce83e38591b3de64
---

emet을 설치하고, 동작하는지 확인한 뒤, 처음으로 실행합니다.

<img src="../brand/mascot/mascot-done.svg" alt="emet 마스코트, 완료" width="96" align="right">

## 요구 사항

Claude Code 또는 Codex CLI, `git`, `gh`(인증 완료), `mattpocock-skills` 플러그인이 필요하며 Linux 또는 macOS에서 동작합니다. Bun은 `emet self install --from`에만 필요합니다. 네이티브 Windows는 지원되지 않습니다(WSL을 사용하세요). 각 항목을 무엇이 확인하는지를 포함한 전체 목록은 [의존성 레퍼런스](../reference/dependencies.md)에 있습니다.

## 설치

터미널에서 부트스트랩 스크립트를 실행합니다. Bun, 클론, sudo가 필요하지 않습니다.

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

이 스크립트는 sudo로 실행하면 거부하고, 사용자 플랫폼에 맞는 독립 실행형 바이너리와 `SHA256SUMS`를 임시 디렉터리에 내려받아 체크섬(`gh`가 있으면 증명서도)을 검증한 뒤에야 `emet self install`에 넘깁니다. 검증에 실패하면 아무것도 쓰지 않습니다. 셸 프로필은 수정하지 않으므로 `~/.local/bin`이 `PATH`에 없으면 직접 추가하세요.

`emet self install`은 바이너리를 `~/.local/share/emet/versions/<version>/emet`에 두고 `~/.local/bin/emet`에서 링크합니다. 그런 다음 Claude Code 파일을 씁니다. 참조 프롬프트는 `~/.claude/emet/`에, 명령은 `~/.claude/commands/emet/`에, 에이전트는 `~/.claude/agents/`에 놓이며, 플러그인 자리표시자는 일반 `~/.claude` 경로로 다시 쓰입니다. 백업을 만든 뒤 emet 훅을 `~/.claude/settings.json`에 병합하고 다른 훅은 건드리지 않습니다. Codex가 있으면 emet 스킬도 `~/.agents/skills/emet/` 아래에 쓰고 emet 훅을 `$CODEX_HOME/hooks.json`(기본값 `~/.codex`)에 추가하며, `config.toml`은 절대 쓰지 않습니다. 다시 실행해도 안전하며, 직접 수정한 파일은 그대로 유지되고 새 버전은 `<file>.new`로 옆에 기록됩니다.

아무것도 쓰지 않고 모든 쓰기를 미리 보려면 `--dry-run`을 전달하세요. `sh -s --` 뒤의 인수는 `emet self install`에 전달됩니다.

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

`sh -s -- 1.2.3`처럼 버전을 고정할 수도 있으며 기본값은 `latest`입니다. 대신 체크아웃에서 설치하려면 `emet self install --from <checkout>`을 실행하세요. `bun`이 필요하며 `emet selftest`가 계속 동작합니다.

### Codex

Codex가 있으면 `emet self install`이 한 번만 하는 단계를 출력합니다. Codex에서 `/hooks`를 열고 이벤트 페이지에서 `t`를 눌러 emet 훅을 신뢰하세요(또는 시작 시 "Hooks need review" 프롬프트를 승인하세요). 그때까지는 emet guard가 실행되지 않습니다. [Codex에서 emet 실행하기](codex.md#설치)를 참고하세요.

### 자동 업데이트

`SessionStart` 훅이 `emet self update --auto`를 하루에 최대 한 번, 분리된 상태로 실행하며 오프라인이면 조용히 넘어갑니다. 체크섬을 검증하고 새 버전을 스테이징하며, 잡힌 워커 슬롯이 없을 때만 심볼릭 링크를 교체합니다. 그렇지 않으면 업데이트는 다음 세션 시작까지 보류됩니다. 이전 버전은 롤백용으로 보관됩니다. 끄려면 `EMET_AUTO_UPDATE=0`을 설정하거나 `emet self update --auto off`를 실행하세요. `emet self update --auto on`으로 다시 켭니다. [emet 업데이트하기](../how-to/update-emet.md)를 참고하세요.

### 제거

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

버전 디렉터리, `~/.local/bin/emet` 심볼릭 링크, 설치 상태 파일, Codex 스킬, 두 훅 파일에 있는 모든 emet 훅을 제거하고, `emet setup`이 기록한 추가 항목을 되돌립니다. 직접 수정한 명령 파일과 다른 훅은 그대로 남습니다. [CLI 레퍼런스](../reference/cli.md#setup-ledger-and-restore)를 참고하세요.

### 선택 사항: 플러그인

독립 실행형 설치 대신, 또는 선택 사항인 `emet-mascot`을 위해 emet을 플러그인으로 설치할 수 있습니다. emet 플러그인이 설치되어 있는 동안 `emet self install`은 거부하고 제거 방법을 안내하며, `--force`를 주면 그래도 진행하고, 둘이 공존하면 `emet doctor`가 경고합니다. 플러그인에 무엇이 포함되는지는 에이전트 호스트에 따라 다릅니다. Claude Code에서는 `/emet:run`, 에이전트, 가드 훅, 그리고 처음 사용할 때 체크섬이 검증된 독립 실행형 바이너리를 내려받는 `emet` 심(shim)이 함께 설치됩니다. Codex 플러그인은 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬과 훅을 제공하지만 에이전트와 `emet` 심은 없습니다.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

어떤 설치든 같은 진입점 세 가지를 제공합니다. Claude Code에서는 슬래시 명령 `/emet:run`, `/emet:init`, `/emet:doctor`이고, Codex에서는 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬입니다. 독립 실행형 설치는 `emet`을 `PATH`에도 올려 주므로 일반 터미널에서 `emet init`과 `emet doctor .`가 동작합니다. 플러그인만 있다면 슬래시 명령을 쓰거나 Claude Code 또는 Codex 세션 안에서 `! emet <subcommand>`를 사용하세요. Claude Code에서는 에이전트 이름이 서로 다르며, 플러그인에서는 `emet:emet-worker`, 독립 실행형에서는 `emet-worker`입니다. Codex에는 emet 에이전트가 없으며, 각 워커가 별도의 `codex exec` 프로세스이기 때문입니다.

각 리포지토리에서 권장하는 순서는 먼저 `setup-matt-pocock-skills` 스킬을 실행한 다음(Claude Code에서는 `/setup-matt-pocock-skills`, Codex에서는 `mattpocock-skills` 플러그인의 같은 스킬을 Codex의 `$` 구문으로 실행) `emet init`을 실행하는 것입니다.

제대로 설치되었는지는 Claude Code 안에서 `/emet:doctor`(Codex에서는 `$emet:doctor`)로, 또는 터미널에서 `emet doctor .`로 확인하세요(`selftest`에는 `--from` 소스 설치가 필요합니다).

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
