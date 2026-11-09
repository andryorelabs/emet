---
title: 의존성
description: emet이 머신에서 필요로 하는 것과 각 항목을 확인하는 명령을 설명합니다.
seoTitle: emet 의존성
sourceHash: 50444429c7883bd3
---

emet이 머신에서 필요로 하는 것과 각 항목을 확인하는 명령입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다. [README](../../README.md)로 돌아가기.

## 필수

- **[bun](https://bun.sh)**: 소스 설치에만 필요합니다. 독립 실행형 바이너리에는 런타임이 필요 없습니다.
- **`rsync`** 및 **`sha256sum` 또는 `shasum`**: `install.sh`가 필요로 합니다.
- **`git`**: 실행 시 필수입니다. 거의 모든 하위 명령이 git을 호출합니다.
- **인증된 `gh` CLI**: 트래커가 `github`이거나 랜딩이 `pr`일 때 필수입니다. PR은 항상 이것을 사용합니다. `tracker.kind: "local"`이고 `landing.mode: "merge"`이면 `gh`는 필요 없습니다.
- **`mattpocock-skills` 플러그인**(`claude-plugins-official` 마켓플레이스): `/emet`의 인터뷰, 스펙, 티켓 단계는 그곳에 있는 스킬을 호출합니다.

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **`~/.claude/agents/`의 `emet-worker` 및 `emet-reviewer` 에이전트**: `install.sh`가 설치합니다. 6단계와 8단계는 `subagent_type`으로 디스패치하므로 둘 중 하나라도 없으면 디스패치가 동작하지 않습니다. [모델과 추론 강도](../../README.md#models--effort)를 참고하세요.
- **`.mcp.json`(또는 사용자 범위)에 선언된 Linear MCP 서버**: 리포지토리가 `linear` 트래커를 사용할 때만 필요합니다. emet은 선언이 있는지 확인합니다. 연결이 인증되었는지는 Claude Code 자체의 자격 증명 저장소에 있어 여기서는 확인할 수 없습니다. 실행 중 티켓을 읽지 못하면 Claude Code를 다시 시작하고 연결을 승인하세요.

위의 어떤 것도 사용자를 대신해 설치되거나 로그인되지 않습니다. 다른 점은 누가, 얼마나 엄격하게 확인하느냐입니다.

## Codex 호스트

`agentHost`가 `"codex"`일 때만 필요합니다. [Codex 가이드](../guide/codex.md)를 참고하세요. `emet-worker`와 `emet-reviewer` 에이전트는 여기서 사용하지 않습니다.

- **`codex` CLI**: 로그인된 상태에서 `codex.minVersion`(기본값 `0.167.0`) 이상의 버전. `emet doctor`는 더 오래된 버전을 보고하고 `codex exec --help`에 `--json`과 `--output-schema`가 나오는지 확인합니다.
- Codex의 **`mattpocock-skills` 플러그인**: `codex plugin list`로 확인합니다.

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **Codex용 emet 플러그인**(`.codex-plugin/plugin.json`): `$emet:run`, `$emet:init`, `$emet:doctor` 스킬과 승인 훅을 제공합니다.

emet은 `~/.codex`에 절대 쓰지 않습니다. 워커는 인증과 설정을 링크하는 실행별 `CODEX_HOME`으로 동작합니다.

## 무엇이 무엇을 확인하는가

|                                               | `emet init`        | `emet doctor`             | `emet preflight`                                                                             |
| --------------------------------------------- | ------------------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| 플러그인이 없거나 비활성화됨                  | 설치 명령을 출력   | 보고(플릿 전체에서 한 번) | **디스패치를 차단**                                                                          |
| `emet-worker`/`emet-reviewer` 에이전트가 없음 | —                  | 보고(플릿 전체에서 한 번) | **디스패치를 차단**                                                                          |
| `gh`가 없거나 인증되지 않음(트래커: `github`) | 실행할 명령을 출력 | 보고                      | **디스패치를 차단**                                                                          |
| Linear 서버가 선언되지 않음(트래커: `linear`) | 안내 문구를 출력   | 보고                      | **디스패치를 차단**                                                                          |
| `claude`가 PATH에 없거나 프로브가 시간 초과   | 안내 문구를 출력   | 보고                      | **경고만 하고 차단하지 않음**: "확인하지 못했다"는 뜻이지 "망가진 것을 확인했다"는 뜻이 아님 |
| emet이 의존하는 플래그가 `--help`에 없음      | —                  | 보고                      | —                                                                                            |

### 플래그 점검

`emet doctor`는 바이너리가 있는지만이 아니라 플래그 자체를 확인합니다. `gh issue view`와 `gh repo view`(`--json`), `gh issue edit`(`--add-label`, `--remove-label`), `claude`(`--bg`), `claude agents`(`--json`)의 `--help`를 읽고, 더 새롭거나 오래된 CLI가 더 이상 문서화하지 않는 플래그를 보고합니다. 플래그 이름이 바뀌면 웨이브가 중간에 실패할 수 있기 때문입니다.

### 시간 제한과 차단 건너뛰기

모든 프로브는 5초로 제한되므로, 멈춘 `gh auth status`(네트워크 없음)가 웨이브를 멈추게 하지 않습니다. `preflight`의 차단이 사용 환경에서 잘못된 것이라면, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight`로 그 한 번의 실행에 한해 경고로 낮출 수 있습니다. 본인의 셸에서 설정하고, `/emet` 코디네이터가 무인으로 실행하는 곳에는 설정하지 마세요. [환경 변수](cli.md#환경-변수)를 참고하세요.

### 리포지토리가 관리하는 바이너리

리포지토리의 `preflight.requiredCommands`(`emet.config.json` 안)는 `emet preflight`와 `emet doctor`가 PATH에 있어야 한다고 요구하는 바이너리의, 리포지토리가 직접 관리하는 별도 목록입니다. 워커 프롬프트가 파일 전체를 읽는 것보다 빠른 대안으로 권하는 `rg`와 `sg`에 유용합니다. `gh`는 여기에 나열할 필요가 없습니다. 위의 점검이 이미 다룹니다. [`preflight`](configuration.md#preflight)를 참고하세요.

실패와 해결 방법은 [문제 해결](../troubleshooting.md#의존성-점검이-실패합니다)을 참고하세요.
