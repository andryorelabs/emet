---
title: 플릿 점검
description: emet doctor로 여러 리포지토리를 읽기 전용으로 한 번에 감사하고, 설정을 바꾸고, 어떤 리포지토리에 조치가 필요한지 확인합니다.
seoTitle: emet doctor로 하는 플릿 점검
sourceHash: 511c25889b2a8244
---

여러 리포지토리에 걸쳐 emet을 한 번에 감사하고, 변경하고, 실행합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

## 사전 준비

- emet이 설치되어 있어야 합니다. [설치](../start/install.md)를 참고하세요.
- 각 리포지토리에 `emet.config.json`이 있고, 하나의 루트(기본값 `~/code`) 바로 아래 한 단계에 있어야 합니다.
- `gh`가 `PATH`에 있고 인증되어 있어야 합니다. [의존성 레퍼런스](../reference/dependencies.md)를 참고하세요.

## 리포지토리 감사하기

:::steps

1. 원하는 수만큼의 리포지토리에 읽기 전용 감사를 실행합니다.

   ```bash
   emet doctor ~/code/*
   ```

2. 리포지토리별 보고서를 읽습니다. 유효한 `emet.config.json`, 네 개의 `docs/agents/*.md` 파일 전부, 남아 있는 `TODO(emet):` 마커 없음, 실제로 해석되는 `commands.selfCheck` 명령, 그리고 해당 리포지토리의 트래커 의존성 점검 결과입니다.
3. 한 번만 출력되는 스윕 전체 점검 결과를 읽습니다. mattpocock-skills 플러그인과 `--help`로 확인한 외부 CLI 플래그(`gh`, 그리고 Claude Code에서는 `claude --bg`와 `claude agents --json`, Codex에서는 `codex exec --json`과 `--output-schema`)입니다. 플래그 이름이 바뀌면 웨이브가 실패하기 전에 여기에서 보고됩니다.

:::

## 모든 리포지토리의 설정 변경하기

:::steps

1. 각 리포지토리의 현재 값을 나열합니다.

   ```bash
   emet fleet list --root ~/code
   ```

   각 리포지토리의 경로, `tracker.kind`, `handoff.autoChain`, `models.worker`를 출력하며, `--json`을 쓰면 데이터로 출력합니다.

2. 변경 사항을 미리 봅니다.

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run`은 아무것도 쓰지 않고 각 리포지토리의 이전 값과 새 값을 출력합니다.

3. `--dry-run` 없이 같은 명령을 실행해 적용합니다. 값은 먼저 설정 로더로 검증되며, 잘못된 값이면 어떤 리포지토리도 수정하지 않고 종료 코드 1로 끝납니다.

:::

## 여러 리포지토리에서 기능 시작하기

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

`emet chain`과 동일한 준비 상태 점검을 거친 뒤 각 리포지토리에서 `/emet:run --draft <text>` 세션을 엽니다. `--repos`로 쉼표로 구분한 목록으로 제한할 수 있습니다.

## 막힌 세션 확인하기

```bash
emet fleet status
```

리포지토리마다 결정을 기다리며 막혀 있거나, 작업 중이거나, 유휴 상태인 emet 세션이 몇 개인지 출력하며, 막힌 리포지토리를 먼저 보여 줍니다. 전역 저널의 최근 24시간을 읽고 종료된 세션은 제외하며, `--json`은 세션을 출력합니다. 리포지토리 안에서는 `emet status`가 `sessions` 아래에 세션을 나열합니다. [주의 환기와 저널](../concepts/attention-and-journal.md)과 [설정 레퍼런스](../reference/configuration.md#attention)를 참고하세요.

## 확인

:::steps

1. `emet doctor ~/code/*`를 다시 실행해 실패를 보고하는 리포지토리가 없는지 확인합니다.
2. `emet fleet list --root ~/code`를 실행해 변경한 키가 모든 리포지토리에서 새 값으로 표시되는지 확인합니다.
3. `emet fleet status`를 실행해 예상치 못하게 막힌 리포지토리가 없는지 확인합니다.

:::

모든 프로브는 5초로 제한되므로, 멈춘 `gh auth status`가 웨이브를 멈추게 하지 않습니다. `preflight.requiredCommands`는 `emet preflight`와 `emet doctor`가 요구하는 바이너리 목록이며, 리포지토리가 직접 관리합니다. [CLI 레퍼런스](../reference/cli.md#플릿-점검)와 [설정 레퍼런스](../reference/configuration.md#preflight)를 참고하세요.
