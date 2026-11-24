---
title: emet 마스코트 사용하기(Claude Code 모드와 Orca 펫)
description: 모드로 Claude Code에, 펫으로 Orca에 emet 마스코트를 표시합니다.
seoTitle: Claude Code와 Orca에서 쓰는 emet 마스코트
sourceHash: a6d2945308d1d44b
---

Claude Code와 Orca에서 emet의 **Mascot**을 표시합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

서로 독립적인 두 가지가 있습니다. Claude Code에 마스코트를 그리는 선택 사항인 `emet-mascot` 플러그인과, Orca에 같은 캐릭터를 제공하는 Orca 펫 번들입니다. emet은 어느 쪽도 필요로 하지 않습니다.

## 사전 준비

- 플러그인에는 Claude Code가 필요합니다.
- 실행이 마스코트가 따르는 페이즈 파일을 쓰도록 emet이 설치되어 있어야 합니다. [설치](../start/install.md)를 참고하세요.
- 펫에는 Orca가 필요합니다. 가져오기에는 Orca 앱이 실행되는 머신에 `docs/brand/pet/emet/` 폴더가 있어야 합니다.

## 마스코트 플러그인 설치하기

:::steps

1. 마켓플레이스를 추가하고 플러그인을 설치합니다.

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Claude Code를 다시 시작합니다. 마스코트는 세션의 상태(잠자는 중, 작업 중, 대기 중, 완료, 오류)를 따릅니다. **Run**이 활성화되어 있는 동안에는 페이즈 파일도 읽어서 `emet · wave 2 · review` 같은 흐린 라벨을 표시합니다.
3. 필요하면 플러그인 옵션을 설정합니다.
   - `position`: `pane`(기본값), `band`, `status` 중 하나입니다. `pane`은 마스코트를 트랜스크립트 옆에 도킹하며, 전체 화면 레이아웃이 필요하고 직접 한 번 패널을 열기 전까지는 터미널 너비가 144열 이상이어야 합니다(그 이후에는 약 110열). 도킹할 수 없으면 마스코트는 프롬프트 위에 표시됩니다. `band`는 항상 프롬프트 위에 그립니다. `status`는 텍스트 라벨만 상태 줄로 표시합니다.
   - `size`: `small`(16 x 8 셀, 기본값) 또는 `medium`(24 x 12 셀).
   - `showLabel`: 라벨을 표시하거나 숨깁니다(기본값은 켜짐).

:::

## 마스코트 플러그인 업데이트하기

Anthropic 이외의 마켓플레이스는 기본적으로 자동 업데이트가 꺼져 있으므로, 수동으로 업데이트하거나 한 번 켜 두세요.

:::steps

1. 마켓플레이스와 플러그인을 업데이트합니다.

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Claude Code를 다시 시작합니다.
3. 자동으로 업데이트하려면 `/plugin`을 실행하고 **Marketplaces** 탭을 연 다음 `emet-marketplace`를 선택하고 **Enable auto-update**를 선택합니다. 각 사용자가 자신의 머신에서 한 번만 하면 됩니다. 메인 플러그인은 [emet 업데이트하기](update-emet.md)를 참고하세요.

:::

## Orca에서 펫 사용하기

:::steps

1. `docs/brand/pet/emet/`(`pet.json`과 `spritesheet.webp`)가 Orca가 실행되는 머신에 있는지 확인합니다. Orca가 이 리포지토리와 다른 곳에서 실행된다면 그곳으로 폴더를 복사하세요.
2. Orca 설정에서 "Import .codex-pet bundle…"을 선택하고 그 폴더를 지정합니다.
3. 마스코트 SVG를 바꾼 뒤에는 `bun run brand:export`로 번들을 다시 생성하고 결과를 커밋합니다.

:::

## 확인

:::steps

1. `claude plugin list`를 실행해 `emet-mascot`이 활성화되어 있는지 확인합니다. 마스코트가 보이지 않으면 Claude Code를 다시 시작하세요.
2. 실행 중에 `.emet/phase.json`이 존재하고 최근 몇 초 이내에 갱신되었는지 확인합니다. 마스코트는 약 2초마다 이를 폴링하며 최신성 기준보다 오래된 파일은 무시하므로, 비정상 종료된 실행이 오래된 라벨을 남기지 않습니다. 이 파일에는 `phase`(`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done`, `failed` 중 하나), `wave`, `spec`, `runId`, `updatedAt`, 그리고 선택 사항인 `outcome`이 들어 있습니다.
3. Orca에서 emet 펫이 펫 목록에 나타나는지 확인합니다.

:::
