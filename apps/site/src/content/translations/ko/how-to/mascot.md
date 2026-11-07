---
title: emet 마스코트 사용하기(Claude Code 모드와 Orca 펫)
description: 모드로 Claude Code에, 펫으로 Orca에 emet 마스코트를 표시합니다.
seoTitle: Claude Code와 Orca에서 쓰는 emet 마스코트
sourceHash: caca9eb66e693e32
---

Claude Code와 Orca에서 emet의 **Mascot**을 표시하는 방법입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

서로 독립적인 두 가지가 있습니다. Claude Code에 마스코트를 그리는 선택 사항인 `emet-mascot` 플러그인과, Orca에 같은 캐릭터를 제공하는 Orca 펫 번들입니다.

## 마스코트 플러그인 설치하기

이 플러그인은 emet과 같은 마켓플레이스에서 제공되며 선택 사항입니다. emet은 이것이 없어도 됩니다.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

마스코트는 세션의 상태(잠자는 중, 작업 중, 대기 중, 완료, 오류)를 따릅니다. **Run**이 활성화되어 있는 동안에는 **Phase file**도 읽어서 `emet · wave 2 · review` 같은 흐린 라벨을 표시합니다.

플러그인 옵션:

- `position`: `pane`(기본값), `band`, `status` 중 하나입니다. `pane`은 마스코트를 트랜스크립트 옆에 도킹하며, 전체 화면 레이아웃이 필요하고 직접 한 번 패널을 열기 전까지는 터미널 너비가 144열 이상이어야 합니다(그 이후에는 약 110열). 도킹할 수 없거나 나중에 터미널이 좁아지면 마스코트는 프롬프트 위에 대신 표시됩니다. `band`는 항상 프롬프트 위에 그립니다. `status`는 마스코트 그림 없이 텍스트 라벨만 플러그인 상태 줄로 표시합니다.
- `size`: `small`(16 x 8 셀, 기본값) 또는 `medium`(24 x 12 셀).
- `showLabel`: 마스코트 옆 라벨을 표시하거나 숨깁니다(기본값은 켜짐).

## 마스코트 플러그인 업데이트하기

Anthropic 이외의 마켓플레이스는 기본적으로 자동 업데이트가 꺼져 있으며, 마켓플레이스가 사용자에게 이를 켜 줄 수는 없습니다. 수동으로 업데이트하세요.

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

그런 다음 Claude Code를 다시 시작하세요. 자동으로 업데이트하려면 `/plugin`을 실행하고 **Marketplaces** 탭을 연 다음 `emet-marketplace`를 선택하고 **Enable auto-update**를 선택합니다. 각 사용자가 자신의 머신에서 한 번만 하면 됩니다. 메인 플러그인에 대해서도 [emet 업데이트하기](update-emet.md)를 참고하세요.

## 페이즈 파일

emet CLI는 실행이 진행됨에 따라 리포지토리의 `.emet/phase.json`을 기록하고, 마스코트는 약 2초마다 이를 폴링합니다. 최신성 기준보다 오래된 파일은 무시되므로, 비정상 종료된 실행이 오래된 라벨을 남기지 않습니다.

이 파일에는 `phase`(`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done`, `failed` 중 하나), `wave`, `spec`, `runId`, `updatedAt`, 그리고 선택 사항인 `outcome`이 들어 있습니다. 기록에 실패하더라도 해당 단계를 보고한 하위 명령이 실패하지는 않습니다.

## Orca에서 펫 사용하기

펫 번들은 `docs/brand/pet/emet/`에 있으며 `pet.json`과 `spritesheet.webp`로 이루어져 있습니다. Orca 설정에서 "Import .codex-pet bundle…"을 선택하고 그 폴더를 지정하세요. 가져오기에는 Orca 앱이 실행되는 머신에 `docs/brand/pet/emet/`가 있어야 하므로, Orca가 이 리포지토리와 다른 곳에서 실행된다면 그곳으로 폴더를 복사하세요. 마스코트 SVG를 바꾼 뒤에는 `bun run brand:export`로 다시 생성하고 결과를 커밋하세요.

## 문제 해결

- 마스코트가 보이지 않음: `claude plugin list`를 실행해 `emet-mascot`이 활성화되어 있는지 확인한 다음 Claude Code를 다시 시작하세요.
- 라벨이 보이지 않음: `.emet/phase.json`이 존재하고 최근에 갱신되었는지 확인하세요.
