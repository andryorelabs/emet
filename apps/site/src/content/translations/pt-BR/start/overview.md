---
title: Visão geral
description: O que é o emet, o que uma execução faz e para onde ir em seguida.
seoTitle: Visão geral do emet
sourceHash: 8627801ad3b7d807
---

O que é o emet, o que uma execução faz e para onde ir em seguida. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="mascote do emet, pronto" width="96" align="right">

O emet leva uma funcionalidade da ideia até a mudança integrada dentro do Claude Code ou da CLI do Codex, em qualquer repositório git, com Linear, GitHub Issues ou tickets locais. Você descreve a funcionalidade uma vez e aprova a spec e os tickets uma vez; o resto roda sem supervisão.

## O que uma execução faz

1. `/emet:run` (`$emet:run` no Codex) entrevista você e escreve uma spec.
2. Ele divide a spec em tickets e pede uma única aprovação.
3. Workers em paralelo implementam cada ticket em seu próprio worktree git.
4. Uma revisão verifica cada onda e o CI precisa estar verde; qualquer coisa sinalizada interrompe a integração.
5. A spec aterrissa como um único pull request por padrão, ou como um merge local, e a próxima onda pode encadear em seguida.

## Para onde ir em seguida

1. [Instalar](install.md): a instalação independente, a atualização, a atualização automática e a desinstalação.
2. [Primeira execução](first-run.md): confirme a instalação e execute o emet em um repositório.
3. [Execuções, ondas e specs](../concepts/runs-waves-specs.md): o vocabulário de uma execução.
4. [Trackers e aterrissagem](../how-to/configure-tracker.md): GitHub, Linear ou tickets locais, e como uma spec aterrissa.
