---
title: 새로운 소식
description: emet 릴리스 노트. 각 버전에서 무엇이 바뀌었는지 정리합니다.
seoTitle: "emet 새로운 소식: 릴리스 노트"
sourceHash: adecd188f36bb789
---

## 0.22.0

2026-11-24

### 추가됨

- `emet` 바이너리가 설치 트리(명령, 에이전트, 레퍼런스 프롬프트, 훅, Codex 스킬, 플러그인 매니페스트)를 내장합니다. 빌드 시점에 생성되고 `bun run check`가 드리프트를 검사하므로, 컴파일된 바이너리에는 체크아웃이 필요 없습니다.
- `emet self install [latest|X.Y.Z] [--dry-run] [--from <checkout>] [--force]`는 독립 실행형 바이너리를 `~/.local/share/emet/versions/<v>/`에 설치하고 `~/.local/bin/emet` 심볼릭 링크를 만들며, Claude Code 파일을 쓰고 백업 후 emet 훅을 `~/.claude/settings.json`에 병합합니다. 다른 훅은 건드리지 않습니다. emet 플러그인이 설치되어 있으면 `--force`를 지정하지 않는 한 거부합니다. `--from`은 Bun 소스 설치를 재현합니다.
- `emet self install`의 Codex 어댑터는 emet 스킬을 `~/.agents/skills`에 쓰고 내장된 훅을 `$CODEX_HOME/hooks.json`에 추가하며, `config.toml`은 절대 쓰지 않고 한 번만 필요한 `/hooks` 신뢰 단계를 출력합니다. Codex worker 오버레이는 독립 실행형 설치를 감지하면 emet 플러그인 테이블을 생략합니다.
- `emet self update [latest|X.Y.Z]`와 `emet self update --auto`는 릴리스를 내려받아 `SHA256SUMS`(`gh`가 있으면 증명도)를 검증하고 스테이징합니다. 교체는 worker 슬롯을 점유한 것이 하나도 없을 때까지 기다립니다. `--auto`는 `SessionStart` 훅에서 하루에 최대 한 번 실행됩니다.
- 각 릴리스에 `install.sh`로 첨부되는 `scripts/install-remote.sh`는 바이너리를 내려받고 체크섬을 검증한 뒤 `emet self install`을 실행합니다: `curl -fsSL https://emet.andryore.dev/install.sh | sh`.
- `emet doctor`는 독립 실행형 설치와 플러그인이 공존할 때, 설치된 파일이 내장 트리와 어긋날 때, Codex 훅에 `trusted_hash` 항목이 없을 때, 업데이트가 대기 중이거나 자동 업데이트가 꺼져 있을 때 경고합니다.
- `docs/reference/stability.md`가 게시되었고, `docs/specs/translations.md`가 새로운 라이빙 spec으로 추가되었습니다.

### 변경됨

- 문서가 시작하기, 개념, 하우투, 레퍼런스, 도움말의 다섯 그룹으로 재구성되었으며, 열 개 로캘 모두에 적용됩니다. 이번 릴리스 이전에 게시된 모든 경로는 새 경로로 리디렉션되고, `/docs/`는 `/docs/start/overview/`로 리디렉션됩니다.
- `start/overview`, `start/install`, `start/first-run`에만 설치 안내가 있습니다. 독립 실행형 설치가 먼저 나오고 플러그인은 선택 사항으로 표시됩니다.
- 개념 페이지는 설정 표 없이 주제를 설명하고, `concepts/landing`은 spec이 기본적으로 pull request 하나로 랜딩한다고 설명하며, `concepts/architecture`는 `emet/src`의 테스트가 아닌 모든 모듈을 나열합니다. 하우투 페이지는 사전 요건과 결과 확인이 있는 작업 단계이고, `reference/cli`는 명령마다 제목이 하나씩 있습니다.
- Website 홈은 spec당 pull request 하나를 보여 주고, 빠른 모드, 메모리, 이중 리뷰, 어텐션 알림, 되돌릴 수 있는 설치를 다룹니다.
- `emet uninstall`은 독립 실행형 산출물도 제거합니다: 버전 디렉터리, 심볼릭 링크, 설치 상태 파일, Codex 스킬과 훅, 두 훅 파일에 있는 모든 emet 훅 명령입니다. 편집된 파일과 다른 훅은 유지됩니다.
- `whats-new`를 제외한 게시된 모든 페이지는 아홉 개 로캘 각각에 최신 번역이 있으며, 새 `reference/stability` 페이지도 포함됩니다.

### 제거됨

- `install.sh`가 없어졌습니다. `emet self install`과 `curl` 명령이 이를 대체하며, 의존성 검사와 doctor 해결 안내도 이쪽을 가리킵니다.

## 0.21.0

2026-11-23

### 추가됨

- `emet setup --dry-run`(`--with`, `--yes`, `--json`과 함께 사용 가능)은 선택한 각 항목의 계획 단계 또는 `already-present`를 출력하고 아무것도 변경하지 않습니다. 명령 실행, 파일 쓰기, 원장 항목 쓰기가 모두 없습니다.
- `emet setup`은 결과가 `installed`인 모든 항목을 상태 디렉터리의 `setup-ledger.json`인 설정 원장에, 되돌리는 데 필요한 실행 취소 기록과 함께 남깁니다. 원장 쓰기는 원자적이며, 형식이 잘못된 원장은 해당 경로를 알려 주는 오류가 됩니다.
- `emet setup --restore <id>`는 `claude-settings`(이전 `model`과 emet이 추가한 deny 규칙, 타임스탬프 백업을 만든 뒤) 또는 `firecrawl-local`(이전 사용자 범위 MCP 항목)을 되돌립니다. 그 밖의 id는 종료 코드 2로 끝나고, 원장 항목이 없는 id는 종료 코드 1로 끝납니다.
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]`은 `install.sh` 설치를 제거합니다. 대상은 해시가 아직 일치하는 매니페스트 파일, shim, `~/.claude/settings.json`의 모든 `emet guard` 훅(타임스탬프 백업 후), 그리고 설정 원장의 추가 항목입니다. 편집된 파일은 유지되고 목록으로 표시됩니다. brew, bun, cargo 전역 설치의 경우 제거 명령을 출력할 뿐 실행하지는 않습니다.
- `./install.sh --uninstall [flags]`는 `emet uninstall`을 실행합니다.
- `docs/reference/cli.md`와 `README.md`에 설정 원장, `--dry-run`, `--restore`, `emet uninstall`이 9개 로캘 모두에 문서화되었습니다.

## 0.20.0

2026-11-22

### 추가됨

- `emet guard`는 emet이 소유한 세션의 상태가 `working`, `idle`, `needs-decision`, `ended` 사이에서 바뀔 때 `session.attention` 저널 이벤트 `{sessionId, state, from, trigger}`를 기록합니다. 이벤트는 상태가 해당 세션에 마지막으로 기록된 상태와 다를 때만 추가됩니다. 저널에는 알림 텍스트, 프롬프트, 도구 입력을 저장하지 않으며, 기록이 guard의 판정, stdout, 종료 코드를 바꾸는 일은 없습니다.
- `hooks/hooks.json`과 `install.sh`는 `Notification`, `PermissionRequest`, `SessionEnd`, `UserPromptSubmit` 훅 이벤트를 `emet guard --event <Event>`에 연결합니다. `install.sh`는 계속 멱등성을 유지합니다. `codex/hooks.json`은 바뀌지 않습니다.
- `emet status` JSON에 `sessions: [{sessionId, state, blocked, since, runId}]`가 추가되었습니다. 저장소의 최근 24시간 동안 각 세션의 최신 상태이며 `ended`는 제외됩니다. 차단된 세션이 있으면 전체 상태가 `needs-decision`이 되고, 요약 줄과 `--brief`에 해당 세션이 표시됩니다.
- `emet fleet status [--json]`은 전역 저널에서 저장소별 최신 세션 상태를 차단된 저장소부터 출력합니다.
- `needs-decision`으로 전환될 때 emet은 알림을 한 번만 보냅니다. Orca에 연결할 수 있으면 저장소의 Orca 워크트리에 읽지 않음 표시와 댓글을 남기고, 그렇지 않으면 PATH에 `notify-send`가 있을 때 이를 사용합니다. `attention.alert`(불리언, 기본값 `true`)가 설정 스키마에 추가되었으며 이를 통해 알림을 끌 수 있습니다.
- `docs/reference/cli.md`, `docs/reference/configuration.md`, `docs/guide/fleet.md`에 세션 어텐션 기능을 문서화했으며, 아홉 개 로캘 모두에 적용됩니다.

## 0.19.0

2026-11-22

### 추가됨

- `emet memory search --json <query> [--limit <n>]`와 `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>`은 Engram의 Lessons를 읽고 씁니다. `search`는 토픽 키가 `emet/<repo>/lessons/`로 시작하는 노트만 남겨 전체 내용을 출력하고, `save`는 stdin으로 받은 1~5개의 글머리 기호를 spec 또는 quick run의 노트에 run마다 한 섹션씩 추가합니다. 둘 다 JSON 객체 하나를 출력하며, Engram 문제는 항상 exit 0으로, 잘못된 사용만 exit 2로 종료합니다.
- `memory.enabled`(`auto` 또는 `off`, 기본값 `auto`)가 설정 스키마에 추가됩니다. `off`는 `engram`을 절대 실행하지 않습니다.
- Phase 1은 첫 인터뷰 라운드 전에 메모리에서 이전 Lessons를 검색하고, 관련 있는 항목을 계획 파일의 `## Prior lessons` 아래에 기록합니다. wave와 quick 인계는 최종 보고서 전에 해당 run의 Lessons를 저장합니다. `--draft`는 아무것도 저장하지 않습니다.
- `docs/reference/cli.md`와 `docs/reference/configuration.md`에 `emet memory`와 `memory.enabled`를 문서화했습니다(9개 언어 모두).

### 변경됨

- Codex 빌드는 생성된 reference에 `mcp__engram`이 있으면 거부하므로, Engram 도구 이름이 Codex 플러그인에 도달하지 않습니다.
- `/emet:run` 프롬프트에 위의 메모리 단계가 추가됩니다. PATH에 `engram`이 없거나 `memory.enabled: "off"`이면 각 단계는 한 줄 메모가 되고 run은 0.18.0처럼 계속됩니다.

## 0.18.0

2026-11-22

### 추가됨

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]`는 Coverage verdicts를 ledger에 저장합니다. 테스트가 없거나 작업 트리에서 찾을 수 없는 `met` 판정과, 판정이 없는 기대 S#는 각각 `VG-S<n>` finding을 엽니다.
- `emet review --base <ref>`는 첫 라운드에서 리뷰 기준을 저장하고, wave가 건드리지 않은 줄의 finding을 `preexisting`으로 표시합니다. `emet gate`는 기존 finding을 차단 항목으로 세지 않습니다.
- finding은 선택 필드 `s`, `userOption`, `agreement`를 받습니다. `userOption`이 있는 열린 finding은 모든 tier와 severity에서 차단하며, gate는 `hold`와 `next: "fix-findings"`로 응답합니다. Phase 2는 사용자가 고른 옵션에서 나온 S#를 `(user option)`으로 적습니다.
- `emet review --merge <a.json> <b.json>`은 두 finding 배열을 하나로 병합합니다. `s`가 같거나 `file`이 같고 줄 간격이 3줄 이하인 finding은 짝지어지며 `agreement: "both"` 또는 `"single"`이 붙습니다.
- `emet assess`는 `dualReview: {run, reason}`을 출력하고, `review.dual`(`auto` 또는 `off`, 기본값 `auto`)이 설정 스키마에 추가됩니다. `codex`가 PATH에 있는 Claude 호스트에서 `high` wave는 Dual review를 실행합니다. `emet:emet-reviewer`와 `emet review-run --tier high --coverage-out <file>`을 병렬로 실행한 뒤 `emet review --merge`를 수행합니다.
- `emet review-run --coverage-out <file>`은 Codex 리뷰어의 Coverage verdicts를 기록하며, 출력 스키마는 null 가능한 `s`와 `userOption`을 받습니다.
- `docs/reference/cli.md`와 `docs/reference/configuration.md`에 리뷰 변경 사항을 문서화했습니다(9개 언어 모두).

### 변경됨

- 리뷰어 프롬프트와 `agents/emet-reviewer.md`는 산문 형태의 `S<n>: met | partial | unmet` 줄 대신 Coverage verdicts 파일 `.emet/coverage-<run>.json`을 요구합니다. Phase 8은 `emet review --coverage`로 판정을 기록하고, 기존 finding은 수정하지 않고 wave 보고서에 나열합니다.
- `--base`, `--coverage`, `--merge`, Dual review를 쓰지 않으면 모든 명령은 0.17.0과 동일하게 동작합니다.

## 0.17.0

2026-11-22

### 추가됨

- `/emet:run --quick <변경>`은 티켓 하나에 들어가는 변경에 대해 Quick run을 실행합니다. 인터뷰 한 차례, folded 티켓 하나가 있는 spec, 승인 한 번, worker 하나, 리뷰, 그리고 그 단일 Wave의 Landing을 pull request(또는 로컬 merge)로 수행하며 `emet chain`은 사용하지 않습니다. 변경이 화면을 건드리거나 티켓 하나에 들어가지 않으면 승인 전에 멈추고 `--quick` 없는 `/emet:run`을 권장하며, `--draft` 또는 `--dispatch`와 함께 쓰면 거부됩니다. `--no-promote`는 허용됩니다. 단계는 새로운 `emet/reference/phases-quick.md`에 있습니다. ADR-0039를 참고하세요.
- `emet assess --quick`은 기존 JSON에 `"quickRejected"`를 더해 출력하고, 등급이 `high`이면 종료 코드 `1`로 끝납니다. Quick run은 이를 Gate의 Stop으로 처리합니다. auto-merge는 하지 않고, pull request는 열린 채로 남으며, 최종 보고서에 고위험 사유가 적힙니다. `--quick` 없이는 출력과 종료 코드가 그대로입니다.
- `emet approve --quick`은 `approval.json`에 `"mode": "quick"`을 기록합니다. 이 변경 이전에 기록된 레코드도 계속 `--check`를 통과합니다.
- `resolveLandingUnit(config, runId, root)`는 `--quick`으로 승인된 실행에는 `wave`를, 그 외에는 `config.landing.unit`을 반환합니다. `emet landed`, `emet status`, `emet preflight`가 이 함수를 통해 landing 단위를 읽으므로 Quick run은 spec 브랜치를 기대하지 않습니다.
- 계획에 티켓이 없으면 `emet validate`가 `no-tickets` 오류를 보고하고 folded 티켓 하나를 작성하라고 안내합니다.
- `docs/reference/cli.md`와 `docs/guide/trackers-and-landing.md`에 Quick run을 문서화했으며, 아홉 개 언어 모두에 적용됩니다.

### 변경됨

- `phases-1-5.md`의 빠른 경로 문장은 이제 기준 미만의 요청에 대해 티켓을 쓰지 않는 대신 `folded`로 표시된 티켓 하나를 작성하라고 안내합니다.
- `--run`이 없으면 `emet preflight --approval <run>`은 해당 실행의 승인 레코드에서 landing 단위를 결정합니다.

## 0.16.0

2026-11-21

### 추가됨

- 라이빙 spec(기본값은 꺼짐). `specs.enabled: true`이면 spec의 마지막 wave에서 코디네이터가 spec의 요구 사항 델타 `ADDED`/`MODIFIED`/`REMOVED`를 작성하고, 해당 wave의 리뷰 전에 통합 브랜치에서 `emet spec-merge --spec <id>`를 한 번 실행하며, 갱신된 `docs/specs/<area>.md`를 커밋합니다. 따라서 변경 사항은 같은 pull request에서 리뷰되고 랜딩합니다. 새 레퍼런스 `living-specs.md`가 델타 형식과 재시도 규칙을 설명합니다. ADR-0038을 참고하세요.
- 구성과 두 스키마 사본에 `specs.enabled`(기본값 `false`)가 추가됩니다. `emet init`은 `"specs": { "dir": "docs/specs", "enabled": false }`를 작성합니다.
- `emet doctor`는 `specs.enabled`가 `true`일 때만, `specs.dir`이 gitignore되어 있거나 파일이면 경고합니다. `specs.dir`이 없는 것은 경고가 아닙니다.
- `emet spec-merge --spec <id> --deltas-dir`는 공유 델타 디렉터리 `<git common dir>/.emet/runs/<id>/spec-deltas`를 만들어 출력하고, 병합하지 않고 종료 코드 `0`으로 끝납니다.
- `landing.specMergeMethod`는 `merge`(기본값), `squash`, `rebase`를 받으므로, squash 머지만 허용하는 트렁크에도 spec을 랜딩할 수 있습니다. 저장소 설정이나 트렁크 ruleset이 구성된 방식을 허용하지 않으면 `emet doctor`가 경고합니다. ADR-0037을 참고하세요.
- `bun run check:codex`는 생성된 `codex/` 디렉터리에 소스가 없는 파일이 있으면 실패합니다.

### 변경됨

- `specs.enabled`가 꺼져 있으면 `emet spec-merge`는 `specs.enabled is false; nothing merged`를 출력하고 종료 코드 `0`으로 끝납니다. 델타는 git common dir 아래의 공유 실행 디렉터리에서 읽고, 없으면 체크아웃별 `.emet/runs/<id>/spec-deltas/`로 대체합니다.
- 8단계 프롬프트는 wave나 spec이 랜딩된 뒤 더 이상 `emet spec-merge`를 실행하지 않습니다. 대신 `phases-8-review.md`가 마지막 wave에서 `living-specs.md`를 불러옵니다.
- `emet spec-branch land`는 `emet ci`와 같은 폴러로 PR의 체크를 기다리고, 아직 체크가 없는 PR도 계속 폴링하며, `landing.specMergeMethod`로 병합합니다.

### 수정됨

- `emet spec-branch land`는 GitHub가 체크를 하나도 등록하기 전에는 더 이상 병합하지 않습니다.
- `emet setup`은 Claude 플러그인을 최대 세 번이 아니라 한 번만 나열하며, 조용한 프로브는 멈추지 않고 시간 초과됩니다.
- `emet doctor`는 설치된 플러그인을 실행마다 한 번만 나열합니다.
- `bun run lint`와 `bun run fix`는 먼저 사이트의 Astro 타입을 생성하므로 새 체크아웃에서도 통과합니다.

## 0.15.0

2026-11-21

### 변경됨

- `landing.unit`의 기본값은 `spec`입니다. spec의 wave는 `emet spec-branch`로 `spec/<id>` 브랜치에 통합되고, wave마다 pull request를 하나씩 만드는 대신 spec이 한 번만(pull request 하나, 또는 `landing.mode: merge`에서는 로컬 머지 한 번으로) 랜딩합니다. 이전 동작을 유지하려면 `"landing": { "unit": "wave" }`를 설정하세요. `spec` 모드는 Claude Code 설정에 `worktree.baseRef: "head"`가 필요합니다. ADR-0037을 참고하세요.
- 저널에 종류 `spec.integrate`, `spec.land`, `spec.abandon`이 추가되고, `emet status`에 `specBranch`가 추가됩니다.

## 0.14.5

2026-11-21

### 추가됨

- `emet handoff --check`는 워커의 인계 노트에 있는 `skills:` 섹션(`none` 또는 `loaded: a, b; missing: c`)을 파싱합니다. `state`가 `done`이면 필수입니다. `--expect-skills a,b`는 두 목록 어디에도 없는 지정 스킬마다 검사를 실패시키고, 누락된 스킬을 출력합니다.
- 디스패치 레코드에 선택적 `skills` 배열이 추가되었고, `emet verify`는 이를 `--expect-skills`로 `emet handoff --check`에 전달합니다. `skills`가 없는 레코드도 계속 파싱됩니다.
- ADR-0036은 티켓이 단락을 명시하면 설치된 프롬프트의 문구를 바꿀 수 있게 하며, 같은 풀 리퀘스트에서 바이트 상한을 올립니다.

### 변경됨

- 8단계 프롬프트를 `phases-8-review.md`와 `phases-8-landing.md`로 나눴습니다. `install.sh`는 이전 `phases-8-closeout.md`를 폐기합니다. 수정된 사본이나 매니페스트 이전 사본은 `phases-8-closeout.md.retired`로 옮기고, 수정되지 않은 사본은 삭제합니다.
- 워커 프롬프트는 최종 인계 전에 `skills:` 줄을 쓰도록 안내합니다.
- 아키텍처 페이지, CLI 레퍼런스와 그 번역 9종이 8단계의 두 파일과 `--expect-skills`를 설명합니다.

## 0.14.4

2026-11-20

### 추가됨

- Codex 호스트에서 `emet doctor`는 emet 플러그인이 `$CODEX_HOME/config.toml`에서 활성화되어 있지만 Codex가 해당 훅을 하나도 신뢰하지 않아 emet 가드가 실행되지 않을 때 경고합니다. 이 경고는 종료 코드를 바꾸지 않습니다.

### 수정됨

- 플러그인 버전의 릴리스 에셋을 아직 다운로드할 수 없으면 `bin/emet`은 `emet guard`뿐 아니라 모든 명령에서 가장 최신 캐시 바이너리를 실행하고, 릴리스가 아직 게시 중일 수 있다는 알림을 한 번 출력합니다. `EMET_PREFETCH=1`일 때는 알림만 출력하고 바이너리를 실행하지 않은 채 `0`으로 종료합니다. 체크섬 불일치나 `SHA256SUMS` 누락 시에는 이전처럼 절대 대체 실행하지 않으며, 다운로드 임시 디렉터리는 대체 실행 전에 제거됩니다.

## 0.14.3

2026-11-20

### 추가됨

- `emet fleet launch --dry-run`은 준비 상태 점검을 실행하고 세션을 시작하지 않은 채 각 저장소에 대해 `would launch <name>`을 출력합니다.

### 수정됨

- `emet migrate`는 `.emet/` 사본과 내용이 다른, 추적되지 않는 `.forge/`의 이전 실행 파일을 삭제하고 `.emet/` 쪽을 유지하므로 로그가 남아 있는 저장소에서도 끝까지 완료됩니다. 해결할 수 없는 충돌은 수동 단계와 함께 모두 나열되며, 저장소 안에서 git이 실패하면 파일을 삭제하지 않고 충돌로 처리합니다.
- 테스트 프리로드는 실행이 끝나면 자신의 `emet-test-state-*` 디렉터리를 제거하므로 `bun test`가 실행마다 임시 디렉터리를 남기지 않습니다.

## 0.14.2

2026-11-20

### 수정됨

- `emet promote`는 동기화 풀 리퀘스트를 즉시 병합하는 대신 해당 체크를 기다리고, 통과한 경우에만 병합합니다. 실패하거나 시간 초과되거나 거부된 동기화 풀 리퀘스트는 promote를 실패시키지 않고 열린 상태로 남으며, 결과와 저널 이벤트에 `syncMerged`와 `syncReason`이 포함됩니다.

## 0.14.1

2026-11-20

### 추가됨

- `emet tracker close`는 GitHub 티켓의 마지막 하위 이슈가 닫히면 상위 스펙 이슈를 닫고, 각 스펙을 새 `specs` 필드에 보고합니다. 스펙 읽기 또는 닫기에 실패하면 `1`로 종료합니다.
- GitHub의 하위 이슈 요약이 아직 반영되지 않았더라도 스펙은 닫힙니다. 같은 호출에서 닫힌 티켓을 포함해 스펙의 하위 이슈를 하나씩 셉니다.

## 0.14.0

2026-11-20

### 추가됨

- `emet init`은 Prisma 스키마(`prisma/schema.prisma` 또는 `prisma/schema/`)나 Drizzle 마이그레이션 폴더를 찾으면 `schema.ownedPaths`를 설정하고, 스키마 소유권 `TODO(emet):` 마커를 제거합니다.
- `agent-browser` 설정 항목은 `~/.agent-browser/config.json`(`contentBoundaries`와 `maxOutput`)이 없으면 작성하고, 설치 후 `agent-browser doctor`를 실행합니다. ADR-0035를 참고하세요.
- 호스트가 권한 없는 사용자 네임스페이스를 제한하는 경우, `emet setup`은 `agent-browser`가 내려받은 Chrome용 AppArmor 프로필과 이를 로드하는 `sudo` 명령을 출력합니다. `sudo`를 직접 실행하지는 않습니다.

### 변경됨

- `firecrawl-local` 설정 항목은 MCP 서버를 `off` 대신 `FIRECRAWL_CLOUD=search`로 등록하고, 이전 등록을 교체하며, 가장 최신 `agent-browser` Chrome을 `FIRECRAWL_CHROME_PATH`로 전달합니다. ADR-0035를 참고하세요.

### 수정됨

- `emet setup`은 `firecrawl-local` MCP 서버를 서버 이름을 맨 앞에 두고 등록하므로 등록이 올바르게 파싱됩니다.
- `emet --help`는 레지스트리의 모든 명령(setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run)을 나열합니다.
- 테스트가 더 이상 `~/.local/state/emet` 아래의 실제 저널에 쓰지 않습니다.

## 0.13.0

2026-11-20

### 추가됨

- `emet setup`이 `context7`과 `firecrawl-local` 항목을 제공합니다(둘 다 기본값은 꺼짐). `context7`은 `ctx7` CLI와 그 `find-docs` 스킬을 설치합니다. `firecrawl-local`은 `cargo`로 Firecrawl Local을 빌드하고 로컬 전용 MCP 서버(`FIRECRAWL_CLOUD=off`, `--public-only`)로 등록합니다. ADR-0034를 참조하세요.
- `emet review-run --browser-verify true|false`가 브라우저 축을 Codex 리뷰어에게 전달합니다.
- `emet.config.json`의 `validate.coupledSurfaces`와 `emet validate`의 `coupled-surface-split` 오류가 페이지와 그 번역을 같은 웨이브에 묶어 둡니다. ADR-0033을 참조하세요.

## 0.12.0

2026-11-20

### 추가됨

- `emet.config.json`의 `verify.browser`(`startCommand`, `url`, 선택 사항인 `paths`)를 설정하면 해당 저장소에서 `agent-browser`로 UI 변경 사항을 브라우저에서 검증합니다. 구성 스키마와 파서가 모든 필드를 검증합니다.
- `emet assess`가 `browserVerify: { run, reason }`을 출력합니다. 브라우저 축은 웨이브에 리뷰어가 있고, `verify.browser`가 구성되어 있으며, `agent-browser`가 PATH에 있고, 변경된 경로가 `paths`와 일치할 때만 실행됩니다.
- `emet setup`에 `agent-browser` 항목(기본값은 꺼짐)이 추가되어 최신 릴리스와 해당 브라우저를 설치합니다.
- `verify.browser`를 구성한 저장소에서는 `emet doctor`가 agent-browser에 대한 선택적 결과를 보고합니다. 바이너리가 없거나 `agent-browser doctor`가 실패해도 메모 또는 경고일 뿐이며 종료 코드는 바뀌지 않습니다.
- 리뷰어 프롬프트에 브라우저 축이 추가되며, `browserVerify.run`이 true일 때만 채워집니다. 워커 프롬프트에도 브라우저 확인을 위한 선택적 한 줄이 추가됩니다. ADR-0032를 참고하세요.

## 0.11.1

2026-11-19

### 수정됨

- 네이티브 Windows(Git Bash)와 지원되지 않는 모든 OS 또는 아키텍처에서 `bin/emet`이 실패하는 대신 종료 코드 0으로 끝나므로, PreToolUse 가드가 더 이상 모든 도구 호출을 차단하지 않습니다. 세션 시작 시 프리페치만 안내를 한 번 출력합니다.
- `install.sh`는 아무것도 쓰기 전에 `MINGW*`, `MSYS*`, `CYGWIN*`에서의 실행을 거부합니다.
- Codex 훅에 `commandWindows` 오버라이드가 포함되어, Windows(PowerShell)의 Codex가 더 이상 모든 이벤트마다 오류를 내지 않습니다.

## 0.11.0

2026-11-19

### 추가됨

- `emet whats-new`는 업데이트 후 emet을 처음 실행할 때 릴리스 노트 링크가 담긴 한 줄 알림을 출력한 다음 실행 중인 버전을 기록합니다. `--hook`을 사용하면 세션 훅용 `systemMessage` JSON 객체로 해당 줄을 출력합니다.

## 0.10.0

2026-11-19

### 추가됨

- `handoff.afterSpec`이 `{ paths?, mode }` 규칙의 순서 있는 목록을 받아들여, CLI와 웹사이트가 함께 있는 저장소에서 CLI는 릴리스하고 웹사이트는 프로모트할 수 있습니다. 모드는 `develop`을 프로모트할 때 `main`으로 들어가는 경로를 기준으로 선택됩니다.
- `deploy.check.paths`는 나열된 glob을 건드린 프로모트로만 배포 확인을 제한합니다.
- `emet promote`가 `rule`과 `reason`을 출력하고 저널에 기록하며, `deployCheck: { run, reason }`을 출력합니다.

### 변경됨

- 배포 확인은 더 이상 `afterSpec`에 의존하지 않습니다. 트렁크가 `main`이면 마지막 wave가 깔끔하게 끝난 뒤, `develop`이면 프로모트가 병합된 뒤 실행됩니다. 코디네이터는 `afterSpec`이 `none`일 때도 모든 spec 뒤에 `emet promote`를 실행합니다.

## 0.9.1

2026-11-19

### 수정됨

- `emet setup`이 `--data-dir`을 받아들여, 플러그인의 SessionStart 훅이 더 이상 `unknown flag --data-dir`로 실패하지 않습니다.

## 0.9.0

2026-11-19

### 추가됨

- `emet gate`가 수정 후 계속 진행하는 정책을 적용합니다. 보류된 wave는 지적 사항이 해결되거나 `budgets.fixRounds`(기본값 2)가 소진될 때까지 수정 라운드를 실행한 뒤 멈춥니다. `gate.onHold`로 `fix-and-continue`(기본값) 또는 `stop`을 선택합니다. `emet review --recheck`는 리뷰어의 판정을 통해서만 지적 사항을 해결합니다.
- `emet ci --wait`는 풀 리퀘스트의 검사를 폴링하고, 불안정한 작업을 다시 실행하며, `pass`, `fail`, `env-fault`, `timeout` 중 하나를 보고합니다. `emet tracker close`는 GitHub 티켓을 멱등하게 닫고, `emet chain`은 gate, readiness, launch, verify를 한 단계로 실행합니다.
- 이벤트 저널이 gate 결정, 개입, 실행, 티켓 닫기, 정리를 기록하며 크기에 따라 순환됩니다. `emet insights`가 이를 요약하고(`--mark-baseline`으로 기준선 초기화), `emet run current`가 활성 spec과 wave를 보여 주며, `emet status --brief`가 상태를 한 줄로 출력합니다.
- 설정 키 `language.conversation` 및 `language.artifacts`.
- 설정 키 `handoff.afterSpec`(`release`, `promote`, `none`. `emet init`이 감지하거나 `emet init --after-spec`으로 설정), `deploy.check`, `interview.research`.
- `emet promote`는 마지막 wave가 유휴 상태가 되면 `develop`에서 `main`으로 풀 리퀘스트를 열고, 검사가 통과하면 병합하며, `develop`이 뒤처지면 `main`을 다시 동기화합니다. `--no-promote`는 spec을 모든 세션에서 보류합니다.
- `emet deploy-check`는 배포 확인 명령을 재시도하고 멈춘 명령을 종료합니다.
- `emet fleet list | set | launch`는 여러 저장소에 걸쳐 spec을 실행합니다.
- `emet setup`과 `/emet:setup`은 Claude 설정을 백업한 뒤 카탈로그에서 선택 사항 구성 요소를 설치합니다. SessionStart 훅이 안내를 한 번만 표시하며, `install.sh`는 TTY에서 setup을 실행합니다.
- `emet doctor`와 `emet init`은 Engram을 권장하되 충족되지 않은 의존성으로 세지 않습니다.

### 변경됨

- 설치된 프롬프트와 문서가 gate 정책, `emet ci`, `emet chain`, 저널, spec 이후 단계, fleet, setup을 설명합니다. 8단계에 wave 요약과 푸시 알림이 추가되고, `emet insights`가 `/retro` 안내를 대체합니다.

### 수정됨

- `--no-promote`가 git 공통 디렉터리 아래의 마커로 유지되므로, 마지막 wave를 위한 연쇄 `/emet:run --dispatch` 세션이 더 이상 `develop`을 `main`으로 승격하지 않습니다.

## 0.8.6

2026-11-17

### 수정됨

- 릴리스 워크플로는 CI 테스트 잡과 마찬가지로 태그에서 검사를 다시 실행하기 전에 Chromium을 설치하므로, 검증이 더 이상 `tools/`의 커버리지 최소 기준에서 멈추지 않습니다. 이 때문에 v0.8.5는 태그만 만들어지고 게시되지 않았으며, 그 변경 사항은 이 버전에 포함됩니다.

## 0.8.5

2026-11-17

### 변경됨

- 커버리지 게이트는 `emet/`, `apps/site`, `tools/`에 파일별 최소 기준으로 줄 97 %와 함수 98 %를 요구하며, 근거가 있는 예외는 `tools/coverage-exceptions.ts`에 둡니다. 커버리지 매니페스트는 `emet/src`를 재귀적으로 탐색하고, `tools/`도 게이트 대상이 되며, `tools/coverage-floors.json`의 합계는 측정값으로 올라갑니다.
- PreToolUse 가드는 닫힌 방식으로 실패합니다. `bin/emet`이 emet 바이너리를 찾지 못하면 훅이 종료 코드 2로 끝나며 도구 호출을 차단하고, 복구 방법을 알려 주는 메시지를 보여 줍니다. Stop과 SubagentStop 훅은 여전히 종료 코드 1로 끝납니다.
- 플러그인 매니페스트에 작성자 이메일, 라이선스, 홈페이지, 저장소, 버그 URL이 들어가고, Codex 스킬 설명은 각 스킬을 언제 쓰는지 알려 줍니다.

### 수정됨

- `emet doctor`는 예기치 않은 오류가 새어 나오면 0 대신 종료 코드 3으로 끝납니다. 앞서 설정된 0이 아닌 종료 코드는 유지됩니다.
- `emet cleanup --all --force`는 죽은 실행의 워커 worktree와 브랜치를 회수합니다. `.claude/worktrees/` 아래의 worktree도 포함합니다. 살아 있거나 유휴 상태인 소유자와, 실행을 가리키지 않는 잠금은 계속 보호됩니다.
- 편집 가드는 `src/app/[locale]/page.tsx`처럼 문자 그대로 쓴 서피스와 일치합니다. 서피스 안의 `[`와 `]`는 더 이상 문자 클래스가 아닙니다.
- `emet preflight --post-dispatch`는 예약이나 슬롯을 아직 가진 티켓이 워커 worktree를 잃었을 때 실패하며, 재개하지 말고 다시 디스패치하라고 코디네이터에게 알려 줍니다.
- 컴파일된 `emet` 바이너리는 더 이상 현재 디렉터리의 `.env` 파일을 불러오지 않습니다.
- 웹사이트는 홈페이지의 인라인 style 속성을 없애고, 라이트 모드에서 홈 라벨에 AA 대비를 주며, 검색 버튼에 첫 렌더링부터 보이는 텍스트로 이름을 붙입니다. 문서 이미지는 `raw.githubusercontent.com` 대신 사이트 자체 오리진의 `repo-assets`에서 제공되며, `astro dev`에서도 제공됩니다.

## 0.8.4

2026-11-15

### 변경됨

- 홈페이지 헤더가 양 끝의 두 그룹으로 바뀌었습니다. 왼쪽에는 워드마크와 Docs, 오른쪽에는 검색, GitHub 스타, 테마, 언어가 있습니다. 컨트롤과 릴리스 필은 하늘 위의 반투명 유리 효과를 사용하며, 홈 헤더와 메뉴에서 중복된 새로운 소식 링크를 제거했습니다.

## 0.8.3

2026-11-15

### 수정

- `/docs/`와 각 로캘의 `/docs/`가 스타일 없는 페이지가 잠깐 보이던 meta-refresh 스텁 대신 시작하기 페이지로 301 응답을 보냅니다.

## 0.8.2

2026-11-11

### 수정됨

- `emet cleanup`이 워크트리 `<name>`이 아직 존재하는 동안에는 `worktree-<name>` 스캐폴드 브랜치를 유지하므로, 그곳에서 다른 브랜치로 작업 중인 세션이 호스트가 기대하는 브랜치를 그대로 갖습니다.

## 0.8.1

2026-11-11

### 추가됨

- `emet cleanup`이 Agent host가 남기는 `worktree-<name>` 스캐폴드 브랜치를, 어디에서도 체크아웃되어 있지 않고 트렁크가 이미 그 최신 커밋을 포함할 때 삭제합니다.

### 수정됨

- 가드가 대문자 플래그뿐 아니라 삭제 플래그와 강제 플래그를 함께 쓰는 모든 형태의 브랜치 강제 삭제를 거부합니다.

## 0.8.0

2026-11-11

### 추가됨

- `emet cleanup`이 모든 모드에서, 풀 리퀘스트가 브랜치의 최신 커밋에서 병합된 로컬 브랜치를 그 브랜치를 담고 있는 깨끗하고 잠기지 않은 에이전트 워크트리와 함께 삭제합니다. 통합, 릴리스, 수정 브랜치는 더 이상 수동 삭제를 기다리지 않습니다.
- `bun run translations:status`가 원본보다 뒤처진 Website 번역을 나열합니다.

### 변경됨

- 가드가 브랜치 강제 삭제를 거부할 때 `emet cleanup`을 안내합니다.
- 릴리스 런북이 `whats-new` 번역을 다룹니다.

## 0.7.0

2026-11-11

### 추가됨

- Website가 설정 스키마를 `https://emet.andryore.dev/schema/emet.config.schema.json` 에서 제공합니다.
- `docs/development.md`와 `docs/security.md`.
- workspace별 커버리지 하한. `bun run test`가 이를 강제합니다.

### 변경됨

- `emet init`이 로컬 경로 대신 공개 `$schema` URL을 `emet.config.json`에 기록합니다.
- 릴리스 태그는 서명되며, 태그에 해당하는 CHANGELOG 섹션이 없거나 비어 있으면 Release 워크플로가 실패합니다.
- 저장소가 andryorelabs 표준 v1을 따릅니다. 코드로 관리하는 ruleset, 커뮤니티 파일, README 구성, 표준 스크립트 이름(`format:write`, `lint:commits`)입니다.

## 0.6.1

2026-11-10

### 수정됨

- 같은 오래된 락을 동시에 회수하는 두 프로세스가 더 이상 둘 다 임계 구역에 들어가지 않습니다. claim, Mailbox, tracker, `acquireLock`이 보호된 하나의 회수 로직을 공유합니다.
- `emet tracker create-ticket`을 동시에 호출해도 더 이상 간헐적으로 실패하지 않습니다.

## 0.6.0

2026-11-10

### 추가됨

- Codex worker용 Mailbox: `emet ask`는 질문을 기록하고(`--wait`로 답변을 폴링), `emet inbox`는 열린 질문을 나열하며, `emet reply`는 질문에 답합니다. 이제 worker가 인수인계 메모로 에스컬레이션할 필요가 없습니다.
- `emet dispatch --wait`는 실행 중인 worker에게 열린 질문이 있는 동안 `question <ticket> <id>`를 출력하며, 그 worker를 정체된 것으로 분류하지 않습니다.
- `emet claims --reserve`는 티켓의 편집 대상 범위를 저장하고, 다른 실행의 범위와 겹치는 예약을 거부합니다.

### 수정됨

- `emet dispatch --wait`는 `emet results --write`가 결과를 쓰는 git-common-dir의 실행 디렉터리에서 결과를 읽습니다.

## 0.5.2

2026-11-10

### 변경됨

- 제휴 관계가 없다는 고지에 Anthropic과 함께 OpenAI도 명시했습니다.
- 홈페이지 설치 탭이 Claude Code로 표시되고, 실행 명령에 `$emet:run`을 보여 주는 Codex 탭이 생겼습니다.
- 가이드가 각 단계가 Claude Code와 Codex 중 어느 Agent host용인지 표시합니다.

### 수정됨

- Codex 호스트에서 `emet doctor`, `emet init`, `emet dependencies`, `emet preflight`가 더 이상 Claude Code 전용 안내를 하지 않습니다.
- `emet init --force`가 기존 설정의 `agentHost`와 `codex` 섹션을 유지합니다.

## 0.5.1

2026-11-10

### 변경됨

- README, 랜딩, 배너, 가이드, 공유 이미지가 Claude Code와 함께 Codex를 명시합니다.

## 0.5.0

2026-11-10

### 추가됨

- Website 홈 페이지: 그려 낸 히어로, 작동 방식, 기능, 소개, 마무리 패널, 헤더, 푸터.
  영어 문자열은 `apps/site/src/i18n/ui/en.ts`에 있습니다.
- `/docs/`의 Website 문서: 저장소 문서의 허용 목록과 이 변경 로그로 만든 Starlight
  페이지. Pagefind 검색, 사이트 페이지 또는 GitHub로의 링크 재작성, 번역이 없거나
  오래된 경우의 영어 대체 안내를 갖췄습니다.
- `docs/how-to/update-emet.md`: 플러그인을 업데이트하고 마켓플레이스 자동
  업데이트를 켜는 방법.
- Agent 호스트로서의 Codex: `emet.config.json`의 `agentHost`. `emet dispatch`와
  `emet review-run`은 각 워커와 리뷰어를 `codex exec` 프로세스로 시작합니다.
  `$emet:run`, `$emet:init`, `$emet:doctor` 스킬, Codex 플러그인 매니페스트,
  선택형 엔드투엔드 테스트(`EMET_CODEX_E2E=1`)도 추가되었습니다.
- `docs/guide/codex.md`: Website에 게시되는 Codex 가이드.

### 변경됨

- Codex의 `codex.sandbox` 기본값은 `danger-full-access`입니다(`workspace-write`도
  계속 사용할 수 있습니다). `emet dispatch`, `emet review-run`, Codex의 `emet launch`가
  이를 전달하며, Codex에서 `emet guard`는 모든 push 형태를 거부합니다.
- 실행별 Codex 오버레이는 사용자의 `config.toml`을 연결하는 대신 자체 최소
  `config.toml`을 작성합니다. 규칙은 `-C` 형태와 조정용 하위 명령을 허용하며,
  push는 계속 금지됩니다.
- Codex 워커는 pid가 아니라 `threadId`와 JSONL 경로로 식별됩니다.
- Codex 가이드에 실제 Codex 결과를 기록했습니다. 이전의 모든 `failed` 행은
  `verified`가 되었고, `unverified` 목록은 무인 감독만 남도록 줄었으며, 프로브 보고서에
  남은 후속 작업이 나열되어 있습니다.

### 수정됨

- `emet cleanup`이 병합된 소유자 없는 worktree를 회수합니다.
- Codex Agent 호스트가 기본적으로 확인되므로 `emet preflight`, `doctor`,
  `cleanup`, `status`, `usage`가 `agentHost: "codex"`를 받아들입니다.
- Codex 모델 확인은 실행 홈 또는 실제 Codex 홈에서 `models_cache.json`을 읽습니다.

## 0.4.0

2026-11-06

### 추가됨

- `emet-mascot`의 `position` 옵션(`pane`, `band`, `status`). `pane`이 기본값이며
  도킹할 수 없으면 밴드로 대체됩니다.
- README에 "Mascot (optional)" 섹션을 추가했습니다.

### 변경됨

- `emet-mascot` 프레임은 크기 조정으로 흐려지는 대신 여섯 가지 마스코트 색으로
  맞춰지므로, 터미널에서 픽셀 아트가 선명하게 보입니다.
- `emet-mascot` 0.2.0: 기본 `size`가 이제 `small`입니다.
- `docs/how-to/orca-pet.md`는 이제 `docs/how-to/mascot.md`이며, 모드와 Orca 펫을
  모두 다룹니다.

## 0.3.0

2026-11-05

### 추가됨

- 플러그인 명령 `/emet:init`과 `/emet:doctor`는 Claude Code 안에서 `emet init`과
  `emet doctor .`를 실행하고 결과를 요약합니다.
- `emet doctor`는 `~/.claude/settings.json`에서 바이너리가 더 이상 존재하지 않는
  `forge guard` 및 `emet guard` 훅에 대해 경고하고, 이를 제거하기 위한
  백업 후 `jq`를 사용하는 명령을 출력합니다. 파일을 직접 수정하지는 않습니다.
- 마스코트 기반 작업: 페이즈 파일, 펫 번들, 모드 상태 머신, 나머지 페이즈 기록기,
  래스터 프레임.
- `emet-mascot`: 프롬프트 위에 픽셀 마스코트를 표시하고 세션과 `emet` 실행의
  페이즈를 반영하는 선택 사항 플러그인입니다. 마켓플레이스에 등록되어 있으며,
  Orca 펫 사용 가이드와 ADR-0016이 함께 제공됩니다.

### 수정됨

- 플러그인이 더 이상 깨진 중복 명령 `/emet:emet`을 노출하지 않습니다.
  `commands/`는 `run.md`, `init.md`, `doctor.md`로 고정되었습니다.
- 다음 웨이브는 이제 플러그인이 등록하는 명령인 `/emet:run`으로 시작됩니다.

### 변경됨

- 리포지토리를 GitHub의 `andryorelabs` 조직으로 옮겼습니다. 릴리스 다운로드,
  README 배지, 클론 URL이 이제 `andryorelabs/emet`을 가리킵니다. 예전
  `AndryOre/emet` URL은 계속 리디렉션됩니다.
- 독립 실행형 설치에서는 플러그인에 맞춰 `/emet`이 `/emet:run`으로 이름이
  바뀝니다. `install.sh`는 이제 `commands/run.md`, `init.md`, `doctor.md`를
  `~/.claude/commands/emet/`에 설치하므로 플러그인 없이도 `/emet:run`,
  `/emet:init`, `/emet:doctor`를 사용할 수 있습니다. 예전
  `~/.claude/commands/emet.md`는 수정되지 않았다면 제거되고, 수정된 사본은
  유지되어 설치 요약에 표시됩니다.

## 0.2.0

2026-11-05

### 변경됨

- 프로젝트 이름을 claude-forge에서 emet으로 바꿨습니다. CLI는 `emet`, 명령은
  `/emet`, 에이전트는 `emet-worker`와 `emet-reviewer`이며, README에도 새 브랜드가
  반영되었습니다. 기존 설치와 리포지토리는 계속 동작합니다. 예전 이름
  (`forge.config.json`, `.forge/`, `docs/agents/forge.md`, `FORGE_*`)은 안내와
  함께 여전히 읽히며, `emet migrate`가 리포지토리를 새 이름으로 옮겨 줍니다.

### 추가됨

- `install.sh`가 Bun 없이 동작합니다. 독립 실행형 바이너리 심을
  `~/.local/bin/emet`으로 설치하고, 복사하는 프롬프트 안의 플러그인 자리표시자를
  다시 쓰며, `commands/run.md`를 `~/.claude/commands/emet.md`로 설치하고,
  `sha256sum` 대신 `shasum -a 256`을 받아들입니다.
- README에 실제 요구 사항, 두 가지 설치 방법, 그리고 `/setup-matt-pocock-skills`
  다음에 `emet init`을 실행하는 순서를 명시했습니다.
- 에이전트 가이드(`AGENTS.md`), 도메인 용어집(`GLOSSARY.md`), `docs/adr/` 아래의
  아키텍처 결정 기록.
- `.scratch/` 규약을 따르는 로컬 마크다운 트래커. `emet tracker` CLI
  (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`, `close`)와
  로컬을 인식하는 `emet validate`, `preflight`, `doctor`를 갖췄습니다.
- `landing.mode`(`pr` 또는 `merge`)와 `emet land`. 웨이브를 PR 없이 한 번의
  로컬 병합으로 랜딩합니다. `merge` 모드에서는 `emet cleanup`과 `emet status`가
  로컬 트렁크와 비교합니다.
- 독립 실행형 `emet` 바이너리, `emet --version`, CI와 프로세스 트리, 메모리
  브레이크의 macOS 지원, 그리고 `bin/emet` 심이 있는 플러그인 매니페스트.
- `emet skill-path`를 통한 스킬 계약, 그리고 스킬, 용어집, 지원 중단, 이중 설치를
  다루는 확장된 `emet doctor`.
- JS, Go, Rust, Python 리포지토리를 위한 언어 중립적인 `emet init`과 `emet map`.
- ADR-0007부터 ADR-0011까지.
- 문서 색인, 아키텍처 코드 맵, 증상별 문제 해결, 더 풍부한 PR 템플릿, 그리고
  런타임 전용 규칙이 담긴 `emet/AGENTS.md`.

### 변경됨

- `gh`는 `tracker.kind`가 `github`이거나 `landing.mode`가 `pr`일 때만
  필요합니다.
- `emet init`은 더 이상 기본적으로 로컬 트래커를 선택하지 않습니다.
- ADR-0004를 개정했습니다. 웨이브는 하나의 PR 또는 한 번의 로컬 병합으로
  랜딩합니다.

## 0.1.0

2026-11-03

### 추가됨

- 전역 `/forge` 명령: 인터뷰, 스펙, 티켓, 한 번의 승인 뒤에 병렬 워크트리
  에이전트가 기능을 무인으로 구현, 테스트, 병합합니다.
- `init`, `doctor`, `preflight`, `selftest`, 클레임, 슬롯, 게이트, 핸드오프 점검,
  결과, 지표 하위 명령이 있는 `forge` CLI.
- `forge-worker` 에이전트와 `forge-reviewer` 에이전트.
- Linear와 GitHub Issues용 트래커.
- `forge.config.json`을 통한 리포지토리별 설정.
- CLI, 명령, 에이전트를 설치하는 `install.sh`.
