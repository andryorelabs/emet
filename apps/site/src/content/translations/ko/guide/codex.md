---
title: Codex에서 emet 실행하기
description: Codex CLI 쪽 설치, 에이전트 호스트 선택, 단일 승인, 알려진 한계를 설명합니다.
seoTitle: Codex에서 emet 실행하기
sourceHash: 2941f08113ffa231
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

4. [시작하기](getting-started.md)에 설명된 대로 `emet` CLI를 설치한 다음 `emet doctor .`를 실행합니다. `install.sh`는 `~/.claude` 아래에 Claude Code 명령과 에이전트도 설치하지만 Codex에서는 무해하며, `emet doctor`는 Codex 플러그인과 `install.sh`를 함께 쓰는 경우에 경고하지 않습니다. Codex 호스트에서는 `codex.minVersion`보다 오래된 `codex`, `codex exec`에서 빠진 `--json` 또는 `--output-schema` 플래그, 그리고 빠진 `mattpocock-skills`(위의 두 명령을 안내)를 보고합니다.

3단계의 두 플러그인 명령은 실제 `codex`(0.167.0)에 대해 실행되었습니다. 새 `CODEX_HOME`에서 종료 코드 0으로 끝나며, `codex plugin list`에 `emet@emet-marketplace installed, enabled`가 표시됩니다. 로컬 경로 형식인 `codex plugin marketplace add <repo>`도 같은 결과를 냅니다.

## 에이전트 호스트 선택

`emet.config.json`에 `agentHost`를 설정합니다.

```json
{ "agentHost": "codex" }
```

기본값은 `"claude"`입니다. `codex` 섹션에서 모델, 추론 강도, 최소 버전, 샌드박스를 설정합니다. [설정 레퍼런스](../reference/configuration.md#codex)와 [모델과 추론 강도](models-and-effort.md)를 참고하세요. Codex에서 `$emet:run`으로 실행을 시작합니다. `emet launch <spec> --wave <n>`은 분리된 `codex exec`에서 웨이브를 시작하고 스레드 ID를 기록하므로 `codex exec resume <id>`로 이어서 진행할 수 있습니다. Orca 탭은 열리지 않습니다.

## 단일 승인

emet은 계획 이후 단 한 번만 승인을 요청합니다. Claude Code에서는 프롬프트이고, Codex에서는 훅입니다.

- `.emet/runs/spec<id>/approval.json`이 생길 때까지 `emet guard`는 `.emet/runs/**/draft/**` 아래에 쓰는 경우를 제외한 모든 변경(`apply_patch`, `Bash`)을 `not approved: send approve <id>`라는 사유로 거부합니다. 이 게이트는 `.emet/runs/spec<id>/` 디렉터리가 `approval.json` 없이 존재하는 시점부터 적용되며, 이는 `$emet:run`이 4단계에서 스펙을 구체화한 뒤 남기는 상태입니다.
- 정확히 `approve <id>`인 프롬프트 줄을 보내 승인합니다. 그러면 `UserPromptSubmit` 훅이 `emet approve`와 같은 해싱으로 승인 파일을 기록합니다. 도구 출력이나 모델 텍스트에 같은 말이 있어도 아무 일도 일어나지 않습니다.
- 대안은 `/plan $emet:run`입니다. 훅 대신 Codex 자체의 플랜 모드에서 계획을 승인합니다.

그 디렉터리가 존재하면 게이트는 페일 클로즈드로 동작합니다. 승인 파일이 없거나 읽을 수 없으면 변경은 계속 거부됩니다. 가드는 `apply_patch`의 모든 경로도 티켓의 `.emet/surface.json`과 대조합니다.

## 웨이브가 실행되는 방식

- `emet dispatch --role worker`는 클레임과 슬롯을 확인하고, `.emet/worktrees/agent-<ticket>`을 만들고, `.emet/runs/<run>/codex-home/` 아래에 실행별 `CODEX_HOME` 오버레이를 구성합니다. 그런 다음 확정된 모델과 추론 강도, `codex.sandbox` 모드(기본값 `danger-full-access`), `--json`, `--output-schema`와 함께 `codex exec`를 시작합니다. 이벤트는 `.emet/runs/<run>/codex/<ticket>.jsonl`에 기록됩니다. 워커는 `thread.started` 이벤트의 `threadId`와 그 JSONL 경로로 식별되며, 프로세스 ID는 보조 필드일 뿐입니다.
- 오버레이는 링크가 아니라 생성됩니다. `auth.json`은 심볼릭 링크로 연결되고(복사되지 않습니다), emet 플러그인 캐시는 Codex 홈에 있으면 거기서 링크되며, 오버레이는 자체 최소 `config.toml`을 씁니다. 내용은 로컬 마켓플레이스와 `[plugins."emet@emet-marketplace"] enabled = true`, 그 실행 자체의 디렉터리에 대해서만 만드는 `trusted` `[projects."<dir>"]` 테이블, 확정된 `model`과 `model_reasoning_effort`입니다. 사용자의 `[projects]` 테이블이나 다른 설정은 복사되지 않으며, `~/.codex`에는 절대 쓰지 않습니다.
- 오버레이의 `rules/default.rules`는 `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...`, 그리고 `emet` 하위 명령 `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff`를 허용하고 `git push`를 금지합니다. 기본 샌드박스가 더 이상 쓰기를 막지 않으므로, `emet guard`도 argv가 `git push`를 실행하는 `Bash` 명령을 `git -C <dir> push`와 `git --git-dir=<dir> push`를 포함해 샌드박스와 상관없이 거부합니다.
- `emet review-run`은 `emet review-package`가 만든 패키지에 대해 리뷰어를 읽기 전용으로 실행합니다. `passive` 티어는 프로세스를 시작하지 않습니다.
- 모델은 실행 홈의 `models_cache.json`, 없으면 실제 Codex 홈의 `models_cache.json`(읽기 전용)에 대해 확정됩니다. 설정된 슬러그가 목록에 없으면 대체되고 그 대체가 기록됩니다. 아무것도 확정되지 않으면 `emet review-run`은 모델 호출 전에 역할과 목록에 있는 슬러그를 밝히며 실패합니다.
- 사용량 및 정체 감지는 기록된 JSONL을 읽습니다. 토큰 사용량은 `turn.completed` 이벤트에서, 생존 여부는 파일이 계속 커지는지로 얻으므로 다른 pid 네임스페이스의 워커도 살아 있는 것으로 읽힙니다. `emet preflight`와 `emet cleanup`은 회수 가능한 소유자 없는 워크트리(워커 브랜치, 티켓 랜딩 완료, 깨끗한 트리, 다른 주체의 잠금 없음)에 같은 규칙을 공유하므로, preflight는 cleanup이 실제로 동작할 때만 `emet cleanup`을 실행하라고 안내합니다.

## 실제 Codex 실행에서 확인된 것

[프로브 보고서](../research/codex-probe-report.md)는 이 변경 이후 `codex-cli 0.167.0`(ChatGPT 무료 플랜, Linux)에 대해 모든 점검을 다시 실행했습니다. 이전의 `failed` 행은 이제 모두 `verified`입니다.

- 2웨이브 플로우가 Codex 워커의 실제 커밋을 트렁크에 랜딩했습니다. 웨이브 1은 `emet dispatch`에서, 웨이브 2는 `emet launch <spec> --wave 2`로 시작한 세션에서 이루어졌고, 그 세션은 오버레이의 플러그인 캐시에서 `$emet:run`을 불러왔습니다. `emet review-run`은 모든 플로우에서 실행되었습니다.
- 옵트인 e2e(`EMET_CODEX_E2E=1`)가 통과합니다. 워커는 `danger-full-access`에서 커밋하며, `codex execpolicy check`는 `git push origin develop`에 `forbidden`, `git -C <dir> commit`에 `allow`를 답합니다.
- `~/.codex/config.toml`의 sha256은 프로브, e2e, 일곱 번의 플로우 동안 그대로였습니다.

## 한계와 `unverified` 항목

- 추론 강도 `ultra`는 절대 전송되지 않으며 설정에서 거부됩니다.
- `danger-full-access`는 Codex 워커와 `emet launch`의 기본 `codex.sandbox`입니다. `workspace-write` 샌드박스는 `.git`을 읽기 전용으로 만들어 워커가 커밋할 수 없기 때문입니다. 샌드박스를 유지하려면 `codex.sandbox`를 `"workspace-write"`로 설정하세요. 그러면 워커는 커밋할 수 없습니다. 이 트레이드오프는 [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)에 기록되어 있습니다. Claude 경로는 이를 쓰지 않습니다. 샌드박스가 없을 때는 `emet guard`의 push 거부와 규칙 파일이 안전장치입니다.
- `ScheduleWakeup`, `TaskStop`, `LSP`에 해당하는 것은 없습니다. 대신 emet은 자체 CLI를 폴링합니다.
- `~/.codex/sessions` 아래의 롤아웃 파일은 안정적인 형식이 없으므로, emet은 직접 기록한 `exec --json` 출력을 읽습니다.
- 실제 CLI에 대해 검증되었으며, Codex가 바뀌어도 한 곳만 수정하면 되도록 여전히 작은 함수 뒤에 있는 항목은 다음과 같습니다. 인증을 링크한 실행별 `CODEX_HOME`, `rules/default.rules`의 규칙 파일, `--dangerously-bypass-hook-trust`, 훅 명령의 `CLAUDE_PLUGIN_ROOT` 별칭, `codex plugin list`의 출력 형식, 모델이 이름으로 스킬을 불러오는 것, 중첩된 세션 안의 `emet dispatch`, 모델이 `approval.json`을 위조하려는 시도(거부됨), 그리고 `codex plugin marketplace add`의 두 형식입니다. [실현 가능성 조사](../research/codex-viability.md)를 참고하세요.
- 여전히 `unverified`인 것: systemd나 컨테이너에서 Codex를 무인으로 실행하는 것(분리된 프로세스만 테스트했습니다).
- 프로브 보고서의 알려진 후속 과제: `emet init`이 `agentHost: "codex"`에서도 `models`에 Claude 모델 이름을 쓰는 것, 명시적인 `emet dispatch --model`이 캐시에 대해 확정되지 않는 것, `emet lock-reason`이 `claude` 조상 프로세스를 찾는 것, 그리고 워커가 죽은 티켓을 같은 워크트리에 다시 디스패치할 수 없는 것입니다.
- Codex 모델 이름과 가격은 바뀝니다. 실제 웨이브를 실행해 본 뒤 가격표를 다시 확인해야 합니다.
