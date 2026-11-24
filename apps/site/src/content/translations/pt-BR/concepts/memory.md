---
title: Memória
description: O que o emet lembra entre execuções e onde guarda isso.
seoTitle: Memória do emet
sourceHash: 9053ca5dd53acba7
---

O que o emet lembra entre execuções e onde guarda isso. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## Lições

Uma execução é sem supervisão, então o que ela aprende desapareceria com a sessão. No fim de uma execução, o coordenador salva de 1 a 5 itens curtos sobre o que ajudou ou atrapalhou, chamados **Lessons**, junto com o resultado da execução: landed, chained, hold, stop ou blocked. Cada item é uma única linha curta.

As lições são guardadas por spec, em uma nota por repositório, para que uma execução posterior no mesmo repositório possa ler o que as anteriores aprenderam. Uma nota que cresce demais descarta primeiro suas seções mais antigas.

## Onde são guardadas

As lições ficam no [Engram](https://github.com/Gentleman-Programming/engram), um armazenamento local de memória separado, não no seu repositório nem no tracker. O emet só o usa quando o binário `engram` está no PATH e responde ao seu handshake.

Se o Engram estiver ausente, quebrado ou desativado, `emet memory` informa que a memória está indisponível e termina com sucesso. A memória nunca bloqueia uma execução.

## Como são usadas

No início de uma execução, antes da primeira rodada da entrevista, o coordenador busca na memória as lições que correspondem à funcionalidade. As relevantes entram no plano sob o título "Prior lessons", para que a entrevista e o plano partam do que as execuções anteriores descobriram. Quando nada é encontrado ou a memória está indisponível, a execução registra isso em uma linha e segue em frente.

## Usando manualmente

`emet memory search` e `emet memory save` são comandos comuns da CLI, então você mesmo pode buscar ou adicionar uma lição. Para desativar a memória em um repositório, defina `memory.enabled` como `off`.

Para os comandos, veja [`emet memory`](../reference/cli.md#runs-workers-and-slots). Para a chave, veja [`memory`](../reference/configuration.md#memory). O lugar de uma execução no fluxo maior está em [Execuções, ondas e specs](runs-waves-specs.md).
