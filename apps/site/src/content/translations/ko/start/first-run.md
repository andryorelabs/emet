---
title: 첫 실행
description: emet doctor로 설치를 확인하고 emet을 처음으로 실행합니다.
seoTitle: emet 첫 실행
sourceHash: 7daec76e45f50b8c
---

`emet doctor`로 설치를 확인하고 emet을 처음으로 실행합니다. 먼저 emet을 설치하세요. [설치](install.md)를 참고하세요.

## 사전 준비

- emet이 설치되어 있고 `emet`이 `PATH`에 있어야 합니다.
- `gh`가 인증된 git 리포지토리.
- Claude Code 또는 Codex에서는 `mattpocock-skills` 플러그인.

## 단계

각 리포지토리에서 먼저 `setup-matt-pocock-skills` 스킬을 실행하세요(Claude Code에서는 `/setup-matt-pocock-skills`, Codex에서는 `mattpocock-skills` 플러그인의 같은 스킬을 Codex의 `$` 스킬 구문으로 실행). 그런 다음 아무 git 리포지토리에서나:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

세션 안에서는 `/emet:init`이 `emet init`과 같은 일을 합니다(Codex에서는 `$emet:init`). `emet init`은 스스로 추론할 수 없는 항목(공유 테스트 데이터베이스 락, 스키마 소유권 등)에 대해 생성된 `docs/agents/*.md` 파일에 `TODO(emet):` 마커를 남깁니다. 이 부분을 채워 주세요. 마커가 하나라도 남아 있으면 `emet preflight`는 디스패치를 거부합니다.

그런 다음 Claude Code 안에서 emet을 실행합니다(Codex에서는 `/emet:run` 대신 `$emet:run`을 사용합니다).

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## 결과 확인

터미널에서 `emet doctor .`를 실행하거나 Claude Code 안에서 `/emet:doctor`(Codex에서는 `$emet:doctor`)를 실행하세요. 실패가 먼저 보고됩니다. `doctor` 또는 `preflight`가 문제를 보고하면 [문제 해결](../troubleshooting.md)을 참고하세요. 사용자를 대신해 무엇이 설치되거나 로그인되는 일은 없습니다. 누가 무엇을 확인하는지와 `EMET_SKIP_DEPENDENCY_CHECKS`에 대해서는 [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.

## 다음 단계

- [트래커와 랜딩](../how-to/configure-tracker.md): GitHub, Linear 또는 로컬 티켓, 그리고 spec이 랜딩하는 방식.
- [Codex에서 emet 실행하기](../how-to/use-codex.md): 단일 승인과 Codex 에이전트 호스트의 한계.
- [모델과 추론 강도](../how-to/choose-models.md): 각 역할이 사용하는 모델과 추론 강도.
- [플릿 점검](../how-to/check-a-fleet.md): 여러 리포지토리를 한 번에 감사합니다.
- [설정 레퍼런스](../reference/configuration.md)와 [CLI 레퍼런스](../reference/cli.md): 모든 키와 하위 명령.
