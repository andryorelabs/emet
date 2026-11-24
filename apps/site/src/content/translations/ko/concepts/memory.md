---
title: 메모리
description: emet이 실행 사이에 무엇을 기억하고 그것을 어디에 보관하는지 설명합니다.
seoTitle: emet의 메모리
sourceHash: 9053ca5dd53acba7
---

emet이 실행 사이에 무엇을 기억하고 어디에 보관하는지 설명합니다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따릅니다.

## 교훈

실행은 무인으로 진행되므로, 그 과정에서 배운 내용은 세션과 함께 사라집니다. 실행이 끝나면 코디네이터가 도움이 되었거나 방해가 된 점에 대한 짧은 항목 1~5개를 **교훈**으로 저장하며, 실행 결과(landed, chained, hold, stop, blocked)도 함께 남깁니다. 각 항목은 짧은 한 줄입니다.

교훈은 스펙별로, 저장소당 노트 하나에 보관되므로 같은 저장소의 이후 실행이 이전 실행이 배운 내용을 읽을 수 있습니다. 노트가 너무 커지면 가장 오래된 섹션부터 버립니다.

## 보관 위치

교훈은 저장소나 트래커가 아니라 별도의 로컬 메모리 저장소인 [Engram](https://github.com/Gentleman-Programming/engram)에 있습니다. emet은 `engram` 바이너리가 PATH에 있고 핸드셰이크에 응답할 때만 이를 사용합니다.

Engram이 없거나, 고장 났거나, 꺼져 있으면 `emet memory`는 메모리를 사용할 수 없다고 보고하고 정상 종료합니다. 메모리는 실행을 막지 않습니다.

## 사용 방식

실행을 시작할 때 첫 인터뷰 라운드 전에, 코디네이터가 기능에 맞는 교훈을 메모리에서 검색합니다. 관련 있는 것은 계획의 "Prior lessons" 제목 아래에 들어가므로, 인터뷰와 계획이 이전 실행이 발견한 내용에서 출발합니다. 아무것도 찾지 못했거나 메모리를 쓸 수 없으면, 실행은 그 사실을 한 줄로 적고 계속 진행합니다.

## 직접 사용하기

`emet memory search`와 `emet memory save`는 일반 CLI 명령이므로 직접 검색하거나 교훈을 추가할 수 있습니다. 저장소에서 메모리를 끄려면 `memory.enabled`를 `off`로 설정하세요.

명령은 [`emet memory`](../reference/cli.md#runs-workers-and-slots)를 참고하세요. 키는 [`memory`](../reference/configuration.md#memory)를 참고하세요. 전체 흐름에서 실행의 위치는 [실행, 웨이브, 스펙](runs-waves-specs.md)에 있습니다.
