---
title: Modelos e esforço
description: Como o emet escolhe um modelo e um esforço de raciocínio para cada papel, e quais chaves de configuração os alteram.
seoTitle: Modelos e esforço no emet
sourceHash: 482995e2b98c659b
---

O `/emet` escolhe automaticamente um modelo e um esforço de raciocínio por papel; não há nada para trocar manualmente no meio de uma execução. As primeiras seções descrevem o host Claude Code; o [host Codex](#host-codex) tem seus próprios padrões. Todas as chaves do Claude Code estão na [referência de configuração](../reference/configuration.md#models).

## Host Claude Code

| Papel                                                   | Modelo                 | Esforço             | Definido por                                |
| ------------------------------------------------------- | ---------------------- | ------------------- | ------------------------------------------- |
| Planejamento (fases 1–4)                                | Opus, via `opusplan`   | o da sua sessão     | você, uma única vez                         |
| Coordenador, a partir da fase 5                         | Sonnet, via `opusplan` | o da sua sessão     | você, uma única vez                         |
| Workers (fase 7)                                        | Sonnet                 | `medium`            | `agents/emet-worker.md`, ou `models.worker` |
| Revisão, nível `passive` (diff somente de documentação) | nenhum                 | —                   | `emet assess`                               |
| Revisão, nível `medium` (mudança de código comum)       | Opus                   | `medium`            | `models.reviewer.medium`                    |
| Revisão, nível `high` (caminhos ou pontos sensíveis)    | Opus                   | `medium` por padrão | `models.reviewer.high`                      |
| Triagem de logs de CI (fase 8)                          | Haiku                  | —                   | `models.triage`                             |

No Claude Code, as duas definições de agente (instaladas pelo `install.sh` em `~/.claude/agents/`) fixam seu próprio `model`/`effort` no frontmatter, de modo que a escolha de modelo/esforço do próprio coordenador nunca vaza para um worker nem para o revisor. O `emet doctor` informa (sem nunca bloquear) se qualquer um dos arquivos estiver ausente. O `emet preflight` bloqueia o despacho quando `emet-worker` ou `emet-reviewer` está ausente, porque a fase 6 e a fase 8 despacham por `subagent_type`.

## Roteamento por nível de risco

A fase 8 executa `emet assess --base <trunk> --head <integration branch>`, que classifica o diff de forma determinística e imprime JSON com o nível, os motivos e o modelo/esforço recomendados para o revisor:

- `passive`: diff somente de documentação; nenhum revisor é despachado.
- `medium`: o revisor roda em `models.reviewer.medium`.
- `high`: o diff toca autenticação, segurança, pagamentos, webhooks, CI, o instalador, lockfiles, migrações, um ponto sensível perigoso (SQL bruto, pipe-to-shell e semelhantes) ou um caminho que corresponda a `review.highRiskPaths`. O revisor roda em `models.reviewer.high`, e o auto-merge aterrissa o PR somente com checks verdes e nenhum achado de revisão em aberto.

Um ticket que toca caminhos de alto risco pode carregar uma linha `Model:` (por exemplo `Model: opus` ou `Model: opus/high`), que substitui `models.worker` apenas para aquele worker.

## Triagem com Haiku

No Claude Code, o coordenador nunca lê um log de CI inteiro. Um check que falha é entregue a um agente em `models.triage` (padrão `haiku`), que devolve no máximo cerca de 2k tokens com ponteiros `file:line` para a correção.

## Configuração

Estas são as chaves `models` do Claude Code. Todas as chaves são opcionais, e os padrões reproduzem a tabela do Claude Code acima:

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` é uma lista de trechos de caminho adicionais, sem diferenciar maiúsculas de minúsculas, que forçam o nível `high`. Para ter mais rigor em ondas arriscadas, aumente `models.reviewer.high.effort` (por exemplo para `high`).

## Host Codex

Com `agentHost` em `"codex"`, cada worker e revisor é seu próprio processo `codex exec`, com `-m` e `model_reasoning_effort` definidos por papel. Os padrões da seção [`codex`](../reference/configuration.md) são:

| Papel                         | Modelo        | Esforço                                  | Alternativas                  |
| ----------------------------- | ------------- | ---------------------------------------- | ----------------------------- |
| Sessão (`$emet:run`)          | `gpt-6.1-sol` | `medium` (`high` durante o planejamento) | nenhuma                       |
| Worker                        | `gpt-6.1-sol` | `medium`                                 | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker com uma linha `Model:` | `gpt-6.1-sol` | `xhigh`                                  | `gpt-6-astra`                 |
| Revisor, nível `medium`       | `gpt-6.1-sol` | `high`                                   | nenhuma                       |
| Revisor, nível `high`         | `gpt-6-astra` | `high`                                   | `gpt-6.1-sol`                 |
| Triagem                       | `gpt-6-luna`  | `medium`                                 | `gpt-6.1-terra`               |

`emet dispatch` e `emet review-run` resolvem cada slug em `models_cache.json`, lido do home do overlay da execução ou, na falta dele, do seu Codex home real (somente leitura). Eles mantêm um slug que está listado e aceita o esforço, senão seguem o upgrade do modelo, depois os fallbacks, depois omitem `-m`, e registram cada substituição; quando nada é resolvido, `emet review-run` falha antes da chamada ao modelo e informa o papel e os slugs listados. O `config.toml` do overlay que a execução gera também leva o `model` e o `model_reasoning_effort` resolvidos. O esforço `ultra` nunca é enviado. O nível `passive` não inicia revisor.

Reajuste depois de algumas ondas reais quando:

- os workers precisam de várias rodadas de correção: aumente `codex.models.worker.effort` ou coloque uma linha `Model:` no ticket arriscado;
- as revisões de ondas de nível `high` perdem achados: aumente `codex.models.reviewer.high.effort`;
- o log mostra uma substituição: o Codex renomeou ou aposentou um slug, então atualize o slug.

A execução real no Codex do [relatório de sondagem](../research/codex-probe-report.md) usou o esforço `low` e o modelo resolvido mais barato (`gpt-6-luna`), e o modelo do revisor foi resolvido pelo cache.

## Por que um único revisor

Por que um único revisor de contexto limpo em vez de um leque de vários ângulos: nenhum benchmark público compara os dois diretamente, mas um leque relê o diff inteiro uma vez por ângulo e já travou por mais de uma hora neste repositório, enquanto relatos da Anthropic e de terceiros sobre modelos da classe Opus sugerem que a melhoria do modelo rende tanto quanto renderiam os ângulos extras. Para uma onda de alto risco no Claude Code, execute `/code-review ultra` manualmente depois; o `/emet` nunca o despacha por conta própria. O `/code-review ultra` é um comando do Claude Code; esta página não documenta nenhum equivalente no Codex.

## O que você define uma vez, por conta própria (Claude Code)

No host Claude Code, o `/emet` não consegue trocar isto no meio de uma execução. Isto fica no `~/.claude/settings.json` do Claude Code; o host Codex não lê esse arquivo, e seus modelos vêm da seção `codex` acima:

- `model: "opusplan"` em `~/.claude/settings.json`: é isso que faz as fases 1–4 rodarem no Opus e da fase 5 em diante no Sonnet, sem precisar de `/model`. O `emet doctor` avisa (sem nunca editar suas configurações) se não estiver definido.
- Um esforço de sessão `medium` ou `high` em vez de `xhigh`: os workers e o revisor já carregam seu próprio esforço, independentemente do seu, e um padrão global alto principalmente acrescenta custo aos turnos do próprio coordenador (controle de despachos, merges, relatórios) que não precisam dele.
- Um `permissions.defaultMode` capaz de rodar sem supervisão (`auto`, `acceptEdits` ou `bypassPermissions`), mais regras `permissions.deny` bloqueando `git push * main|master` e `git push --force *`. O `emet doctor` avisa sobre ambos, pois uma onda que trava em um pedido de permissão ou que consegue forçar passagem pela branch tronco anula o objetivo de rodar sem supervisão.

Esses são pontos de partida, não números definitivos. O Opus 5.5 foi lançado em 2026-09-22, e a escolha de esforço e modelo para agentes de programação ainda é uma área ativa; reajuste depois de algumas ondas reais em vez de tratar esta tabela como final.
