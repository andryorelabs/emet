---
title: Codex에서 emet 실행하기
description: Codex CLI 쪽 설치, 에이전트 호스트 선택, 단일 승인, 알려진 한계를 설명합니다.
seoTitle: Codex에서 emet 실행하기
sourceHash: a64f64be24588f52
---

emet은 Claude Code뿐 아니라 Codex CLI에서도 실행할 수 있습니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따르며, 실행이 동작하는 제품을 **에이전트 호스트**라고 부릅니다. 이 페이지는 Codex 쪽 설치, 호스트 선택, 단일 승인, 알려진 한계를 다룹니다. [문서 색인](../README.md)으로 돌아갑니다.

Codex 호스트에서도 파이프라인은 같습니다. 인터뷰, 스펙, 티켓, 한 번의 승인, 워크트리에서의 병렬 워커, 웨이브마다의 리뷰, 그리고 랜딩입니다. 달라지는 것은 내부 구조입니다. 각 워커와 각 리뷰어는 `emet dispatch`와 `emet review-run`이 시작하는 독립된 `codex exec` 프로세스가 되고, 슬래시 명령은 `$emet:run`, `$emet:init`, `$emet:doctor` 스킬이 됩니다. Claude Code 경로는 바뀌지 않습니다.

## 설치

1. `codex.minVersion`(기본값 `0.167.0`) 이상 버전의 `codex` CLI를 설치하고 로그인합니다.
2. Codex에 `mattpocock-skills` 플러그인을 설치합니다.

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. emet 플러그인을 설치합니다. 저장소에는 `.codex-plugin/plugin.json`과 `codex/` 아래에 생성된 스킬 및 훅이 들어 있습니다.

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. [시작하기](getting-started.md)에 설명된 대로 `emet` CLI를 설치한 다음 `emet doctor .`를 실행합니다. Codex 호스트에서는 `codex.minVersion`보다 오래된 `codex`, `codex exec`에서 빠진 `--json` 또는 `--output-schema` 플래그, 그리고 빠진 `mattpocock-skills`(위의 두 명령을 안내)를 보고합니다.

3단계의 두 플러그인 명령은 로컬 마켓플레이스에 대해 스파이크에서 검증된 패턴을 따릅니다. 이 저장소에서의 정확한 표기는 첫 릴리스까지 `unverified`입니다.

## 에이전트 호스트 선택

`emet.config.json`에 `agentHost`를 설정합니다.

```json
{ "agentHost": "codex" }
```

기본값은 `"claude"`입니다. `codex` 섹션에서 모델, 추론 강도, 최소 버전, 샌드박스를 설정합니다. [설정 레퍼런스](../reference/configuration.md#codex)와 [모델과 추론 강도](models-and-effort.md)를 참고하세요. Codex에서 `$emet:run`으로 실행을 시작합니다. `emet launch <spec> --wave <n>`은 분리된 `codex exec`에서 웨이브를 시작하고 스레드 ID를 기록하므로 `codex exec resume <id>`로 이어서 진행할 수 있습니다. Orca 탭은 열리지 않습니다.

## 단일 승인

emet은 계획 이후 단 한 번만 승인을 요청합니다. Claude Code에서는 프롬프트이고, Codex에서는 훅입니다.

- `.emet/runs/spec<id>/approval.json`이 생길 때까지 `emet guard`는 `.emet/runs/**/draft/**` 아래에 쓰는 경우를 제외한 모든 변경(`apply_patch`, `Bash`)을 `not approved: send approve <id>`라는 사유로 거부합니다. 이 게이트는 `.emet/runs/spec<id>/` 디렉터리가 `approval.json` 없이 존재하는 시점부터 적용되며, 이는 `/emet:run`이 4단계에서 스펙을 구체화한 뒤 남기는 상태입니다.
- 정확히 `approve <id>`인 프롬프트 줄을 보내 승인합니다. 그러면 `UserPromptSubmit` 훅이 `emet approve`와 같은 해싱으로 승인 파일을 기록합니다. 도구 출력이나 모델 텍스트에 같은 말이 있어도 아무 일도 일어나지 않습니다.
- 대안은 `/plan $emet:run`입니다. 훅 대신 Codex 자체의 플랜 모드에서 계획을 승인합니다.

그 디렉터리가 존재하면 게이트는 페일 클로즈드로 동작합니다. 승인 파일이 없거나 읽을 수 없으면 변경은 계속 거부됩니다. 가드는 `apply_patch`의 모든 경로도 티켓의 `.emet/surface.json`과 대조합니다.

## 웨이브가 실행되는 방식

- `emet dispatch --role worker`는 클레임과 슬롯을 확인하고, `.emet/worktrees/agent-<ticket>`을 만들고, `.emet/runs/<run>/codex-home/` 아래에 실행별 `CODEX_HOME` 오버레이를 구성합니다. 이 오버레이는 인증과 설정을 복사하지 않고 링크합니다. 그런 다음 확정된 모델과 추론 강도, `codex.sandbox` 모드(기본값 `workspace-write`), `--json`, `--output-schema`와 함께 `codex exec`를 시작합니다. 이벤트는 `.emet/runs/<run>/codex/<ticket>.jsonl`에 기록됩니다.
- 오버레이의 규칙은 `git add`와 `git commit`을 허용하고 `git push`를 금지합니다. `~/.codex`에는 절대 쓰지 않습니다.
- `emet review-run`은 `emet review-package`가 만든 패키지에 대해 리뷰어를 읽기 전용으로 실행합니다. `passive` 티어는 프로세스를 시작하지 않습니다.
- 사용량 및 정체 감지는 기록된 JSONL을 읽습니다. 토큰 사용량은 `turn.completed` 이벤트에서, 생존 여부는 `codex` 프로세스와 파일의 수정 시각에서 얻습니다.

## 한계와 `unverified` 항목

- 추론 강도 `ultra`는 절대 전송되지 않으며 설정에서 거부됩니다.
- `danger-full-access`는 `codex.sandbox`를 그 값으로 설정할 때만 사용할 수 있으며, 기본적으로 활성화되는 것은 없습니다.
- `ScheduleWakeup`, `TaskStop`, `LSP`에 해당하는 것은 없습니다. 대신 emet은 자체 CLI를 폴링합니다.
- `~/.codex/sessions` 아래의 롤아웃 파일은 안정적인 형식이 없으므로, emet은 직접 기록한 `exec --json` 출력을 읽습니다.
- 조사에서는 다음 동작을 `unverified`로 표시합니다. 각각은 작은 함수 뒤에 있으므로 Codex가 바뀌어도 한 곳만 수정하면 됩니다. 인증을 링크한 실행별 `CODEX_HOME`, 오버레이 안의 규칙 파일 위치, `--dangerously-bypass-hook-trust`, 훅 명령의 `CLAUDE_PLUGIN_ROOT` 별칭, `codex plugin list`의 출력 형식, 모델이 이름으로 스킬을 불러오는 것, 중첩된 샌드박스 안의 `emet dispatch`입니다. [실현 가능성 조사](../research/codex-viability.md)를 참고하세요.
- 모델이 `approval.json`을 위조하려는 시도는 관찰된 적이 없습니다. 게이트는 그 시도를 거부하겠지만 이는 `unverified`입니다.
- 실행을 시작한 세션이 종료된 후 무인 슈퍼바이저(systemd, 컨테이너)에서 Codex를 실행하는 것은 `unverified`입니다.
- Codex 모델 이름과 가격은 바뀝니다. 실제 웨이브를 실행해 본 뒤 가격표를 다시 확인해야 합니다.
