---
title: Arquitetura
description: Um mapa do código de emet/src e como os prompts do /emet o conduzem.
seoTitle: Arquitetura do emet
sourceHash: ff28425abc92b5c9
---

Um mapa do código de `emet/src` e como os prompts do `/emet` o conduzem. Os termos seguem o [GLOSSARY.md](../GLOSSARY.md); as decisões por trás desse formato ficam em [docs/adr](adr/README.md). Para problemas, veja a [solução de problemas](troubleshooting.md).

- [Forma](#forma)
- [Como os prompts conduzem a CLI](#como-os-prompts-conduzem-a-cli)
- [Mapa de módulos](#mapa-de-módulos)
- [Organização dos prompts](#organização-dos-prompts)
- [Distribuição](#distribuição)
- [Veja também](#veja-também)

## Forma

Há duas metades. Os prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, e os `codex/skills/**` e `codex/hooks.json` gerados para o Codex) dizem ao agente o que fazer em cada fase. A CLI `emet` (`emet/bin/emet.ts` e `emet/src/`) faz tudo o que precisa ser determinístico: verificações, reivindicações, slots, gates, escritas no tracker e aterrissagem. Os prompts nunca reimplementam uma verificação que a CLI já faz.

`emet/bin/emet.ts` é um despachante fino: lê o primeiro argumento e repassa a um módulo de subcomando, que lê sozinho o restante de `process.argv`. Os códigos de saída têm significado em todos os subcomandos.

## Como os prompts conduzem a CLI

`commands/run.md` é um roteador curto. Ele carrega um arquivo de fase de `emet/reference/` por vez, de modo que uma compactação nunca perde as regras da fase atual.

| Fase                                        | Prompt                                       | Chamadas à CLI                                                                |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 entrevista, spec, tickets, aprovação    | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 despacho e workers                      | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 revisão, gate, aterrissagem, encerramento | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 handoff e encadeamento                    | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

O coordenador é o único que escreve no tracker (ADR-0005): os workers informam por meio de uma nota de handoff e do `emet results`, e o coordenador as publica. O `emet guard` roda como um hook `PreToolUse` e bloqueia gatilhos conhecidos de falhas em execuções sem supervisão.

## Mapa de módulos

Cada módulo tem um `*.test.ts` ao lado.

| Área                       | Módulos                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuração e auditoria   | `init.ts` (configuração e esqueleto de documentos), `config.ts` (`emet.config.json`, o `forge.config.json` legado ainda é lido), `doctor.ts` (varredura de frota), `preflight.ts` (higiene do despacho), `dependencies.ts`, `skills.ts` (contrato com o mattpocock-skills), `map.ts` (resumo do código) |
| Estado de execução         | `claims.ts` (reservas de tickets), `slots.ts` (pool de slots de workers), `resources.ts` (dados do host), `runs.ts` (atividade), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                                                     |
| Tracker                    | `tracker.ts`, `tracker-files.ts` (tracker local `.scratch/`), `validate.ts` (cobertura da spec), `specmerge.ts`, `approve.ts`, `surfaces.ts` (sobreposição de superfícies de edição)                                                                                                                    |
| Handoff do worker          | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                                                         |
| Revisão e aterrissagem     | `verify.ts`, `reviewpackage.ts`, `review.ts` (livro de achados), `assess.ts` (classificador de risco), `gate.ts`, `land.ts`                                                                                                                                                                             |
| Relatórios                 | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                                                                |
| Segurança                  | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                                                      |
| Utilitários compartilhados | `narrow.ts`, `optional.ts`, `assets.ts` (arquivos embutidos nos binários compilados)                                                                                                                                                                                                                    |

Os valores específicos de cada host ficam atrás da interface `AgentHost` em `agenthost.ts`: `agenthost-claude.ts` é o adaptador do Claude Code e `agenthost-codex.ts` o do Codex, escolhidos por `agentHost` na configuração. O lado Codex adiciona `codex-models.ts` (resolução de modelos), `codex-home.ts` (camada `CODEX_HOME` por execução), `codex-process.ts` e `codex-session.ts` (executor de processos e passagem de bastão), `codex-usage.ts` (uso a partir de `exec --json`), `guard-codex.ts` (entrada de hooks e portão de aprovação), `dispatch.ts` e `review-run.ts`. Veja o [guia do Codex](guide/codex.md).

## Organização dos prompts

`commands/run.md` (cerca de 130 linhas) é o roteador do `/emet` no Claude Code; no Codex, os `codex/skills/**` e `codex/hooks.json` gerados cumprem esse papel. Cada arquivo de `emet/reference/` é um grupo de fases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`), carregado somente quando o modo da execução atual precisa dele. Um teste falha se qualquer um deles passar de 20.000 bytes, para que um único arquivo não tome conta do contexto depois de uma compactação. As fases instruem o coordenador a reler a seção relevante antes de cada rodada de correção ou revisão. O `install.sh` separa um antigo `phases-6-9.md` único como `phases-6-9.md.retired` quando você o editou ou ele é anterior ao manifesto de instalação, e o apaga caso contrário. O `install.sh` também conecta o `emet guard` em `~/.claude/settings.json` como o hook `PreToolUse`.

## Distribuição

O `install.sh` copia `emet/` para `~/.claude/emet` e reescreve os prompts. O plugin do Codex é descrito por `.codex-plugin/plugin.json`, gerado com `bun run build:codex` junto com `codex/skills/**` e `codex/hooks.json`. O caminho do plugin do Claude Code traz um shim que baixa um binário independente com checksum verificado, construído por `tools/build-binaries.ts`. Veja o [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## Veja também

- [Primeiros passos](guide/getting-started.md) e [Trackers e aterrissagem](guide/trackers-and-landing.md)
- [Referência de configuração](reference/configuration.md), [referência da CLI](reference/cli.md) e [Dependências](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) e [emet/AGENTS.md](../emet/AGENTS.md)
- [Índice da documentação](README.md)
