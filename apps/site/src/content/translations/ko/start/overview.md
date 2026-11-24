---
title: 개요
description: emet이 무엇인지, 실행에서 무슨 일이 일어나는지, 다음에 어디로 가야 하는지 설명합니다.
seoTitle: emet 개요
sourceHash: 8627801ad3b7d807
---

emet이 무엇인지, 실행에서 무슨 일이 일어나는지, 다음에 어디로 가야 하는지 설명합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

<img src="../brand/mascot/mascot-done.svg" alt="emet 마스코트, 완료" width="96" align="right">

emet은 Claude Code 또는 Codex CLI 안에서, 어떤 git 리포지토리에서든, Linear, GitHub Issues 또는 로컬 티켓을 사용해 기능을 아이디어에서 병합된 변경까지 이끌어 줍니다. 기능을 한 번 설명하고 spec과 티켓을 한 번 승인하면, 나머지는 무인으로 실행됩니다.

## 실행에서 일어나는 일

1. `/emet:run`(Codex에서는 `$emet:run`)이 인터뷰를 진행하고 spec을 작성합니다.
2. spec을 티켓으로 나누고 승인을 한 번 요청합니다.
3. 병렬 워커가 각 티켓을 자신의 git 워크트리에서 구현합니다.
4. 리뷰가 각 웨이브를 점검하고 CI가 통과해야 하며, 표시된 항목이 있으면 병합이 중단됩니다.
5. spec은 기본적으로 하나의 풀 리퀘스트로, 또는 로컬 병합으로 랜딩하며, 다음 웨이브가 이어서 진행할 수 있습니다.

## 다음 단계

1. [설치](install.md): 독립 실행형 설치, 업데이트, 자동 업데이트, 제거.
2. [첫 실행](first-run.md): 설치를 확인하고 리포지토리에서 emet을 실행합니다.
3. [실행, 웨이브, spec](../concepts/runs-waves-specs.md): 실행의 어휘.
4. [트래커와 랜딩](../how-to/configure-tracker.md): GitHub, Linear 또는 로컬 티켓, 그리고 spec이 랜딩하는 방식.
