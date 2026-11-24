---
title: emet 업데이트하기
description: 독립 실행형 emet을 새 릴리스로 옮기고, 자동 업데이트를 설정하며, 플러그인을 업데이트합니다.
seoTitle: emet 업데이트하기
sourceHash: 380b07ed5a10474f
---

설치된 emet을 새 릴리스로 옮기는 방법입니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

## 독립 실행형 설치 업데이트하기

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

릴리스를 내려받아 `SHA256SUMS`(`gh`가 있으면 증명서도)로 검증하고 스테이징합니다. 심볼릭 링크와 설치된 파일의 교체는 잡힌 워커 슬롯이 없을 때만 일어나며, 그렇지 않으면 업데이트는 보류된 채 다음 세션 시작 때 적용됩니다. 실패해도 현재 버전은 그대로이며 실패는 저널에 기록됩니다. 이전 버전은 롤백용으로 보관되고 더 오래된 버전은 정리됩니다. 업데이트가 보류 중이면 `emet doctor`가 경고합니다.

## 자동으로 업데이트하기

`SessionStart` 훅이 `emet self update --auto`를 하루에 최대 한 번, 분리된 상태로 실행하며 오프라인이면 조용히 넘어갑니다. 끄려면 `EMET_AUTO_UPDATE=0`을 설정하거나 다음을 실행하세요.

```bash
emet self update --auto off
```

`emet self update --auto on`으로 다시 켭니다. 자동 업데이트는 플러그인 설치에는 아무 일도 하지 않습니다.

## 선택 사항: 플러그인

emet과 선택 사항인 `emet-mascot` 플러그인은 같은 마켓플레이스인 `emet-marketplace`에서 제공됩니다. Claude Code는 기본적으로 서드파티 마켓플레이스를 자동으로 업데이트하지 않으며, 마켓플레이스가 사용자에게 그 기본값을 바꿀 수도 없습니다.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

마스코트를 설치하지 않았다면 마지막 줄은 건너뛰세요. 그런 다음 Claude Code를 다시 시작하거나 `/reload-plugins`를 실행합니다. `claude plugin list`로 설치된 버전을 볼 수 있고, 최신 버전은 [CHANGELOG.md](../../CHANGELOG.md)에 있습니다.

자동으로 업데이트하려면 Claude Code에서 `/plugin`을 실행하고 **Marketplaces** 탭을 연 다음 `emet-marketplace`를 선택하고 **Enable auto-update**를 선택합니다. 그러면 Claude Code는 세션이 시작될 때 마켓플레이스를 새로 고치고 두 플러그인을 모두 업데이트합니다. 이 설정은 사용자가 각자의 머신에서 합니다.

### Codex

마켓플레이스 스냅샷을 새로 고친 다음 플러그인을 다시 추가하세요. `codex plugin marketplace add`를 한 번 더 실행해도 새로 고쳐지지 않습니다.

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list`로 `emet@emet-marketplace`가 설치되어 활성화되어 있는지 볼 수 있습니다. 자동 업데이트는 Claude Code의 기능이며, Codex에서는 수동으로 업그레이드합니다.
