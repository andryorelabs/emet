---
title: emet 업데이트하기
description: 설치된 emet을 새 릴리스로 옮기고, 플러그인의 마켓플레이스 자동 업데이트를 켭니다.
seoTitle: emet 업데이트하기
sourceHash: 584eafb89175d6c7
---

설치된 emet을 새 릴리스로 옮기는 방법입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

emet과 선택 사항인 `emet-mascot` 플러그인은 같은 마켓플레이스인 `emet-marketplace`에서 제공됩니다. Claude Code는 기본적으로 서드파티 마켓플레이스를 자동으로 업데이트하지 않으며, 마켓플레이스가 사용자에게 그 기본값을 바꿀 수도 없습니다.

## 수동으로 업데이트하기

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

마스코트를 설치하지 않았다면 마지막 줄은 건너뛰세요. 그런 다음 Claude Code를 다시 시작하거나 `/reload-plugins`를 실행합니다. `claude plugin list`로 설치된 버전을 볼 수 있고, 최신 버전은 [CHANGELOG.md](../../CHANGELOG.md)에 있습니다.

## Codex에서 업데이트하기

이 리포지토리의 문서에는 Codex 플러그인용 별도 업데이트 명령이 없습니다. [Codex에서 emet 실행하기](../guide/codex.md#설치)의 설치 명령을 다시 실행하세요.

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

`codex plugin list`로 `emet@emet-marketplace`가 설치되어 활성화되어 있는지 볼 수 있습니다.

## 자동으로 업데이트하기

Claude Code에서 `/plugin`을 실행하고 **Marketplaces** 탭을 연 다음 `emet-marketplace`를 선택하고 **Enable auto-update**를 선택합니다. 그러면 Claude Code는 세션이 시작될 때 마켓플레이스를 새로 고치고 두 플러그인을 모두 업데이트하며, 다음 세션에서 새 버전이 로드됩니다. 이 설정은 사용자가 각자의 머신에서 합니다.

## install.sh로 설치한 경우

클론에서 최신 `main`을 풀하고 `./install.sh`를 다시 실행하세요.
