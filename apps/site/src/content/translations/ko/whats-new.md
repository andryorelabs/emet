---
title: 새로운 소식
description: emet 릴리스 노트. 각 버전에서 무엇이 바뀌었는지 정리합니다.
seoTitle: "emet 새로운 소식: 릴리스 노트"
sourceHash: a633f8ebdf12e2a7
---

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
