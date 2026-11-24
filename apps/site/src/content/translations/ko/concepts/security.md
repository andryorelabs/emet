---
title: 보안
description: 무인 실행이 일으킬 수 있는 피해를 emet이 어떻게 제한하는지 설명합니다.
seoTitle: emet의 보안 모델
sourceHash: 359a25043b1d24d9
---

무인 실행이 일으킬 수 있는 피해를 emet이 어떻게 제한하는지 설명합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다. 취약점을 신고하려면 [SECURITY.md](../../.github/SECURITY.md)를 참고하세요.

## 무인 실행의 위협 모델

단일 승인 뒤에 `/emet:run`은 파일을 편집하고, 셸 명령을 실행하고, 사람이 지켜보지 않는 상태에서 커밋하는 워커를 디스패치합니다. 따라오는 위험은 다음과 같습니다.

- **파괴적인 명령.** 워커, 또는 워커가 읽은 텍스트가 재귀적 강제 삭제, 파괴적인 SQL 문, 강제 푸시를 실행합니다.
- **보호된 브랜치에 쓰기.** 워커가 `main`이나 `develop`에 푸시해 리뷰를 건너뜁니다.
- **워크트리 이탈.** 워커가 메인 체크아웃이나 다른 워커의 워크트리를 편집합니다.
- **위조된 승인.** 에이전트가 사람을 기다리지 않고 승인 기록을 직접 씁니다.
- **신뢰할 수 없는 입력.** 티켓 텍스트, 댓글, 웹 페이지, 도구 출력이 에이전트를 겨냥한 지시를 담고 있습니다.

통제는 여러 겹입니다. 어느 한 겹도 샌드박스가 아니며, 어느 것도 랜딩 PR 리뷰를 대신하지 못합니다.

## 권한 모드

Claude Code에서 워커는 `handoff.permissionMode`의 권한 모드로 실행되며 기본값은 `bypassPermissions`이므로, 어떤 프롬프트도 무인 웨이브를 멈추지 않습니다. 그 모드에서 남는 통제가 `emet guard` 훅입니다.

Codex CLI에서 워커는 기본적으로 샌드박스 없이 실행됩니다([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)). `workspace-write` 샌드박스가 연결된 워크트리에서의 커밋을 막고, Codex 코디네이터의 `emet dispatch`도 막기 때문입니다. 승인은 훅의 결정이며, `approval.json`을 직접 쓰는 것은 거부됩니다. [Codex 가이드](../how-to/use-codex.md)를 참고하세요.

트래커에는 코디네이터만 쓰고([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), 워커는 로컬 브랜치에만 커밋합니다([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## 가드가 다루는 범위

**`emet guard`**(`emet/src/guard-destructive.ts`)는 호스트에 설치되는 PreToolUse 훅입니다. 파괴적인 셸 명령과 SQL 클라이언트를 거부하며, `env`, `sudo`, `timeout`, `xargs` 같은 래퍼를 꿰뚫어 보고, 실행 디렉터리를 보호합니다.

**`rm-guard`**(`.claude/hooks/rm-guard.ts`)는 이 저장소 자체의 Bash용 PreToolUse 훅입니다. 명령을 `;`, `&&`, `||`, 파이프, 줄바꿈으로 나누며 `sh -c` 안의 텍스트도 포함해, 모든 대상이 엄격하게 `/tmp` 또는 OS 임시 디렉터리 아래로 해석되지 않는 한 재귀적 강제 `rm`(`-rf`, `-fr`, `-r -f`, `--recursive --force`)을 거부합니다. 저장소 안의 어떤 것도 목록에 없으므로 `.emet/` 아래의 재귀적 강제 삭제도 거부됩니다. `$`, 백틱, `~`를 쓰는 대상은 해석할 수 없으므로 거부됩니다.

`.claude/settings.json`의 **푸시 거부**는 `git push origin main`과 `git push origin develop`, 그리고 `HEAD:main`과 `HEAD:develop` 형태를 막습니다. `pre-push` Git 훅은 같은 ref와 허용된 패턴 밖의 모든 브랜치 이름을 거부합니다. 태그 푸시는 허용됩니다.

**룰셋**은 GitHub에서 같은 규칙을 강제합니다. `main`과 `develop`의 삭제 및 non-fast-forward 금지, 필수 체크, 보호된 `v*` 태그입니다. [development.md](../development.md#rulesets)를 참고하세요.

## 가드가 다루지 않는 범위

- 가드가 인식하지 못하는 명령. 예를 들어 디스크에 써 두었다가 나중에 실행하는 스크립트입니다.
- 네트워크 접근. 워커는 자격 증명이 허용하는 어떤 API든 여전히 호출할 수 있습니다.
- 워크트리 밖 파일의 읽기.
- `bun install`로 설치된 악성 의존성.

티켓 텍스트, 댓글, 가져온 페이지는 데이터로 취급하세요. 병합하기 전에 랜딩 PR을 리뷰하고, 실행이 상속하는 환경에 비밀 값을 두지 마세요.
