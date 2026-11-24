---
title: Codex에서 emet 실행하기
description: Codex CLI 쪽 설치, 에이전트 호스트 선택, 단일 승인, 업데이트 후 해야 할 일, 알려진 한계를 설명합니다.
seoTitle: Codex에서 emet 실행하기
sourceHash: 71c6c7d0686a6725
---

Claude Code 대신 Codex CLI에서 emet 파이프라인을 실행합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따르며, 실행이 동작하는 제품을 **에이전트 호스트**라고 부릅니다. [문서 색인](../README.md)으로 돌아갑니다.

Codex에서 웨이브가 실행되는 방식, 가드, 샌드박스의 트레이드오프는 [보안](../concepts/security.md)과 [실행, 웨이브, 스펙](../concepts/runs-waves-specs.md)에서 설명합니다.

## 사전 준비

- `codex.minVersion`(기본값 `0.167.0`) 이상 버전의 `codex` CLI가 설치되어 있고 로그인되어 있어야 합니다.
- `git`과 `gh`가 `PATH`에 있어야 합니다. [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.
- `emet.config.json`이 있는 리포지토리가 있어야 합니다(없으면 `emet init`을 실행하세요).

## 설치

:::steps

1. Codex에 `mattpocock-skills` 플러그인을 설치합니다.

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. [설치](../start/install.md)의 독립 실행형 설치로 emet을 설치합니다. emet 스킬을 `~/.agents/skills/emet/` 아래에 쓰고 emet 훅을 `$CODEX_HOME/hooks.json`(기본값 `~/.codex`)에 추가하며, `config.toml`은 절대 쓰지 않습니다. 터미널용 `emet`과 `~/.claude` 아래의 Claude Code 명령 및 에이전트도 함께 설치하지만 Codex에서는 무해합니다.

3. 훅을 신뢰합니다. Codex는 훅을 신뢰하기 전에는 실행하지 않습니다. `/hooks`를 열고 이벤트 페이지에서 `t`를 누르거나, 시작 시 "Hooks need review" 프롬프트를 승인하세요.

:::

### 선택 사항: Codex 플러그인

독립 실행형 설치 대신 emet 플러그인을 설치할 수 있습니다.

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

플러그인에는 `emet` 심이 없으므로 터미널의 `emet`에는 여전히 독립 실행형 설치가 필요합니다. 플러그인이 설치되어 있는 동안 `emet self install`은 `--force`를 주지 않으면 거부하며, 둘이 공존하면 `emet doctor`가 경고합니다.

## 에이전트 호스트 선택

:::steps

1. `emet.config.json`에 `agentHost`를 설정합니다(기본값은 `"claude"`).

   ```json
   { "agentHost": "codex" }
   ```

2. 기본값이 맞지 않으면 `codex` 섹션에서 모델, 추론 강도, 최소 버전, 샌드박스를 설정합니다. [설정 레퍼런스](../reference/configuration.md#codex)와 [모델 선택](choose-models.md)을 참고하세요.
3. Codex에서 `$emet:run`으로 실행을 시작합니다. 터미널에서 웨이브를 시작하려면 `emet launch <spec> --wave <n>`을 실행하세요. 분리된 `codex exec`를 시작하고 스레드 ID를 기록하므로 `codex exec resume <id>`로 이어서 진행할 수 있습니다. Orca 탭은 열리지 않습니다.

:::

## 계획 승인하기

emet은 계획 이후 단 한 번만 승인을 요청합니다. Codex에서는 훅입니다.

:::steps

1. `$emet:run`이 스펙을 구체화할 때까지 기다립니다. `.emet/runs/spec<id>/approval.json`이 생길 때까지 `emet guard`는 모든 변경을 `not approved: send approve <id>`라는 사유로 거부합니다.
2. 정확히 `approve <id>`인 프롬프트 줄을 보냅니다. `UserPromptSubmit` 훅이 승인 파일을 기록합니다. 도구 출력이나 모델 텍스트에 같은 말이 있어도 아무 일도 일어나지 않습니다.
3. 또는 `/plan $emet:run`으로 시작해 Codex 자체의 플랜 모드에서 계획을 승인합니다.

:::

## emet 업데이트 후

독립 실행형 설치에서는 훅이 `hooks.json`의 일반 항목이므로 신뢰 상태가 유지됩니다. 플러그인을 쓰면 Codex는 업데이트할 때마다 플러그인 훅을 다시 신뢰할지 묻습니다.

:::steps

1. `/hooks`를 열고 이벤트 페이지에서 `t`를 누르거나, 시작 시 "Hooks need review" 프롬프트를 승인합니다. 그때까지는 emet guard와 단일 승인이 실행되지 않습니다.
2. shim이 `release v<version> has no downloadable asset yet`을 출력하면 캐시된 버전을 실행 중인 것입니다. 몇 분 뒤에 다시 시도하세요.

:::

## 확인

:::steps

1. `emet doctor .`를 실행합니다. Codex 호스트에서는 `codex.minVersion`보다 오래된 `codex`, `codex exec`에서 빠진 `--json` 또는 `--output-schema` 플래그, 신뢰하지 않은 훅, 그리고 빠진 `mattpocock-skills`를 보고합니다.
2. [문제 해결](../troubleshooting.md#codex-호스트)의 해당 항목에 따라 보고된 문제를 고친 뒤, 실패가 보고되지 않을 때까지 다시 실행합니다.

:::

알려진 한계: 추론 강도 `ultra`는 전송되지 않으며 설정에서 거부됩니다. `codex.sandbox`의 기본값은 워커가 커밋할 수 있도록 `danger-full-access`입니다. 샌드박스를 유지하려면 `"workspace-write"`로 설정하세요. 그러면 워커는 커밋할 수 없습니다. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)와 [프로브 보고서](../research/codex-probe-report.md)를 참고하세요.
