---
title: CLI 레퍼런스
description: 모든 emet 하위 명령, 게이트와 기록 표, 종료 코드, 환경 변수를 설명합니다.
seoTitle: emet CLI 레퍼런스
sourceHash: cde063f67e8e54d7
---

모든 `emet` 하위 명령, 게이트와 기록, 종료 코드, 환경 변수입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다. [README](../../README.md)로 돌아가기. 모든 명령은 `--help`로 사용법을 출력합니다.

## 하위 명령

Claude Code 안에서는 슬래시 명령 세 가지가 CLI를 감쌉니다. `/emet:run`(파이프라인), `/emet:init`(`emet init`), `/emet:doctor`(`emet doctor .`)입니다. Codex에서는 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬입니다. 일반 터미널에서 `emet`을 쓰려면 `emet self install`이 필요합니다. 그렇지 않으면 세션 안에서 `! emet <subcommand>`를 실행하세요.

`emet <command> [...args]`. `emet --version`은 버전을 출력합니다.

아무 git 리포지토리에서나:

```bash
emet init       # autodetects package manager, trunk branch, tracker kind
emet preflight  # confirms the repo is dispatch-ready
```

`emet init`은 스스로 추론할 수 없는 항목(공유 테스트 데이터베이스 락, 스키마 소유권 등)에 대해 생성된 `docs/agents/*.md` 파일에 `TODO(emet):` 마커를 남깁니다. 이 부분을 채워 주세요. 마커가 하나라도 남아 있으면 `emet preflight`는 디스패치를 거부합니다.

그런 다음 Claude Code 안에서(Codex에서는 같은 인자로 `$emet:run`을 사용합니다):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## 설정과 감사

### `emet migrate`

예전 형식의 리포지토리를 emet 이름으로 바꿉니다.

- `--dry-run`

### `emet init`

패키지 매니저, 트렁크 브랜치, 트래커 종류, after-spec 모드([`handoff.afterSpec`](configuration.md#handoff) 참고)를 자동으로 감지합니다. Prisma 스키마(`prisma/schema.prisma` 또는 `prisma/schema/` 폴더)나 Drizzle 마이그레이션 폴더(`drizzle.config.*` 옆의 `drizzle/`)를 찾으면 [`schema.ownedPaths`](configuration.md#schema)를 설정하고, `emet.config.json`과 `docs/agents/*.md` 파일을 작성합니다.

- `--tracker linear|github|local`: `--tracker local`은 로컬 트래커를 설정합니다.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

원하는 수의 리포지토리를 한 번에 읽기 전용으로 감사합니다. 기본값은 현재 디렉터리입니다.

- `--all`
- `<path> ...`: 감사할 리포지토리.

[`verify.browser`](configuration.md#verify)를 설정한 리포지토리에서는 선택 사항인 `agent-browser` 관련 항목도 보고합니다. 바이너리가 없으면 `indeterminate`(설치 방법을 담은 `optional:` 줄)이고, 바이너리가 있는데 `agent-browser doctor`가 실패하면 경고로 표시됩니다. 둘 다 오류가 아니며 종료 코드도 바꾸지 않습니다. `verify.browser`가 없는 리포지토리에는 아무것도 표시되지 않습니다.

#### 플릿 점검

`emet doctor`는 여러 리포지토리를 읽기 전용으로 한 번에 감사합니다.

```bash
emet doctor ~/code/*
```

리포지토리마다 다음 항목을 보고합니다. 유효한 `emet.config.json`, 네 개의 `docs/agents/*.md` 파일이 모두 있는지, 남아 있는 `TODO(emet):` 마커가 없는지, `commands.selfCheck`의 명령이 실제로 해석되는지, 그리고 해당 리포지토리의 트래커별 의존성 점검 결과(`gh`, Linear. [의존성](dependencies.md#무엇이-무엇을-확인하는가) 참고)입니다.

mattpocock-skills 플러그인과 외부 CLI 플래그는 리포지토리마다가 아니라 전체 스윕에서 한 번만 확인합니다. 대상은 `gh`와 에이전트 호스트의 플래그입니다. Claude Code에서는 `claude --bg`와 `claude agents --json`, Codex에서는 `codex exec --json`과 `--output-schema`이며, `--help`로 확인합니다.

### `emet setup`

선택 설치 항목을 readline 프롬프트로 제안합니다.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: `--with`, `--yes`, `--json`과 함께 사용할 수 있습니다. 선택한 각 항목의 계획 단계(또는 `already-present`)를 출력하고 아무것도 바꾸지 않습니다. 명령 실행, 파일 쓰기, 원장 항목 쓰기가 모두 없으며 종료 코드는 0입니다.
- `--restore <id>`: 복원할 수 있는 두 항목 중 하나를 되돌립니다. [설정 원장과 복원](#설정-원장과-복원)을 참고하세요.

TTY가 없거나 `--yes` 또는 `--with`를 쓰면 아무것도 묻지 않고 지정한 항목만 정확히 설치합니다. TTY가 없고 `--with`도 없으면 아무것도 설치하지 않고 `--list` 카탈로그를 출력합니다. 각 단계는 `installed`, `already-present`, `skipped`, `failed` 중 하나를 보고합니다. 하나가 실패해도 나머지는 멈추지 않으며, 실패한 것이 있으면 종료 코드는 1입니다. `/emet:setup`은 플러그인 진입점이며 같은 선택지를 `AskUserQuestion`으로 묻습니다. `installed`가 된 모든 항목은 Setup 원장에 기록됩니다.

항목은 다음과 같습니다.

- `mattpocock-skills`(기본값 켜짐), `engram`, `mascot`, `orca-pet`, `gh-auth`.
- `agent-browser`(기본값 꺼짐): `bun add -g agent-browser@latest`를 실행한 뒤 `agent-browser install`을 실행하고, `~/.agent-browser/config.json`이 없을 때만 `contentBoundaries: true`와 `maxOutput: 50000`으로 해당 파일을 작성합니다. 그런 다음 `agent-browser doctor`를 실행하여 실패하면 경고를 출력합니다. 버전을 고정하지 않고 `--with-deps`도 넘기지 않으므로, 시스템 라이브러리가 없으면 직접 실행할 명령을 출력합니다.
- `context7`(기본값 꺼짐): `bun add -g ctx7@latest`를 실행한 뒤 `ctx7 setup --cli --claude --yes`를 실행하고, `codex`가 PATH에 있을 때만 `ctx7 setup --cli --codex --yes`를 실행합니다. `ctx7` CLI와 `find-docs` 스킬을 설치하지만 MCP 서버는 설치하지 않고, 버전을 고정하지 않으며, `ctx7 setup` 단계가 실패하면 직접 실행할 명령을 출력합니다. `ctx7`은 `CTX7_TELEMETRY_DISABLED=1`을 설정하지 않으면 익명 사용 이벤트를 전송하며, 환경 변수의 `CONTEXT7_API_KEY`가 `ctx7 login`으로 저장된 계정보다 우선합니다.
- `firecrawl-local`(기본값 꺼짐): `cargo`가 필요하고, 바이너리가 없을 때 `cargo install firecrawl-local`을 실행합니다. 그런 다음 `FIRECRAWL_CLOUD=search`와 `--public-only`로 사용자 범위 Claude Code MCP 서버를 등록하며, 설정이 다른 이전 등록은 교체합니다. scrape, crawl, map은 해당 머신에서 실행되고 웹 검색만 Firecrawl Cloud로 전송되며 비공개 주소는 차단됩니다.
  - `agent-browser`가 내려받은 가장 최신 Chrome을 `FIRECRAWL_CHROME_PATH`로 넘깁니다.
  - AppArmor가 권한 없는 사용자 네임스페이스를 제한하는 Linux에서는, Firecrawl Local이 샌드박스 없이는 Chrome을 실행하지 않으므로 AppArmor 프로필과 이를 로드하는 `sudo` 명령을 출력합니다.
  - 사용할 수 있는 Chrome이 없으면 JavaScript로 렌더링되는 페이지는 빈 결과로 돌아옵니다.
- `claude-settings`: 권장 Claude Code 설정입니다. 선택한 경우에만, `settings.json`의 타임스탬프 백업을 만든 뒤 적용합니다.

#### 설정 원장과 복원

`emet setup`은 결과가 `installed`인 모든 항목을 상태 디렉터리의 `setup-ledger.json`에 `{ id, at, undo }` 형태로 기록합니다. `already-present` 항목은 아무것도 기록하지 않으며, 같은 ID가 다시 `installed`가 되어도 처음 항목의 이전 상태를 유지합니다. 원장 쓰기는 원자적이며, 손상된 원장은 빈 것으로 읽지 않고 그 경로를 명시한 오류가 됩니다.

되돌리기 기록에는 복원에 필요한 내용이 담깁니다.

- `claude-settings`: 이전 `model`(없었다면 없음), 실제로 추가한 deny 규칙, 백업 경로.
- `firecrawl-local`: 이전 사용자 범위 MCP 항목(`claude mcp remove`를 실행하기 전에 `~/.claude.json`에서 읽음)과 emet이 `cargo install`을 실행했는지 여부.
- 플러그인: 플러그인 ID.
- `orca-pet`: 작성한 파일.
- `agent-browser`: bun 전역 패키지(emet이 만들었다면 설정 파일도).
- `context7`: bun 전역 패키지.
- `engram`: brew 포뮬러와 플러그인.

`emet setup --restore <id>`는 `claude-settings`와 `firecrawl-local`만 받으며, 그 외의 ID는 종료 코드 2로 끝납니다.

- `claude-settings`는 타임스탬프 백업을 만든 뒤 이전 `model`을 복원하고(없었다면 키를 삭제) emet이 추가한 deny 규칙만 제거합니다. 현재 `model`이 설정이 지정한 값과 다르면 그대로 두고 경고를 출력합니다.
- `firecrawl-local`은 `claude mcp remove firecrawl-local -s user`를 실행하고, 기록된 항목이 있으면 `claude mcp add-json firecrawl-local '<previous json>' -s user`로 되돌립니다.

복원에 성공하면 원장 항목이 삭제됩니다. 원장에 항목이 없는 ID는 `nothing to restore for <id>`를 출력하고 종료 코드 1로 끝납니다.

`emet uninstall`은 모든 원장 항목을 같은 방식으로 되돌립니다. `claude-settings`와 `firecrawl-local`은 `--restore`와 같고, 플러그인은 `claude plugin uninstall <id>`로, `orca-pet` 파일과 emet이 만든 agent-browser 설정은 삭제하여 되돌립니다. brew, bun, cargo 전역 패키지는 제거 명령(예: `bun remove -g ctx7`)을 출력만 하고 실행하지 않으며, `gh auth`는 절대 건드리지 않습니다. 되돌린 각 항목은 원장에서 빠지며, 추가 항목 하나가 실패해도 나머지는 멈추지 않습니다.

### `emet self install`

독립 실행형 설치입니다: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: 모든 쓰기를 나열하고 아무것도 쓰지 않습니다.
- `--force`: emet 플러그인이 설치되어 있어도 진행합니다. 지정하지 않으면 플러그인이 설치되어 있는 동안에는 명령이 거부됩니다.
- `--from <checkout>`: Bun 소스 설치를 재현합니다. CLI 소스가 `~/.claude/emet`에 복사되고 `~/.local/bin/emet`은 그 위에서 `bun`을 실행하는 래퍼가 되므로 `emet selftest`가 동작하며, `bun`이 없으면 실패합니다. 기여자는 `emet self install --from .`을 사용합니다.

바이너리를 `~/.local/share/emet/versions/<v>/emet`에 두고 `~/.local/bin/emet` 심볼릭 링크를 만들며, 참조 프롬프트와 `.install-manifest.json`을 `~/.claude/emet/`에, 명령을 `~/.claude/commands/emet/`에, 에이전트를 `~/.claude/agents/`에 씁니다.

emet 훅을 `~/.claude/settings.json`에 병합하며(백업을 만들고 다른 훅은 건드리지 않음), Codex가 있으면 스킬을 `~/.agents/skills` 아래에 쓰고 훅을 `$CODEX_HOME/hooks.json`(기본값 `~/.codex`)에 추가합니다(`config.toml`은 절대 쓰지 않으므로 `/hooks`로 훅을 한 번 승인하세요).

두 번째 실행은 아무것도 바꾸지 않으며, 편집된 파일은 유지되고 새 버전은 `<file>.new`로 옆에 놓입니다. [설치](../start/install.md)의 한 줄 설치 스크립트는 릴리스 바이너리를 내려받고 `SHA256SUMS`를 검증한 뒤 이 명령을 실행합니다.

### `emet self update`

`emet self update [latest|X.Y.Z]`는 릴리스를 내려받아 `SHA256SUMS`(`gh`가 있으면 증명서도)로 검증하고 스테이징합니다. 심볼릭 링크와 설치된 파일의 교체는 잡힌 워커 슬롯이 없을 때만 일어나며, 그렇지 않으면 다음 세션 시작까지 보류됩니다. 실패해도 현재 버전은 그대로이며 실패는 저널에 기록됩니다. 이전 버전은 롤백용으로 보관되고 더 오래된 버전은 정리됩니다. 플러그인 설치에는 아무 일도 하지 않습니다.

- `--auto [off|on]`: `SessionStart` 훅이 실행하는 형태입니다. 하루에 최대 한 번, 분리된 상태로 실행되며 오프라인이면 조용히 넘어갑니다. `off` 또는 `on`으로 전환합니다. `EMET_AUTO_UPDATE=0`으로도 끌 수 있습니다.

### `emet uninstall`

`emet self install`로 만든 설치와 `emet setup`이 추가한 항목을 제거합니다. 먼저 전체 계획을 만든 다음 실행합니다.

- `--dry-run`: 계획을 출력하고 아무것도 바꾸지 않습니다.
- `--yes`: 확인을 생략합니다. TTY가 있고 `--yes`가 없으면 확인을 한 번 묻고, TTY도 `--yes`도 없으면 계획을 출력하고 아무것도 바꾸지 않은 채 종료 코드 0으로 끝납니다.
- `--purge`: 상태 디렉터리(`EMET_STATE_DIR`, 없으면 `XDG_STATE_HOME/emet`)와 `~/.emet`도 삭제합니다. 지정하지 않으면 둘 다 남습니다.
- `--json`: 결과를 JSON으로 출력합니다.

제거하는 항목은 다음과 같습니다.

- 설치 매니페스트에 기록된 해시와 현재 해시가 일치하는 모든 파일과 그 `.new` 파일. 편집된 파일은 남겨 두고 목록으로 보여 줍니다.
- 심(shim) `~/.local/bin/emet`. 설치의 래퍼이거나 `~/.claude/emet` 또는 `~/.local/share/emet/versions`를 가리키는 심볼릭 링크일 때만 삭제하며, 이어서 매니페스트와 비게 된 디렉터리를 삭제합니다.
- `~/.claude/settings.json`과 `$CODEX_HOME/hooks.json`(기본값 `~/.codex`)에서 이벤트와 관계없이 emet의 모든 훅 명령(`emet guard`, `emet setup --notice`, `emet whats-new --hook`, `emet self update --auto`). 다른 훅은 모두 유지하고, 비게 된 그룹과 이벤트는 삭제합니다.
- 이 emet과 여전히 일치하는 `~/.agents/skills/emet/` 아래의 Codex 스킬(편집된 것은 남겨 두고 목록으로 보여 줍니다), 버전 디렉터리 `~/.local/share/emet/versions`, 설치 상태 `~/.local/share/emet/install.json`.
- Setup 원장의 추가 항목([설정 원장과 복원](#설정-원장과-복원) 참고).

설치 백업(`.pre-emet-guard-backup.`)이 남은 내용과 정확히 같으면 그 바이트를 복원하고, 남는 것이 없으면 파일을 삭제하며, 그 외에는 먼저 타임스탬프가 붙은 백업을 기록합니다.

매니페스트도 설치 상태도 없으면(플러그인 설치) 파일을 건너뛰고 `claude plugin uninstall emet@emet-marketplace`를 출력하며, `codex`가 PATH에 있으면 Codex 플러그인 제거 방법도 출력합니다. 어느 단계라도 실패하거나 읽어야 하는 파일(매니페스트, 설정, 원장)을 읽을 수 없으면 종료 코드 1로 끝나며 해당 경로를 알려 줍니다.

### `emet whats-new`

emet이 업데이트된 뒤 한 번만 알림을 출력합니다.

- `--hook`: `SessionStart` 훅이 실행하는 형태입니다.

### `emet fleet`

`--root`(기본값 `~/code`) 바로 아래 한 단계에 있는, `emet.config.json`이 있는 git 리포지토리 전체를 대상으로 동작합니다. [fleet 가이드](../how-to/check-a-fleet.md)를 참고하세요.

- `emet fleet list [--root <dir>] [--json]`: 리포지토리를 `tracker.kind`, `handoff.autoChain`, `models.worker`와 함께 나열합니다.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: 나열된 모든 리포지토리에서 설정 키 하나를 바꾸며, 먼저 설정 로더로 검증합니다(잘못된 값은 아무것도 바꾸지 않고 종료 코드 1로 끝납니다).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: `emet chain`의 준비 상태 점검 후 각 리포지토리에서 `/emet:run --draft <text>` 세션을 엽니다. `--dry-run`은 세션을 시작하지 않고 계획된 실행 내용을 출력합니다.
- `emet fleet status [--json]`: 전역 저널을 읽어 리포지토리별로 최근 24시간 이내 각 세션의 최신 상태(`ended` 제외)를 출력합니다.

`fleet status`는 리포지토리당 한 줄로 `<repo>: <b> blocked, <w> working, <i> idle`을 막힌 리포지토리부터 출력합니다. `--json`은 `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`를 출력합니다. 세션이 없어도 종료 코드는 0입니다.

### `emet preflight`

리포지토리가 디스패치할 준비가 되었는지 확인합니다.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>`은 mattpocock-skills 스킬의 `SKILL.md` 절대 경로를 출력합니다. 스킬을 찾지 못하면 종료 코드 1로 끝납니다.

### `emet selftest`

CLI 자체의 단위 테스트를 실행합니다. 소스 설치에서만 가능하며, 컴파일된 바이너리는 종료 코드 1로 끝나고 `emet doctor`를 실행하라고 안내합니다.

## 실행, 워커, 슬롯

### `emet claims`

실행을 위해 티켓을 예약합니다: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: 클레임을 해제합니다.
- `--list`: 클레임을 나열합니다.
- `--prune [--dry-run]`: 오래된 클레임을 정리합니다.

### `emet slots`

`~/.local/state/emet/slots`에 있는 호스트 전체 풀에서 워커 슬롯을 가져옵니다: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: 해당 실행의 슬롯을 해제합니다.
- `--release-index <index>`: 슬롯 하나를 해제합니다.
- `--list`: 슬롯을 나열합니다.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. 인자 없이 실행하면 작업이 랜딩된, 종료되었거나 죽은 실행을 회수합니다. 병합 후 `emet cleanup --run <runId>`를 실행하면 웨이브의 브랜치, 티켓 클레임, 워커 슬롯이 해제됩니다.

- `--run <id>`: 해당 실행을 정리합니다.
- `--all`: 리포지토리 전체의 브랜치 정리입니다.
- `--dry-run`
- `--force`

모든 모드에서 PR이 브랜치의 최신 커밋에서 병합된 로컬 브랜치도, 그 브랜치를 담고 있는 깨끗하고 잠기지 않은 에이전트 워크트리와 함께 삭제합니다.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`는 워커가 부트스트랩 때 기록하는 `git worktree lock` 사유를 출력합니다.

### `emet launch`

`emet launch <spec-id> --wave <n>`: Claude Code에서는 웨이브를 `claude --bg` 세션으로 시작하고 `handoff.launcher`에 따라 Orca 탭을 엽니다(Codex는 [Codex 호스트](#codex-호스트) 참고). 시작 전체(중복 세션 확인, `claude --bg`, 탭)를 수행하고 `{ name, id, attach, orcaTab: { opened, reason } }`를 출력합니다. 다른 세션에서 웨이브를 직접 실행하고 싶을 때는 단순한 `claude --bg` 대신 이것을 사용하세요.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]`는 전달받은 게이트 플래그로 `emet gate`를 실행하고, 결정이 `chain`일 때만 다음 웨이브를 시작합니다.

실행 전에 준비 상태(호스트 메모리 여유, 리포지토리와 `/tmp`의 여유 디스크 및 inode, `orca` CLI)를 확인하고, 실행 후에는 자식 세션이 목록에 있는지 확인합니다. 그 외의 결정, 차단하는 준비 문제(`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`), 또는 같은 스펙과 웨이브에 이미 세션이 있으면 이유와 함께 종료 코드 1로 끝나며 아무것도 실행하지 않습니다.

### `emet status`

`emet status [--spec <id>] [--brief]`는 웨이브별 Working / Checking / Ready / Needs-decision을 JSON과 요약 줄로 출력합니다. `emet status --help`에 JSON 설명이 있습니다.

- `--spec <id>`
- `--brief`: 대신 최대 세 줄을 출력합니다. 전체 상태, 사람을 기다리는 항목(있다면), 다음 동작입니다.

JSON에는 `sessions: [{sessionId, state, blocked, since, runId}]`도 담깁니다. 이 리포지토리에서 emet이 소유한 각 세션의 최근 24시간 이내 최신 주의 상태이며, `ended` 세션은 제외합니다. `state`가 `needs-decision`이면 `blocked`는 true이고, `since`는 그 상태가 된 시각입니다. 막힌 세션이 하나라도 있으면 활성 웨이브가 없어도 전체 `state`가 `needs-decision`이 됩니다. 요약 줄에는 막힌 세션 수가 표시되고, `--brief`는 사람을 기다리는 항목 줄에 이를 나열합니다.

### `emet run`

`emet run current [--json]`은 리포지토리의 활성 실행(실행 id, 스펙, 웨이브, 단계, 마지막 업데이트)을 `.emet/phase.json`에서 읽어 출력합니다. 활성 실행이 없으면 `no active run`을 출력하고 0으로 종료합니다.

### `emet memory`

[Engram](https://github.com/Gentleman-Programming/engram)에서 교훈을 검색하고 저장합니다.

- `emet memory search --json <query> [--limit <n>]`: 이전 실행에서 얻은 교훈을 검색합니다. `match_mode: "any"`로 검색하고(`--limit` 기본값 5, 최대 20), 토픽 키가 `emet/<repo>/lessons/`로 시작하는 노트만 남기며, `content`를 2000자로 자른 `{available: true, results: [{id, topicKey, title, content}]}`를 출력합니다. `<repo>`는 `git remote get-url <repo.remote>`의 마지막 경로 세그먼트에서 `.git`을 뺀 값이며, 없으면 메인 워크트리의 basename입니다.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: 표준 입력에서 교훈 글머리 기호 1~5개(각각 최대 300자의 `- ` 줄)를 읽어, 토픽 키 `emet/<repo>/lessons/<key>`인 노트에 `## <runId> — <outcome> (<date>)` 섹션으로 덧붙이거나, 그 노트가 없으면 새로 만듭니다. 20000자를 넘는 노트는 가장 오래된 섹션부터 삭제됩니다. `{available: true, saved: true, topicKey}`를 출력합니다.

두 하위 명령 모두 저장소 루트에서 `engram mcp --tools=agent`를 실행해 Engram과 통신하며, Engram 플러그인은 필요하지 않습니다. Engram에 `project`를 넘기지 않습니다.

종료 코드: 잘못된 사용(하위 명령 없음, 쿼리 누락, 글머리 기호 없음, 글머리 기호 5개 초과, 300자를 넘는 글머리 기호, 알 수 없는 outcome, 잘못된 key)은 `2`입니다. Engram 관련 문제(PATH에 없음, 핸드셰이크 실패, 도구 오류, 타임아웃, 잘못된 JSON)는 모두 `0`으로 종료합니다.

- 핸드셰이크가 성공하기 전의 출력은 `{available: false, reason}`입니다.
- 성공한 뒤에는 `search`가 `{available: true, results: [], reason}`, `save`가 `{available: true, saved: false, reason}`를 출력합니다.
- `memory.enabled: "off"`이면 `{available: false, reason: "memory.enabled is off"}`를 출력하고 아무것도 실행하지 않습니다. [`memory`](configuration.md#memory)를 참고하세요.

### `emet insights`

[이벤트 저널](../concepts/attention-and-journal.md)을 읽어 출처(사람 또는 자동)별 실행, 결정과 사유별 게이트 결정, 실행별 사람의 개입, 실행 시작 결과, 닫힌 티켓을 보고합니다. 읽을 수 없는 줄은 건너뛰고 개수를 셉니다. 저널이 비어 있거나 없으면 0 보고서를 출력하고 0으로 종료합니다.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: 기준선을 추가합니다. 이후 보고서는 `--all`을 지정하지 않는 한 그 이후의 이벤트만 다룹니다.

### `emet usage`

세션 사용량을 보고합니다.

- `--session <id>` 또는 `--file <path>`
- `--stalled [--minutes N]`: 멈춘 워커를 나열합니다.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>`는 워커의 `.emet/handoff-<ticket>.md` 노트를 검증하거나 렌더링합니다.

- `--check <path>`: 노트를 검증합니다. 검사를 통과했을 때 `missing` 목록이 비어 있지 않으면 `missing skills: …`를 출력합니다.
- `--expect-skills a,b`(check 전용): 지정한 스킬 중 `loaded` 목록에도 `missing` 목록에도 없는 각각에 대해 검사를 실패시킵니다.
- `--render <path>`: 노트를 렌더링합니다.

노트에는 `skills:` 섹션을 넣을 수 있으며, `skills: none` 또는 `skills: loaded: a, b; missing: c`로 씁니다. `state`가 `done`일 때만 필수이고, 그 밖의 값은 검사에 실패합니다.

### `emet metrics`

`emet metrics [--run <id>]`는 세션 트랜스크립트를 바탕으로 티켓별, 웨이브별, 실행별 토큰, API 환산 비용, 경과 시간을 보고합니다. 또한 티켓별로 추정한 컨텍스트 예산과 각 워커가 실제로 사용한 양을 비교합니다. 이 요약은 실행의 최종 보고서 끝에 들어갑니다.

### `emet ask`

워커 메일박스입니다. 코디네이터에게 질문하거나 답변을 기다립니다.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: 질문을 보냅니다.
- `--wait <n>`: 답변을 기다립니다.
- `--slice <seconds>`

`--wait`를 쓰면 종료 코드 `0`은 답변을, `3`은 슬라이스 타임아웃을, `4`는 만료를 뜻합니다.

### `emet inbox`

`emet inbox --run <id>`는 열려 있는 워커 질문을 JSON으로 나열합니다.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>`는 워커의 질문에 답합니다.

## 계획, 리뷰, 랜딩

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]`는 [`handoff.afterSpec`](configuration.md#handoff)에 따른 after-spec 단계입니다.

- `--dry-run`: 풀 리퀘스트를 열지 않습니다.
- `--no-promote`: 이 단계를 건너뜁니다.
- `--hold`: 마커 `<run dir>/runs/<id>/no-promote`를 쓰고 `{"held":true}`를 출력합니다. 마커가 있는 동안 `emet promote --spec <id>`는 풀 리퀘스트를 열지 않고 `skipped` 노트와 함께 종료 코드 0으로 끝나므로, `--no-promote`가 스펙의 여러 세션에 걸쳐 유지됩니다.

`promote` 모드에서는 `chore: 🔖 promote develop`라는 제목으로 `develop`에서 `main`으로 가는 풀 리퀘스트를 열고, `emet ci --pr <n> --wait`로 기다리며, 상태가 `pass`일 때만 머지 커밋으로 병합합니다. 그런 다음 `main`에 `develop`에 없는 내용이 있을 때만(`develop...main` 비교가 변경된 파일을 하나 이상 나열하는 경우이며, 머지 커밋만 있는 경우는 해당하지 않습니다) `main`에서 `develop`으로 가는 동기화 풀 리퀘스트를 열고, 같은 방식으로 그 체크를 기다리며, 상태가 `pass`일 때만 [`pr.mergeMethod`](configuration.md#pr)로 병합합니다. `main`에 머지 커밋만 있으면 동기화 풀 리퀘스트를 열지 않으며 `syncReason`이 그 이유를 알려 줍니다. 상태가 `fail`, `timeout`, `env-fault`이거나 병합이 거부된 동기화 풀 리퀘스트는 열린 채로 남으며 promote 결과를 바꾸지 않습니다.

풀 리퀘스트 번호, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule`, `reason`을 담은 `promote` 이벤트를 저널에 하나 추가합니다. `afterSpec`은 규칙 목록일 수 있으며, 그 경우 모드는 `develop`을 프로모트할 때 포함될 경로로 선택됩니다([`handoff.afterSpec`](configuration.md#handoff) 참고). `git fetch` 또는 `git diff`가 실패하면 풀 리퀘스트를 열기 전에 종료 코드 1로 끝납니다.

출력되는 결과에는 다음이 담깁니다.

- `rule`: 일치한 규칙의 인덱스이며, 문자열 형식이거나 일치하는 규칙이 없으면 `null`.
- `reason`.
- `syncPrNumber`: 동기화 풀 리퀘스트를 열지 않았으면 `null`.
- `syncMerged`와 `syncReason`: 동기화 풀 리퀘스트가 열린 채로 남은 이유를 설명하는 문장, 없으면 `null`.
- `deployCheck: { run, reason }`: 코디네이터가 `emet deploy-check`를 실행해야 하는지를 알려 줍니다.

`release` 모드에서는 아무것도 병합하지 않고 릴리스 풀 리퀘스트는 사람에게 맡깁니다. `afterSpec`이 `none`이거나, `--no-promote`를 쓰거나, 스펙이 보류 중이거나, 스펙의 마지막 웨이브가 열린 채로 남았거나 플래그가 붙은 경우에는 `skipped` 노트와 함께 종료 코드 0으로 끝납니다. 다만 깨끗하게 끝난 마지막 웨이브 뒤에도 실행되므로 결과에 `deployCheck` 결정이 담깁니다(트렁크 `main`에서는 모드와 상관없이 배포 확인이 실행됩니다). CI가 `pass`가 아니면 아무것도 병합하지 않고 종료 코드 1로 끝납니다.

### `emet deploy-check`

`deploy.check.command`가 종료 코드 0으로 끝날 때까지, 최대 `retries`번 또는 `timeoutSeconds`초 동안, 시도 사이에 `intervalSeconds`초를 기다리며 실행하고 `attempts`와 함께 `state: ok | failed | timeout`을 출력합니다.

- `--json`

종료 코드는 `0`이 ok, `1`이 failed, `3`이 timeout입니다. `deploy.check`가 설정되지 않았으면 `skipped: "no deploy check configured"`를 출력하고 종료 코드 0으로 끝납니다. 코디네이터는 `emet promote` 결과의 `deployCheck.run`이 true일 때만 이를 실행합니다. [`deploy`](configuration.md#deploy)를 참고하세요.

### `emet surfaces`

`emet surfaces --check <file.json | ->`는 웨이브 안의 티켓들 사이에서 허용된 편집 범위 글롭이 겹치면 거부합니다.

### `emet assess`

`emet assess --base <ref> --head <ref>`는 diff를 `passive`, `medium`, `high`로 분류하고 티어, 그 이유, 권장 리뷰어 모델과 추론 강도를 JSON으로 출력합니다. [모델과 추론 강도](../../README.md#models--effort)와 [`review`](configuration.md#review)를 참고하세요.

- `--quick`: 같은 JSON에 `"quickRejected": true|false`를 더해 출력하고, 티어가 `high`이면 종료 코드 1(**Quick run**의 **Stop**: 자동 병합 없이 PR이 열린 채로 남음), 그 외에는 0으로 끝납니다. `--quick`이 없으면 출력과 종료 코드는 그대로입니다.

JSON에는 결정 두 가지도 담깁니다.

- `browserVerify: { run, reason }`: `run`이 `true`인 경우는 티어에 리뷰어가 있고, [`verify.browser`](configuration.md#verify)가 설정되어 있고, `agent-browser` 바이너리가 PATH에 있고, `paths`가 설정된 경우 변경된 경로가 일치할 때뿐입니다. 그렇지 않으면 `reason`이 처음으로 충족되지 않은 조건을 알려 줍니다.
- `dualReview: { run, reason }`: `run`은 티어가 `high`이고, `agentHost`가 `claude`이며, [`review.dual`](configuration.md#review)이 `off`가 아니고, `codex` 바이너리가 PATH에 있을 때만 `true`입니다. 그렇지 않으면 `reason`이 처음으로 충족되지 않은 조건을 알려 줍니다.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>`는 통합 브랜치를 로컬 트렁크에 병합합니다(`landing.mode`가 `merge`일 때). CI 대신 `commands.selfCheck`를 사용하며 아무것도 푸시하지 않습니다.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>`는 `landing.unit: spec`의 스펙 브랜치 `spec/<id>`를 관리합니다([`landing`](configuration.md#landing) 참고). 모두 JSON을 출력합니다.

- `ensure`: 트렁크에서 브랜치를 만들고(멱등), `.emet/specs/<id>/branch.json`을 쓰며, 다른 스펙의 브랜치가 체크아웃되어 있으면 거부합니다.
- `integrate --wave <n> --branch <integration> --tickets a,b`: 웨이브 브랜치를 `--no-ff`로 `spec/<id>`에 병합하고 트레일러 `Emet-Wave`와 `Emet-Tickets`를 달며, 웨이브를 기록하고 `spec.integrate`를 추가합니다. `landing.pushSpecBranch`가 true이면 PR을 열지 않고 브랜치를 푸시합니다.
- `status`: `branch`, `tip`, 통합된 웨이브와 티켓, `behindTrunk`을 출력하며, 웨이브가 빠져 있으면 트레일러에서 `branch.json`을 다시 만듭니다.
- `sync`: 트렁크를 브랜치에 병합하고 리베이스하지 않으며, 충돌이 나면 중단하고 경로를 나열한 뒤 0이 아닌 코드로 종료합니다.
- `land [--partial]`: 동기화한 다음, `pr` 모드에서는 브랜치를 푸시하고 티켓마다 `Closes` 줄이 있는 PR 하나를 열고, 그 검사를 기다린 뒤 `landing.specMergeMethod`(기본값은 병합 커밋이며 `pr.mergeMethod`는 무시)로 병합합니다. `merge` 모드에서는 `--no-ff`로 로컬 트렁크에 병합하고 푸시하지 않습니다. `spec.land`를 추가합니다.
- `abandon --force`: `abandoned/spec-<id>` 태그를 붙이고, 브랜치를 삭제하고, `spec.abandon`을 추가하며, 로컬 트래커의 통합된 티켓을 `ready-for-agent`로 재설정합니다. `--force` 없이는 거부합니다.

`emet tracker frontier`는 `branch.json`에 나열된 티켓을 닫힌 블로커로 계산하고, `emet status`에는 `specBranch`(`branch`, `tip`, `integratedWaves`)가 추가됩니다.

### `emet spec-merge`

`emet spec-merge --spec <id>`는 스펙의 `ADDED`/`MODIFIED`/`REMOVED` 요구 사항 델타를 `docs/specs/<area>.md`(`specs.dir`)에 병합합니다.

- `--deltas-dir`: 델타를 두는 디렉터리를 출력합니다.

`specs.enabled`가 켜져 있으면 코디네이터가 델타를 작성하고, 스펙마다 마지막 웨이브의 통합 브랜치에서 그 리뷰 전에 한 번 실행한 뒤 결과를 커밋합니다. 아무것도 쓰기 전에 모든 영역을 검사합니다. 충돌이 있거나 시나리오를 잃게 되는 요구 사항이 있으면 종료 코드 1로 끝나며 어떤 파일도 건드리지 않습니다. `specs.enabled`가 꺼져 있으면 아무것도 병합하지 않고 종료 코드 0으로 끝납니다.

### `emet map`

`emet map [--refresh]`는 기존 코드베이스의 개요(스택, 구조, 규약, 테스트, 핫스팟)를 `docs/agents/codebase.md`(`map.path`)에 작성하고, 생성에 사용한 커밋 SHA를 찍어 둡니다. 같은 커밋에서는 항상 같은 파일이 만들어집니다.

- `--refresh`
- `--stale`: HEAD가 찍어 둔 값보다 앞서 나가면 종료 코드 1로 끝나며, 이 경우 `emet preflight`가 경고합니다.
- `--for <globs>`: 티켓의 편집 대상과 일치하는 섹션만 출력합니다. 이 출력이 워커 브리프에 포함되는 맵의 유일한 부분입니다.

### `emet guard`

Claude Code의 `PreToolUse` 훅으로, 표준 입력에서 훅 JSON을 읽습니다(Codex 형식은 [Codex 호스트](#codex-호스트) 아래에 있습니다). `emet self install`이 `~/.claude/settings.json`에 연결합니다. 무인 실행에서 실패를 일으키는 것으로 알려진 몇 가지 동작을 차단합니다(`emet/src/guard.ts` 참고).

## 로컬 트래커

`tracker.kind: "local"`일 때 스펙과 티켓은 메인 워크트리의 `.scratch/` 아래(버전 관리되지 않음)에 있는 마크다운 파일입니다. `.scratch/<slug>/spec.md`와 `.scratch/<slug>/issues/<NN>-<slug>.md`이며, 각각 `Status:` 줄과 `Blocked by:` 줄을 갖고 코멘트는 `## Comments` 아래에 둡니다. `emet init --tracker local`로 이 구성을 설정합니다. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)을 참고하세요.

`landing.mode`는 `"pr"`(기본값) 또는 `"merge"`이며 트래커와는 독립적입니다. `merge` 모드에서는 웨이브가 `emet land`를 통해 트렁크로의 로컬 병합 한 번으로 랜딩하고, CI 대신 `commands.selfCheck`를 사용하며 푸시는 하지 않습니다. `landing.unit: "spec"`(기본값)에서는 스펙 전체가 `emet spec-branch land`를 통해 한 번만 랜딩합니다. `gh`는 트래커가 `github`이거나 랜딩이 `pr`일 때만 필요합니다. [ADR-0010](../adr/0010-local-merge-landing.md)과 [`landing`](configuration.md#landing)을 참고하세요.

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`는 `.scratch/` 위의 로컬 트래커이며 표준 출력은 JSON입니다. 코디네이터는 이를 통해 스펙과 티켓을 읽고 씁니다.

#### `emet tracker close`

`tracker.kind: "github"`일 때 `emet tracker close <ticket>... [--pr <n>]`는 각 티켓(`CLA-<n>`, `#<n>` 또는 숫자만)을 `gh issue close --reason completed`로 닫고 상태를 확인한 뒤 `closed` 또는 `already-closed`를 보고합니다.

- `--pr <n>`: "Landed in #<n>" 코멘트를 추가합니다.

`closed` 또는 `already-closed`가 된 티켓의 서로 다른 상위 항목마다 `gh issue view <spec> --json state,subIssuesSummary`를 읽습니다. 스펙이 열려 있고 `subIssuesSummary.completed`가 0이 아닌 `total`과 같으면, `gh issue close --reason completed`와 코멘트 "All <total> tickets landed."로 스펙을 닫고 상태를 확인합니다.

출력에는 `specs`가 추가되며, 서로 다른 상위 항목마다 `{ spec, outcome, detail? }`가 하나씩 들어갑니다. outcome은 `closed`, `open`, `already-closed`, `failed` 중 하나입니다. 상위 항목이 없는 티켓은 추가하지 않으며, 스펙 읽기 또는 닫기에 실패해도 티켓 결과는 바뀌지 않습니다. 나머지를 처리한 뒤 실패한 티켓이나 스펙이 있으면 `1`로 종료합니다. Linear 티켓은 코디네이터가 Linear MCP를 통해 Done인지 확인합니다.

## PR 랜딩과 웨이브 연결

`landing.unit: "wave"`에서는 웨이브 하나가 PR 하나이고, `"spec"`에서는 PR 하나가 통합된 모든 웨이브를 아우릅니다. 본문에는 각 티켓마다 한 줄씩 `Closes #N`(트래커의 닫기 키워드)이 들어가며, 코디네이터는 PR을 열 때 티켓을 리뷰 중 상태로 옮깁니다. 이후 PR은 `pr.autoMerge`에 따라 병합되며, 웨이브에 플래그가 지정되었거나 `autoMerge`가 `false`이거나 CI 수정 횟수를 모두 소진한 경우에는 열린 채로 남습니다(이 경우 PR에는 사람의 판단이 필요하다는 라벨이 붙습니다). 이후 웨이브는 웨이브 1을 실행한 세션이 아니라 각자의 세션에서 실행됩니다. 다음에 일어나는 일은 `pr`과 `handoff` 섹션이 제어합니다. [`pr`](configuration.md#pr)과 [`handoff`](configuration.md#handoff)를 참고하세요.

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]`는 PR의 체크가 끝나거나 타임아웃(기본값 30)이 될 때까지 폴링합니다. `state: pass | fail | env-fault | timeout`, 실패한 체크, `flakeReruns`를 출력하고 절대 병합하지 않습니다.

- `--rerun-flakes`: 실패한 각 체크를 `gh run rerun --failed`로 한 번 다시 실행합니다. 재실행에서 통과한 체크는 Flake입니다.
- `--timeout-minutes <m>`

체크가 없는 PR은 `noChecks: true`와 함께 `pass`입니다. 종료 코드는 `0`이 pass, `1`이 fail 또는 env-fault, `3`이 timeout입니다. `env-fault`는 `STARTUP_FAILURE`로 끝났거나 너무 오래 대기열에 머문 체크를 뜻합니다. 코드 실패가 아니라 CI가 한 번도 실행되지 않은 것입니다.

## Codex 호스트

이 명령들은 Codex 에이전트 호스트(`agentHost`가 `"codex"`)를 위한 것입니다. [Codex 가이드](../how-to/use-codex.md)를 참고하세요.

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: 클레임과 슬롯을 확인한 뒤 `.emet/worktrees/agent-<ticket>`을 만들고, 실행별 `CODEX_HOME` 오버레이를 구성하여 워커를 분리된 `codex exec`로 시작합니다.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: 종료될 때까지 기다렸다가 기록된 결과 상태를 출력합니다.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]`는 `emet review-package`가 만든 패키지에 대해 리뷰어를 읽기 전용 `codex exec`로 실행하고, `emet review --findings`에 넘길 지적 사항 JSON을 출력합니다. `passive` 등급에서는 프로세스를 시작하지 않습니다.

- `--browser-verify true|false`: 기본값은 `false`입니다. `true`이면 프롬프트가 Browser 축으로 끝나고, `--session review-<run>`은 `--run`에서 채워지므로 Codex 리뷰어가 Claude 리뷰어처럼 UI를 검증합니다(`emet assess`가 `browserVerify.run: true`를 출력했을 때 전달하세요. [`verify`](configuration.md#verify) 참고). 플래그가 없으면 프롬프트는 그대로이며, `true`나 `false`가 아닌 값은 사용법 줄을 출력하고 종료 코드 2로 끝납니다.
- `--coverage-out <file>`: Codex 리뷰어의 Coverage verdicts도 JSON 배열로 `<file>`에 씁니다(stdout에는 계속 지적 사항만 출력). 리뷰어가 하나만 실행되는 Codex 호스트에서 사용하세요.

지적 사항은 `emet review` 아래에 설명된 선택 필드 `s`와 `userOption`도 받습니다.

### Codex의 `emet launch`

`emet launch <spec-id> --wave <n>`은 `$emet:run --dispatch <spec>`을 실행하는 분리된 `codex exec`를 시작하고 그 스레드 ID를 기록합니다. Orca 탭은 열리지 않으며, `codex exec resume <id>`로 세션을 이어갑니다.

### Codex의 `emet guard`

`EMET_AGENT_HOST=codex`일 때 `emet guard`는 Codex 훅 입력을 읽고, `apply_patch` 경로를 `.emet/surface.json`과 대조하며, 프롬프트 줄 `approve <id>`가 올 때까지 승인 게이트를 닫아 둡니다.

## 게이트와 기록

각 단계는 티켓이 끝났는지, 병합할 수 있는지, 재시도할 가치가 있는지를 스스로 판단하지 않습니다. 디스크의 기록을 읽고 판단을 출력하는 CLI 명령을 호출합니다. 실행 기록은 `.emet/runs/<run-id>/`에, 리뷰 원장은 `.emet/review/`에 있으며, 둘 다 워커의 워크트리가 아니라 메인 체크아웃에 있습니다. 아래 명령은 파이프라인 순서대로 나열합니다.

### `emet validate`

승인 전: `emet validate --spec <id> | --file <plan.json>`은 계획 검증을 실행합니다.

- 모든 `S#`가 하나 이상의 티켓에 포함되고 인수 시나리오를 가집니다.
- 모든 티켓이 하나 이상의 `S#`를 다룹니다.
- 웨이브 안에서 편집 범위가 겹치지 않습니다.
- 의존성 순환이 없습니다.
- [`validate.coupledSurfaces`](configuration.md#validate)가 있으면, 어떤 쌍의 `source`를 건드리는 티켓이 그 `dependents`를 건드리는 티켓보다 앞선 웨이브에 있을 때 `coupled-surface-split` 오류가 납니다(종료 코드 1).
- 티켓이 하나도 없는 계획은 스펙에 `S#` 항목이 있든 없든 `no-tickets` 오류("plan has no tickets; write one folded ticket", 종료 코드 1)가 납니다. `folded: true`인 티켓 하나가 모든 `S#`를 다루면 통과합니다.

`emet preflight`는 승인된 계획에 대해 이를 다시 실행합니다.

### `emet approve`

승인: `emet approve --run <id> --spec <file>`은 스펙과 티켓 목록의 해시를 담은 `approval.json`을 기록합니다. 이후 둘 중 하나가 바뀌면 디스패치가 거부됩니다(`--check`).

- `--quick`: `"mode": "quick"`도 기록하며, 그 실행의 랜딩 단위가 `wave`가 됩니다. 지정하지 않으면 이 필드는 없고, 이전에 기록된 레코드도 `--check`를 통과합니다.

### `emet materialize-log`

티켓 생성: `emet materialize-log --run <id> --record/--lookup`은 생성된 각 티켓의 ID를 만들어지는 즉시 저장하므로, 중단된 실행이 중복을 만들지 않습니다.

### `emet results`

워커 완료: `emet results --run <id> --write/--read <ticket>`. 워커는 로컬 결과 파일(`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`와 `Risk:` 줄)을 작성합니다. 트래커에 쓸 수 있는 것은 코디네이터뿐입니다.

### `emet verify`

각 워커 이후: `emet verify <ticket> --run <id>`는 디스패치 기준선 이후에 커밋이 있는지, 변경된 모든 경로가 티켓의 편집 범위 안에 있는지, 핸드오프 노트가 `handoff --check`를 통과하는지, `commands.workerScopedSuite`가 통과하는지 확인합니다. 리뷰와 병합은 통과 기록이 없는 티켓을 거부합니다.

### `emet review-package`

리뷰 입력: `emet review-package <base> <head> --out <file>`은 리뷰어에게 줄 diff를 하나로 묶습니다. 리뷰어는 파일 경로로 받습니다. 범위가 비어 있거나 base의 후손이 아니면 종료 코드 3으로 끝납니다.

### `emet review`

리뷰: `emet review --ticket <t> --findings <file>`은 지적 원장을 관리하고 분류 순서(`intent_gap` → `bad_plan` → `patch` → `defer`)와 라운드 상한을 강제합니다.

- `--base <ref>`: 첫 라운드에서 `<ref>`를 sha로 해석해 저장하며, 이후 라운드는 이를 재사용하고 다른 sha를 주면 저장된 sha를 알리며 종료 코드 2로 끝납니다. diff `<base>..HEAD`가 추가하거나 바꾸지 않은 줄에 대한 지적 사항은 `preexisting: true`로 저장되며, `emet gate`는 이를 차단으로 세지 않습니다.
- `--findings <file>`: 지적 사항은 선택 필드 `s: "S<n>"`(관련된 요구 사항), `userOption: "S<n>"`, `agreement: "both"` 또는 `"single"`을 받습니다. `userOption` 지적 사항은 `(user option)` 요구 사항과 모순되는 것으로, 이미 존재하던 것이라도 항상 차단이며 `gate.onHold: fix-and-continue`에서는 `next: fix-findings`로 보류합니다. 문자열이 아닌 `userOption`은 종료 코드 2로 끝납니다.
- `--coverage <file or -> [--expect S1,S3]`: Coverage verdicts `{s, verdict, test:{file,name}}`의 JSON 배열(`verdict`: `met`, `partial`, `unmet`)을 원장의 `coverage`로 저장해 이전 것을 대체하며, 리뷰 라운드를 소비하지 않습니다. `test`가 없거나, 그 파일이 없거나 `test.name`을 담고 있지 않은 `met`마다, 그리고 verdict가 없는 `--expect` S#마다 `VG-S<n>` 지적 사항(major, `patch`)을 엽니다. `VG-` 지적 사항은 이후의 `--coverage`가 더 이상 그것을 만들지 않거나 recheck 판정이 해결할 때만 닫히며, `--findings` 라운드에 없다는 이유로는 닫히지 않습니다. `{coverage, open}`을 출력하고 열린 지적 사항이 있는 동안 종료 코드 1로 끝나며, 테스트는 실행하지 않습니다.
- `--merge <a.json> <b.json>`(`--ticket` 불필요): `--findings -`에 넘길 병합된 지적 사항 배열 하나를 출력합니다. 두 지적 사항은 `s`가 같거나, `file`이 같고 줄 간격이 3 이하일 때 짝이 되며, 짝은 첫 번째 파일의 `id`, 더 높은 심각도, `agreement: "both"`를 유지합니다. 짝이 없는 지적 사항은 `agreement: "single"`을 받고, 두 번째 파일에서 id가 충돌하면 `X-`를 앞에 붙입니다. `userOption` 지적 사항은 절대 버리지 않습니다.
- `--recheck --verdicts <file>`: 수정 라운드를 끝냅니다. 시작 시점에 열려 있던 지적 사항만 평가되고, 지적 사항은 판정을 통해서만 `resolved`가 되며, recheck는 `budgets.fixRounds`에 포함됩니다(소진되면 상한을 명시하며 종료 코드 1).
- `--escalate`: 다음 모델 티어로 넘어갑니다.
- `--rule`과 `--rulings`: 보고서와 PR 본문에 들어갈 "내가 내린 판정"을 기록하고 나열합니다.

### `emet gate`

병합 또는 체인: `emet gate <ticket> --tier … --ci … --integration …`은 `merge`, `hold`, `chain`, `stop`, `defer` 중 하나를 이유와 함께 JSON으로 출력합니다. verify 기록, 열린 지적 사항, 위험 티어, CI, 통합 스위트, 예산을 읽습니다. `hold`에는 `next`가 포함됩니다: `fix-findings`, `rerun-failed-specs`, `rerun-ci`, `report-infrastructure`. [`gate`](configuration.md#gate)를 참고하세요.

- `--no-record`: 결정을 저널에 기록하지 않습니다.

웨이브의 브랜치들이 함께 병합된 뒤에는 통합 브랜치에서 `commands.fullSuite`가 한 번 실행됩니다. 실패하면 PR과 `autoChain`이 차단됩니다. 게이트는 그 결과를 `--integration`으로 받습니다. 게이트가 읽는 예산은 [`budgets`](configuration.md#budgets)를 참고하세요.

## 종료 코드

종료 코드는 모든 하위 명령에서 같은 의미를 가집니다.

| 코드 | 의미                                                                                      |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | 정상.                                                                                     |
| `1`  | 조치가 필요한 지적이 있습니다.                                                            |
| `2`  | 설정 또는 사용법 오류로, 도구가 실제로 실행되지 않았습니다. 알 수 없는 명령도 포함합니다. |
| `3`  | 내부 오류.                                                                                |

알 수 없는 플래그도 `2`로 종료하며 해당 플래그를 알려 줍니다. Ctrl-C는 `130`으로 종료합니다.

## 전역 플래그

모든 명령이 이 플래그를 받습니다. 각 명령 고유의 플래그는 `emet <command> --help`로 확인할 수 있습니다.

| 플래그       | 효과                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `--json`     | `--help`와 `--version`을 포함해 envelope `{ok, data, error: {code, message, fix}}` 하나를 stdout에 출력합니다. |
| `--no-color` | ANSI 색상을 끕니다. 색상은 `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`, 출력이 TTY인지 여부도 따릅니다.             |
| `--verbose`  | 예기치 않은 오류의 스택을 출력합니다. 지정하지 않으면 최상위 catch가 한 줄짜리 오류를 출력합니다.              |
| `--help`     | 명령의 사용법을 출력합니다.                                                                                    |

`emet --version`은 버전을 출력하고, `emet --version --json`은 `{"ok": true, "data": {"version": ...}, "error": null}`을 출력합니다. `--json`에서 실패한 명령은 평소의 종료 코드로 종료하며 `ok: false`와 함께 `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range`, `exit-<n>` 중 하나의 오류 `code`를 출력합니다. 명령이 stdout에 출력한 내용은 envelope의 `data`가 됩니다.

TTY에서는 더 새로운 릴리스가 알려져 있으면 `emet`이 stderr에 한 줄짜리 알림을 출력합니다. 하루에 최대 한 번만 확인하고, 결과를 캐시하며, 네트워크를 기다리지 않고, `--json`이거나 TTY가 아니면 아무것도 출력하지 않습니다.

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
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0`은 `emet self update --auto`를 끕니다. 네트워크 호출 없이 종료 코드 0으로 끝납니다. `emet self update --auto off`와 같습니다.                                     |
| `EMET_AGENT_HOST`             | `codex`로 설정하면 `emet guard`가 Codex 훅 입력을 읽습니다. Codex 훅이 설정하며, Claude Code에서는 설정하지 않은 채로 두세요.                                                         |

`auto` 상한은 `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`입니다. 예전 `FORGE_*` 이름도 여전히 읽으며, 둘 다 설정되어 있으면 `EMET_*`가 우선합니다.
