---
title: Revisão e gates
description: Como a revisão dupla e os gates decidem se o trabalho pode aterrissar.
seoTitle: Revisão e gates no emet
sourceHash: 6efa20526c00a453
---

Como a revisão dupla e os gates decidem se o trabalho pode aterrissar. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## Um revisor confere a onda com a spec

Depois que os branches de uma onda são mesclados no branch de integração, um **Revisor** lê o resultado em um contexto novo e o confere com a spec. O revisor é um agente separado, nunca o worker que escreveu o código.

Quanto de revisão uma onda recebe depende do seu risco. O `emet assess` classifica o diff de forma determinística em um de três níveis:

- `passive`: um diff somente de documentação. Nenhum revisor é executado.
- `medium`: uma mudança comum de código. Um revisor é executado.
- `high`: o diff toca terreno arriscado, como autenticação, pagamentos, CI, migrações ou sinks perigosos. Essas ondas recebem a **Revisão dupla**.

## Revisão dupla no nível high

Uma onda `high` é lida por dois revisores em paralelo sobre o mesmo pacote: o revisor Claude e um revisor Codex. Um único modelo compartilha seus próprios pontos cegos, então uma segunda leitura independente é justamente o objetivo.

O coordenador então combina os dois conjuntos de achados. Um achado levantado pelos dois revisores permanece aberto como acordado. Um achado levantado por apenas um revisor é triado pelo coordenador, que o mantém ou o descarta com uma regra registrada. Um achado que contradiz um requisito que você escolheu explicitamente nunca é descartado.

A Revisão dupla só é executada quando o nível é `high`, o host é o Claude Code, o binário `codex` está no PATH e `review.dual` não é `off`. Caso contrário, um revisor é executado. As ondas medium e passive custam o mesmo nos dois casos, e os tokens de revisor dobram aproximadamente apenas nas ondas high. Veja o [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## Os achados são verificados, não aceitos na confiança

A CLI verifica o que o revisor afirma:

- **Veredictos de cobertura.** Para cada requisito, o revisor diz met, partial ou unmet. Um `met` deve nomear um teste. Um `met` cujo arquivo de teste ou nome de teste esteja ausente, ou um requisito sem veredicto, vira um achado `verification-gap` aberto. A CLI não executa nenhum teste por conta própria; quem faz isso é a suíte completa no branch de integração.
- **Achados preexistentes.** Um achado em uma linha que a onda não adicionou nem alterou é informado, mas nunca bloqueia o gate.
- **Opções do usuário.** Um requisito que você escolheu explicitamente é marcado como opção do usuário. Um achado contra ele bloqueia em todos os níveis e severidades, mesmo em uma linha intocada, e gera uma rodada de correção, não uma parada por si só.

## O gate decide

As fases nunca decidem por conta própria que o trabalho pode prosseguir. O `emet gate` lê o registro de verificação, os achados abertos, o nível de risco, a CI, a suíte de integração e os orçamentos, e imprime uma decisão:

- `merge` ou `chain`: o trabalho pode continuar.
- `hold`: falta algo que o emet pode resolver sozinho, como achados que ele pode corrigir ou uma verificação ainda em andamento.
- `stop`: uma pessoa precisa decidir antes de a execução continuar.
- `defer`: o ticket falhou em tentativas demais; ele é deixado de lado e o resto da onda continua.

## Rodadas de correção

Quando há achados bloqueantes abertos, o gate segura e pede uma **Rodada de correção**: o coordenador corrige os achados abertos e um revisor reverifica apenas esses, não o diff inteiro. As rodadas de correção têm seu próprio orçamento, separado das rodadas de revisão.

O gate para quando um achado mostra que a própria spec estava errada, quando as rodadas de correção se esgotam com achados ainda abertos, ou quando a suíte de integração falha pela segunda vez depois que suas specs com falha foram reexecutadas. Uma CI que nunca rodou por causa da máquina ou do provedor é repetida sem cobrar uma tentativa de correção, e informada como problema de infraestrutura na segunda vez seguida.

Para as chaves, veja [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) e [`budgets`](../reference/configuration.md#budgets). Para os comandos, veja [`emet assess`, `emet review` e `emet gate`](../reference/cli.md#gates-and-records). Para escolher os modelos dos revisores, veja [Modelos e esforço](../how-to/choose-models.md).
