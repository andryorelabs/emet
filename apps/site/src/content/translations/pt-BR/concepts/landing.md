---
title: Aterrissagem
description: Como uma spec aterrissa, por padrão como um único pull request, ou onda a onda com landing.unit em wave.
seoTitle: Aterrissagem no emet
sourceHash: 11d51c9132097b57
---

Como uma spec aterrissa, por padrão como um único pull request. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

Aqui, **Aterrissagem** significa como o trabalho concluído chega ao tronco. Não tem relação com a página inicial do Website.

## Um pull request por spec

Por padrão, uma spec aterrissa como um único pull request. Cada onda continua tendo sua própria revisão, gate e autoverificação, mas uma onda aprovada não aterrissa. O coordenador mescla seu branch de integração com `--no-ff` em um **Branch da spec** local, `spec/<id>`, e os tickets da onda passam a ser **Integrated**. A onda seguinte parte da ponta desse branch, de modo que as ondas posteriores se constroem sobre as anteriores sem esperar a CI de um pull request.

Depois da última onda, o coordenador sincroniza o tronco no branch da spec com um merge, nunca com um rebase, e a aterrissa uma única vez: um pull request, ou um merge local quando o modo de aterrissagem é `merge`, que nunca faz push. Cada onda continua sendo um commit de merge separado no histórico do tronco, então uma onda ainda pode ser revertida.

Um ticket **Integrated** conta como bloqueador fechado para a **Fronteira**, mas continua aberto até que a aterrissagem final o feche. **Landed** mantém seu significado simples: no tronco.

## Uma onda aterrissa sozinha só sob pedido

Com `landing.unit: wave`, cada onda aterrissa por conta própria: um pull request e uma espera de CI por onda, e a onda seguinte só começa depois que esse pull request for mesclado. Uma spec com três ondas custa então três pull requests. Esse é o comportamento anterior ao [ADR-0037](../adr/0037-landing-per-spec.md), e continua disponível.

Uma **Execução rápida** sempre aterrissa por onda, porque tem exatamente uma onda. Veja o [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull request ou merge local

Independentemente da unidade, `landing.mode` escolhe como o trabalho chega ao tronco. `pr` abre um pull request e precisa do `gh`. `merge` mescla localmente com `emet land` ou `emet spec-branch land` e nunca faz push, com o comando de autoverificação do repositório no lugar da CI. Veja o [ADR-0010](../adr/0010-local-merge-landing.md).

## O que esperar

- Um defeito que só a CI detecta aparece na aterrissagem final, depois que ondas posteriores se construíram sobre ele.
- Um conflito com o tronco aparece na sincronização, onde o coordenador para e lista os caminhos.
- O checkout fica preso a uma spec por vez; uma segunda spec em paralelo precisa de outro worktree.
- Por padrão, `spec/<id>` recebe push após cada onda integrada, sem abrir um pull request, de modo que perder o disco custa no máximo uma onda.
- Mesclar o pull request da spec com um commit de merge preserva a reversão por onda. Um tronco que só permite merges squash aterrissa a spec como um único commit e perde essa reversão.

Para as chaves, veja [`landing`](../reference/configuration.md#landing). Para os comandos, veja [`emet spec-branch` e `emet land`](../reference/cli.md#planning-review-and-landing). Para a decisão, veja o [ADR-0037](../adr/0037-landing-per-spec.md).
