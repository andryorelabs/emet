---
title: Execuções, ondas e specs
description: Como uma execução, uma onda e uma spec se relacionam entre si.
seoTitle: Execuções, ondas e specs no emet
sourceHash: e43250ad3faa9a31
---

Como uma execução, uma onda e uma spec se relacionam entre si. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## A spec é a unidade de trabalho

Uma **Spec** é o documento de requisitos de uma funcionalidade, com requisitos numerados `S1..Sn`. Ela é escrita e aprovada antes de existir qualquer ticket, e tudo o que vem depois é medido contra ela: cada ticket nomeia os requisitos que cobre em uma linha `Covers:`, e cada requisito precisa de pelo menos um ticket e de um cenário de aceitação. O `emet validate` exige ambos antes da aprovação única. Veja [`emet validate`](../reference/cli.md#gates-and-records).

Quando uma spec aterrissa, ela atualiza as [specs vivas](living-specs.md) que descrevem o comportamento atual.

## Tickets e ondas

Um **Ticket** é uma unidade de trabalho derivada da spec, com interfaces, superfícies de edição permitidas e um orçamento de contexto. Os tickets dependem uns dos outros, então não podem começar todos de uma vez.

Uma **Onda** é uma camada de dependência: os tickets cujos bloqueadores estão todos concluídos, despachados juntos. O conjunto de tickets prontos para despacho em qualquer momento é a **Fronteira**. Dentro de uma onda, as superfícies de edição são disjuntas, então os workers nunca tocam o mesmo arquivo, e cada worker recebe seu próprio worktree e seu próprio branch local.

Uma onda também é a unidade de revisão: cada onda tem sua própria revisão e seu próprio gate, seja qual for a [unidade de aterrissagem](landing.md).

## Uma execução é uma execução única

Uma **Execução** é uma execução do `/emet:run` para uma spec. O id da execução liga as reivindicações, os slots de workers, os locks e os resultados que ela cria, e seus registros ficam em `.emet/runs/<run-id>/` no checkout principal.

Dentro de uma execução, uma sessão, o **Coordenador**, conduz as fases, despacha os workers, mescla seus branches e é o único que escreve no tracker. Os workers informam por meio de uma nota de handoff e de um arquivo de resultado local, nunca ao tracker. Veja o [ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

Uma **Execução rápida** é o caso pequeno: uma spec com exatamente um ticket, uma rodada de entrevista e uma onda que aterrissa sozinha, seja qual for a unidade de aterrissagem do repositório. Veja o [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Como tudo se encaixa

1. A execução entrevista você e escreve a spec, depois deriva os tickets e os agrupa em ondas.
2. Você aprova uma vez. A aprovação registra hashes da spec e da lista de tickets, e o despacho se recusa se um dos dois mudar depois.
3. Em cada onda, os workers implementam seus tickets em worktrees paralelos. O coordenador mescla seus branches em um branch de integração, e a onda passa por [revisão e gates](review-and-gates.md).
4. Uma onda aprovada é [aterrissada](landing.md), sozinha ou junto com o resto de sua spec.
5. No fim da execução, o coordenador salva o que aprendeu como [lições](memory.md).

Para os comandos por trás de cada etapa, veja a [referência da CLI](../reference/cli.md#runs-workers-and-slots) e os [gates e registros](../reference/cli.md#gates-and-records) que ela lista.
