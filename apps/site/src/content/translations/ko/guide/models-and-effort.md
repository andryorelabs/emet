---
title: 모델과 추론 강도
description: emet이 역할마다 모델과 추론 강도를 어떻게 고르는지, 그리고 이를 바꾸는 설정 키를 설명합니다.
seoTitle: emet의 모델과 추론 강도
sourceHash: 7ab8a2e10ec9cae7
---

`/emet`은 역할마다 모델과 추론 강도(effort)를 자동으로 선택합니다. 실행 중에 수동으로 바꿀 것은 없습니다. 모든 키는 [설정 레퍼런스](../reference/configuration.md#models)에 있습니다.

| 역할                                   | 모델                    | 추론 강도         | 설정 위치                                    |
| -------------------------------------- | ----------------------- | ----------------- | -------------------------------------------- |
| 계획(1~4단계)                          | Opus(`opusplan` 경유)   | 세션의 설정       | 사용자, 한 번만                              |
| 코디네이터, 5단계 이후                 | Sonnet(`opusplan` 경유) | 세션의 설정       | 사용자, 한 번만                              |
| 워커(7단계)                            | Sonnet                  | `medium`          | `agents/emet-worker.md` 또는 `models.worker` |
| 리뷰, `passive` 티어(문서만 바뀐 diff) | 없음                    | —                 | `emet assess`                                |
| 리뷰, `medium` 티어(일반 소스 변경)    | Opus                    | `medium`          | `models.reviewer.medium`                     |
| 리뷰, `high` 티어(위험한 경로나 싱크)  | Opus                    | 기본값은 `medium` | `models.reviewer.high`                       |
| CI 로그 분류(8단계)                    | Haiku                   | —                 | `models.triage`                              |

두 에이전트 정의(`install.sh`가 `~/.claude/agents/`에 설치합니다)는 프런트매터에 자체 `model`/`effort`를 고정해 두므로, 코디네이터의 모델이나 추론 강도 선택이 워커나 리뷰어에게 새어 들어가지 않습니다. `emet doctor`는 두 파일 중 하나가 없어져도 보고만 하며 차단하지 않습니다. `emet preflight`는 `emet-worker` 또는 `emet-reviewer`가 없으면 디스패치를 차단합니다. 6단계와 8단계가 `subagent_type`으로 디스패치하기 때문입니다.

## 위험 티어 라우팅

8단계는 `emet assess --base <trunk> --head <integration branch>`를 실행합니다. 이 명령은 diff를 결정적으로 분류하고, 티어와 그 이유, 권장 리뷰어 모델과 추론 강도를 JSON으로 출력합니다.

- `passive`: 문서만 바뀐 diff입니다. 리뷰어를 디스패치하지 않습니다.
- `medium`: 리뷰어가 `models.reviewer.medium`으로 실행됩니다.
- `high`: diff가 인증, 보안, 결제, 웹훅, CI, 설치 프로그램, 락파일, 마이그레이션, 위험한 싱크(원시 SQL, 파이프로 셸에 전달하는 코드 등) 또는 `review.highRiskPaths`와 일치하는 경로를 건드립니다. 리뷰어가 `models.reviewer.high`로 실행되며, 자동 병합은 체크가 모두 통과하고 열려 있는 리뷰 지적이 없을 때만 PR을 랜딩합니다.

위험한 경로를 건드리는 티켓에는 `Model:` 줄(예: `Model: opus` 또는 `Model: opus/high`)을 넣을 수 있으며, 해당 워커에 한해 `models.worker`를 덮어씁니다.

## Haiku 분류

코디네이터는 CI 로그를 통째로 읽지 않습니다. 실패한 체크는 `models.triage`(기본값 `haiku`)의 에이전트에 넘겨지며, 이 에이전트는 수정을 위한 `file:line` 포인터와 함께 최대 약 2k 토큰을 반환합니다.

## 설정

모든 키는 선택 사항이며, 기본값은 위 표와 같습니다.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths`는 대소문자를 구분하지 않고 `high` 티어를 강제하는 추가 경로 부분 문자열의 목록입니다. 위험한 웨이브를 더 엄격하게 검토하려면 `models.reviewer.high.effort`를 (예를 들어 `high`로) 높이세요.

## Codex 호스트

`agentHost`를 `"codex"`로 설정하면 각 워커와 리뷰어는 역할별로 `-m`과 `model_reasoning_effort`가 지정된 독립적인 `codex exec` 프로세스가 됩니다. [`codex`](../reference/configuration.md) 섹션의 기본값은 다음과 같습니다.

| 역할                    | 모델          | 노력 수준                 | 대체 모델                     |
| ----------------------- | ------------- | ------------------------- | ----------------------------- |
| 세션 (`$emet:run`)      | `gpt-6.1-sol` | `medium` (`high` 계획 중) | 없음                          |
| 워커                    | `gpt-6.1-sol` | `medium`                  | `gpt-6.1-terra`, `gpt-6-luna` |
| `Model:` 줄이 있는 워커 | `gpt-6.1-sol` | `xhigh`                   | `gpt-6-astra`                 |
| 리뷰어, `medium` 등급   | `gpt-6.1-sol` | `high`                    | 없음                          |
| 리뷰어, `high` 등급     | `gpt-6-astra` | `high`                    | `gpt-6.1-sol`                 |
| 트리아지                | `gpt-6-luna`  | `medium`                  | `gpt-6.1-terra`               |

`emet dispatch`는 각 슬러그를 Codex 모델 캐시와 대조합니다. 캐시에 있고 해당 노력 수준을 지원하는 슬러그는 그대로 쓰고, 아니면 모델의 업그레이드 대상, 그다음 대체 모델을 따르며, 마지막에는 `-m`을 생략하고 모든 대체를 로그에 남깁니다. 노력 수준 `ultra`는 절대 보내지 않습니다. `passive` 등급에서는 리뷰어를 시작하지 않습니다.

실제 웨이브를 몇 번 돌린 뒤 다음과 같은 경우 다시 조정하세요.

- 워커가 수정 라운드를 반복해서 필요로 할 때: `codex.models.worker.effort`를 올리거나 위험한 티켓에 `Model:` 줄을 넣으세요.
- `high` 등급 웨이브의 리뷰가 지적 사항을 놓칠 때: `codex.models.reviewer.high.effort`를 올리세요.
- 로그에 대체가 표시될 때: Codex가 슬러그 이름을 바꾸거나 없앴으니 슬러그를 업데이트하세요.

## 리뷰어가 하나인 이유

여러 관점으로 나누지 않고 컨텍스트가 새로운 단일 리뷰어를 쓰는 이유는 다음과 같습니다. 둘을 직접 비교한 공개 벤치마크는 없지만, 관점별 분산 방식은 관점마다 diff 전체를 다시 읽기 때문에 이 리포지토리에서 한 시간 넘게 멈춘 적이 있습니다. 또한 Anthropic과 제3자의 Opus 급 모델 보고서에 따르면 모델 업그레이드가 관점을 늘린 것과 비슷한 효과를 냅니다. 중요도가 높은 웨이브는 이후에 직접 `/code-review ultra`를 실행하세요. `/emet`은 이를 스스로 디스패치하지 않습니다.

## 직접 한 번만 설정하는 것

`/emet`은 실행 중에 다음을 바꿀 수 없습니다.

- `~/.claude/settings.json`의 `model: "opusplan"`: 이 설정 덕분에 1~4단계는 Opus로, 5단계부터는 Sonnet으로 실행되며 `/model`이 필요 없습니다. 설정되어 있지 않으면 `emet doctor`가 경고합니다(설정을 직접 수정하지는 않습니다).
- 세션 추론 강도는 `xhigh`가 아니라 `medium` 또는 `high`로 합니다. 워커와 리뷰어는 사용자의 설정과 관계없이 이미 자체 추론 강도를 갖고 있으며, 전역 기본값을 높여도 디스패치 관리, 병합, 보고서처럼 그럴 필요가 없는 코디네이터 자신의 턴에 비용만 늘어납니다.
- 무인으로 실행할 수 있는 `permissions.defaultMode`(`auto`, `acceptEdits`, `bypassPermissions`)와 `git push * main|master` 및 `git push --force *`를 차단하는 `permissions.deny` 규칙입니다. `emet doctor`는 둘 다 경고합니다. 권한 프롬프트에서 멈추는 웨이브나 트렁크 브랜치를 강제로 넘을 수 있는 웨이브는 무인 실행의 의미를 없애기 때문입니다.

이 값들은 출발점이지 확정된 수치가 아닙니다. Opus 5.5는 2026-09-22에 출시되었고, 코딩 에이전트의 추론 강도와 모델 선택은 아직 활발히 연구되는 분야입니다. 이 표를 최종본으로 여기지 말고, 실제 웨이브를 몇 번 실행한 뒤 다시 조정하세요.
