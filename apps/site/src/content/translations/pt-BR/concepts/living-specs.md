---
title: Specs vivas
description: Como um arquivo por área em docs/specs descreve o comportamento atual e se mantém atualizado.
seoTitle: Specs vivas no emet
sourceHash: d2468b14b371c04b
---

Uma spec no tracker é um plano: seus requisitos, seus tickets e suas ondas. Quando os tickets são fechados, o tracker deixa de dizer o que o sistema faz. Uma spec viva preenche essa lacuna: um arquivo por área em `docs/specs/` que descreve o comportamento atual, mantido atualizado pelo mesmo pull request que o altera. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md); a decisão está no [ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## O que uma spec viva contém

Cada área tem um arquivo. Ele é uma lista de requisitos, e cada requisito tem um nome descritivo, uma linha `Source: #<spec> S<n>` que aponta para o item da spec que o introduziu, e um ou mais cenários na forma WHEN e THEN. A linha de origem importa porque os números S são locais a uma spec, então o nome em si nunca usa um.

Uma spec viva descreve comportamento, não trabalho: nada nela diz o que está planejado nem quem o faz. Isso fica no tracker.

## Como uma spec a atualiza

As specs vivas são opcionais, por meio de `specs.enabled`. Quando está ativado, a atualização acontece uma vez por spec, na última onda da spec:

1. O coordenador lê a spec viva atual de cada área afetada.
2. Para cada requisito que a spec toca, decide se o requisito é adicionado, modificado ou removido, e grava o resultado como um delta de spec em um diretório compartilhado por todos os worktrees do repositório.
3. O `emet spec-merge` incorpora os deltas nos arquivos de `docs/specs/`. Ele nunca executa comandos de versionamento; o coordenador faz o commit do resultado.
4. O commit faz parte da última onda, de modo que a revisão e os gates veem a mudança na spec viva como qualquer outra mudança.

Um merge que tem conflito, ou que perderia um cenário existente, não grava nada e termina com um erro. O coordenador corrige o delta uma vez; se falhar de novo, a onda aterrissa sem a atualização e o relatório diz isso.

## Por que o coordenador decide

A qual área um requisito pertence, e se ele é novo ou altera um existente, é um julgamento que exige o arquivo atual e a intenção da spec. Uma ferramenta que gerasse deltas mecanicamente não saberia nenhum dos dois, então o julgamento fica com o coordenador e o merge permanece mecânico.

## Onde aterrissa

Com a aterrissagem padrão, o commit da spec viva viaja dentro do branch da spec e chega ao tronco com o pull request único. Veja [Aterrissagem](landing.md). Com uma onda como unidade de aterrissagem, ele faz parte do pull request da última onda.

## Veja também

- [Execuções, ondas e specs](runs-waves-specs.md)
- [Revisão e gates](review-and-gates.md)
- [Referência de configuração](../reference/configuration.md) para `specs.enabled` e `specs.dir`
