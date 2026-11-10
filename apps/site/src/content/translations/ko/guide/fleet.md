---
title: 플릿 점검
description: emet doctor로 여러 리포지토리를 읽기 전용으로 한 번에 감사하고, 어떤 리포지토리에 조치가 필요한지 확인합니다.
seoTitle: emet doctor로 하는 플릿 점검
sourceHash: efeca623ade98bf1
---

이미 여러 리포지토리에서 emet을 사용하고 계신가요? `emet doctor`는 원하는 수만큼의 리포지토리를 읽기 전용으로 한 번에 감사합니다.

```bash
emet doctor ~/code/*
```

리포지토리마다 다음 항목을 보고합니다. 유효한 `emet.config.json`, 네 개의 `docs/agents/*.md` 파일이 모두 있는지, 남아 있는 `TODO(emet):` 마커가 없는지, `commands.selfCheck`의 명령이 실제로 해석되는지, 그리고 해당 리포지토리의 트래커별 의존성 점검 결과(`gh`, Linear. [의존성 레퍼런스](../reference/dependencies.md) 참고)입니다. mattpocock-skills 플러그인과 외부 CLI 플래그(`gh`와 에이전트 호스트 자체의 CLI 플래그. Claude Code에서는 `claude --bg`와 `claude agents --json`, Codex에서는 `codex exec --json`과 `--output-schema`이며, 모두 `--help`로 확인)는 리포지토리마다가 아니라 전체 스윕에서 한 번만 확인합니다.

`emet doctor`는 바이너리가 있는지만이 아니라 플래그 자체를 확인합니다. `gh issue view`/`gh repo view`(`--json`), `gh issue edit`(`--add-label`, `--remove-label`), 그리고 Claude Code에서는 `claude`(`--bg`)와 `claude agents`(`--json`)의 `--help`를 읽고, 더 새롭거나 오래된 CLI가 더 이상 문서화하지 않는 플래그를 보고합니다. 플래그 이름이 바뀌면 웨이브가 중간에 실패할 수 있기 때문입니다. `claude`와 `claude agents` 점검은 Claude Code 호스트의 것입니다. Codex 호스트에서는 호스트 플래그 점검이 이를 추가하는 것이 아니라 대체합니다. `emet doctor`는 `codex exec`에 `--json`과 `--output-schema`가 있는지 확인합니다(`emet/src/doctor.ts`의 `hostCliFlagRequirements`). `codex` 버전을 `codex.minVersion`과 비교하지는 않습니다. [Codex에서 emet 실행하기](codex.md)를 참고하세요.

모든 프로브는 5초로 제한되므로, 멈춘 `gh auth status`(네트워크 없음)가 웨이브를 멈추게 하지 않습니다. 리포지토리의 `preflight.requiredCommands`는 `emet preflight`와 `emet doctor`가 PATH에 있어야 한다고 요구하는 바이너리 목록이며, 리포지토리가 직접 관리합니다. [CLI 레퍼런스](../reference/cli.md#플릿-점검)와 [설정 레퍼런스](../reference/configuration.md#preflight)를 참고하세요.
