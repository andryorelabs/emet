---
title: Modelos e esforço
description: Como o emet escolhe um modelo e um esforço de raciocínio para cada papel, e quais chaves de configuração os alteram.
seoTitle: Modelos e esforço no emet
sourceHash: 0807a288317cba93
---

O `/emet` escolhe automaticamente um modelo e um esforço de raciocínio por papel; não há nada para trocar manualmente no meio de uma execução. As primeiras seções descrevem o host Claude Code; o [host Codex](#host-codex) tem seus próprios padrões. Todas as chaves do Claude Code estão na [referência de configuração](../reference/configuration.md#models).

## Pré-requisitos

- O emet instalado; veja [Instalação](../start/install.md).
- Um repositório com `emet.config.json` (execute `emet init` se ele não existir).

## Host Claude Code

| Papel                                              | Modelo                 | Esforço             | Definido por                                |
| -------------------------------------------------- | ---------------------- | ------------------- | ------------------------------------------- |
| Planejamento (Fases 1–4)                           | Opus, via `opusplan`   | o da sua sessão     | você, uma vez                               |
| Coordenador, a partir da Fase 5                    | Sonnet, via `opusplan` | o da sua sessão     | você, uma vez                               |
| Workers (Fase 7)                                   | Sonnet                 | `medium`            | `agents/emet-worker.md`, ou `models.worker` |
| Revisão, nível `passive` (diff só de documentação) | nenhum                 | —                   | `emet assess`                               |
| Revisão, nível `medium` (mudança comum de código)  | Opus                   | `medium`            | `models.reviewer.medium`                    |
| Revisão, nível `high` (caminhos ou sinks de risco) | Opus                   | `medium` por padrão | `models.reviewer.high`                      |
| Triagem de log de CI (Fase 8)                      | Haiku                  | —                   | `models.triage`                             |

No Claude Code, as duas definições de agente (instaladas por `emet self install` em `~/.claude/agents/`) fixam o próprio `model`/`effort` no frontmatter, de modo que a escolha de modelo/esforço do próprio coordenador nunca vaza para um worker ou para o revisor. O `emet doctor` informa (sem nunca bloquear) quando um dos arquivos some. O `emet preflight` bloqueia o despacho quando `emet-worker` ou `emet-reviewer` está ausente, porque a Fase 6 e a Fase 8 despacham por `subagent_type`.

## Roteamento por nível de risco

A Fase 8 executa `emet assess --base <trunk> --head <integration branch>`, que classifica o diff de forma determinística e imprime JSON com o nível, os motivos e o modelo/esforço de revisor recomendados:

- `passive`: diff só de documentação; nenhum revisor é despachado.
- `medium`: o revisor roda em `models.reviewer.medium`.
- `high`: o diff toca autenticação, segurança, pagamentos, webhooks, CI, o instalador, lockfiles, migrações, um sink perigoso (SQL bruto, pipe para shell e semelhantes) ou um caminho que corresponda a `review.highRiskPaths`. O revisor roda em `models.reviewer.high`, e o merge automático só aterrissa o PR com checks verdes e nenhum achado de revisão aberto.

Um ticket que toca caminhos de alto risco pode levar uma linha `Model:` (por exemplo `Model: opus` ou `Model: opus/high`), que substitui `models.worker` somente para aquele worker.

## Triagem com Haiku

No Claude Code, o coordenador nunca lê um log de CI inteiro. Um check com falha é entregue a um agente em `models.triage` (padrão `haiku`), que devolve no máximo cerca de 2k tokens com ponteiros `file:line` para a correção.

## Configuração

Estas são as chaves `models` do Claude Code. Toda chave é opcional, e os padrões reproduzem a tabela do Claude Code acima:

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

`review.highRiskPaths` é uma lista de trechos de caminho extras, sem diferenciar maiúsculas de minúsculas, que forçam o nível `high`. Para ter mais escrutínio em ondas de risco, aumente `models.reviewer.high.effort` (por exemplo, para `high`).

## Host Codex

Com `agentHost` definido como `"codex"`, cada worker e cada revisor é um processo `codex exec` próprio, com `-m` e `model_reasoning_effort` definidos por papel. Os padrões da seção [`codex`](../reference/configuration.md) são:

| Papel                         | Modelo        | Esforço                       | Alternativas                  |
| ----------------------------- | ------------- | ----------------------------- | ----------------------------- |
| Sessão (`$emet:run`)          | `gpt-6.1-sol` | `medium` (`high` ao planejar) | nenhuma                       |
| Worker                        | `gpt-6.1-sol` | `medium`                      | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker com uma linha `Model:` | `gpt-6.1-sol` | `xhigh`                       | `gpt-6-astra`                 |
| Revisor, nível `medium`       | `gpt-6.1-sol` | `high`                        | nenhuma                       |
| Revisor, nível `high`         | `gpt-6-astra` | `high`                        | `gpt-6.1-sol`                 |
| Triagem                       | `gpt-6-luna`  | `medium`                      | `gpt-6.1-terra`               |

`emet dispatch` e `emet review-run` resolvem cada slug contra o `models_cache.json`, lido do home overlay da execução e, na falta dele, do seu Codex home real (somente leitura). Eles mantêm um slug que esteja listado ali e aceite o esforço; senão seguem o upgrade do modelo, depois as alternativas, depois omitem `-m`, e registram toda substituição; quando nada é resolvido, `emet review-run` falha antes da chamada ao modelo e informa o papel e os slugs listados. O `config.toml` do overlay que a execução gera também carrega o `model` e o `model_reasoning_effort` resolvidos. O esforço `ultra` nunca é enviado. O nível `passive` não inicia nenhum revisor.

Reajuste depois de algumas ondas reais quando:

- os workers precisarem de várias rodadas de correção: aumente `codex.models.worker.effort` ou coloque uma linha `Model:` no ticket de risco;
- as revisões de ondas de nível `high` deixarem achados passar: aumente `codex.models.reviewer.high.effort`;
- o log mostrar uma substituição: o Codex renomeou ou aposentou um slug, então atualize o slug.

A execução real no Codex do [relatório de sondagem](../research/codex-probe-report.md) usou o esforço `low` e o modelo resolvido mais barato (`gpt-6-luna`), e o modelo do revisor foi resolvido pelo cache.

## Por que dois revisores no nível high

Uma onda `high` no host Claude Code recebe a Dual review quando `codex` está no PATH: o revisor Claude e um revisor Codex leem o mesmo pacote em paralelo, e o coordenador mescla os achados. Um modelo compartilha os próprios pontos cegos, e por isso a segunda leitura vem de outro modelo. As ondas `medium` mantêm um único revisor, então o custo delas não muda, e `review.dual: off` sempre roda um só. Veja [Revisão e gates](../concepts/review-and-gates.md) e o [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md). Para uma onda de risco ainda maior no Claude Code, você também pode executar `/code-review ultra` manualmente depois; o `/emet` nunca o despacha por conta própria. `/code-review ultra` é um comando do Claude Code; esta página não documenta nenhum equivalente no Codex.

## O que você define uma vez, por conta própria (Claude Code)

No host Claude Code, o `/emet` não consegue trocar isso no meio de uma execução. Isso fica no `~/.claude/settings.json` do Claude Code; o host Codex não lê esse arquivo, e seus modelos vêm da seção `codex` acima.

- `model: "opusplan"` em `~/.claude/settings.json`: é isso que faz as Fases 1–4 rodarem no Opus e a Fase 5 em diante rodarem no Sonnet, sem precisar de `/model`. O `emet doctor` avisa (sem nunca editar as suas configurações) se ele não estiver definido.
- Um esforço de sessão `medium` ou `high` em vez de `xhigh`: os workers e o revisor já carregam o próprio esforço independentemente do seu, e um padrão global alto sobretudo acrescenta custo aos turnos do próprio coordenador (controle de despacho, merges, relatórios) que não precisam dele.
- `permissions.defaultMode` capaz de rodar sem acompanhamento (`auto`, `acceptEdits` ou `bypassPermissions`), mais regras `permissions.deny` que bloqueiam `git push * main|master` e `git push --force *`. O `emet doctor` avisa sobre ambos, já que uma onda que trava em um prompt de permissão ou que consegue forçar a passagem pelo branch do trunk derrota o objetivo de rodar sem acompanhamento.

Estes são pontos de partida, não números definitivos. O Opus 5.5 foi lançado em 2026-09-22, e a escolha de esforço/modelo para agentes de código ainda é uma área ativa; reajuste depois de algumas ondas reais em vez de tratar esta tabela como final.

## Verificar

Execute `emet doctor`. Ele avisa quando `model: "opusplan"`, o esforço da sessão ou `permissions.defaultMode` em `~/.claude/settings.json` diferem dos pontos de partida acima.
