---
title: Arquitetura
description: Um mapa do código de emet/src e como os prompts do /emet o conduzem.
seoTitle: Arquitetura do emet
sourceHash: ac65f41cf78af13e
---

Um mapa do código de `emet/src` e como os prompts do `/emet` o conduzem. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md); as decisões por trás desse formato ficam em [docs/adr](../adr/README.md). Para problemas, veja a [solução de problemas](../troubleshooting.md).

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

| Fase                                        | Prompt                                                                                        | Chamadas à CLI                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 entrevista, spec, tickets, aprovação    | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 despacho e workers                      | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 revisão, gate, aterrissagem, encerramento | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 handoff e encadeamento                    | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

O coordenador é o único que escreve no tracker (ADR-0005): os workers informam por meio de uma nota de handoff e do `emet results`, e o coordenador as publica. O `emet guard` roda como um hook `PreToolUse` e bloqueia gatilhos conhecidos de falhas em execuções sem supervisão.

## Mapa de módulos

Cada módulo tem um `*.test.ts` ao lado. `tools/architecture-map.test.ts` falha quando um módulo que não seja de teste em `emet/src` está ausente desta lista.

**Configuração, instalação e auditoria**

- `init.ts` grava a configuração e o esqueleto de documentos; `config.ts` lê `emet.config.json` (o `forge.config.json` legado ainda é lido); `names.ts` resolve um nome para sua grafia atual ou legada.
- `doctor.ts` é a varredura de frota; `preflight.ts` verifica a higiene do despacho; `dependencies.ts` e `skills.ts` (o contrato com o mattpocock-skills) verificam o que uma execução precisa; `map.ts` grava o resumo do código; `plugin-detect.ts` informa quais plugins estão instalados.
- `setup.ts` instala os extras opcionais, `setupledger.ts` registra cada mudança para que possa ser desfeita, e `settingsapply.ts` guarda as configurações recomendadas do Claude Code.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` e `self-host-codex.ts` implementam o `emet self`: instalação, instalações a partir do código-fonte, atualizações e os arquivos de cada host. `hooks-merge.ts` mescla os hooks do emet nas configurações do host, `uninstall.ts` desfaz uma instalação a partir do ledger, `migrate.ts` migra nomes legados, `update-notice.ts` e `whats-new.ts` avisam a pessoa sobre novas versões, e `embedded-tree.generated.ts` guarda os arquivos embutidos no binário compilado.
- `assets.ts` lê esses arquivos embutidos.

**Estado de execução**

- `claims.ts` guarda as reservas de tickets, `slots.ts` o pool de slots de workers, `resources.ts` os dados do host, `runs.ts` a atividade e `runcurrent.ts` a execução atual de um checkout.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` e `landed.ts` gerenciam worktrees, locks e a limpeza de branches que já aterrissaram.
- `status.ts` informa ondas e sessões, `launch.ts` e `chain.ts` iniciam execuções e a próxima onda sem supervisão, `fleet.ts` trabalha em vários repositórios e `phase.ts` registra a fase atual.
- `signals.ts` faz a limpeza em uma interrupção.

**Tracker e specs**

- `tracker.ts` e `tracker-files.ts` (o tracker local `.scratch/`) leem e escrevem tickets, `ticketclose.ts` os fecha, `validate.ts` verifica a cobertura da spec, `approve.ts` registra a aprovação e `surfaces.ts` encontra sobreposição de superfícies de edição.
- `specmerge.ts` incorpora os deltas de spec nas specs vivas; `specbranch.ts`, `speclanding.ts` e `specabandon.ts` gerenciam o branch `spec/<id>`; `landing-unit.ts` resolve se uma execução aterrissa por spec ou por onda; `afterspec.ts` e `promote.ts` executam a etapa posterior à spec.

**Handoff do worker**

- `handoff.ts`, `results.ts` e `materializelog.ts` levam ao coordenador o que um worker informa, e `mailbox.ts` é a caixa de correio da CLI para os workers do Codex.

**Revisão e aterrissagem**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (o livro de achados), `review-run.ts` (o revisor do Codex), `assess.ts` (o classificador de risco), `gate.ts`, `land.ts` e `ci.ts` verificam, revisam e aterrissam uma onda. `deploycheck.ts` executa a verificação pós-deploy.

**Journal, atenção e relatórios**

- `journal.ts` acrescenta eventos e `insights.ts` os lê; `attention.ts` registra o estado de atenção de uma sessão e `attention-alert.ts` dispara o alerta; `metrics.ts` e `usage.ts` informam custo e resultados.
- `memory.ts` e `engram-client.ts` buscam e salvam lições no Engram.

**Segurança**

- `guard.ts`, `guard-destructive.ts` e `guard-codex.ts` são os hooks de guarda.

**Infraestrutura dos comandos e utilitários compartilhados**

- `commands.ts` descreve os comandos e suas flags, `flags.ts` as flags que todo comando aceita, `envelope.ts` a saída `--json`, `errors.ts` os códigos de erro, `exit-codes.ts` e `exit-code.ts` os códigos de saída, `env.ts` a visão do ambiente, `color.ts` e `banner.ts` a saída do terminal, e `present.ts`, `narrow.ts` e `optional.ts` pequenos utilitários de estreitamento.
- `test-preload.ts` e `expect-rejection.ts` dão suporte aos testes.

Os valores específicos de cada host ficam atrás da interface `AgentHost` em `agenthost.ts`: `agenthost-claude.ts` é o adaptador do Claude Code e `agenthost-codex.ts` o do Codex, escolhidos por `agentHost` na configuração. O lado Codex adiciona `codex-models.ts` (resolução de modelos), `codex-home.ts` (camada `CODEX_HOME` por execução), `codex-process.ts` e `codex-session.ts` (executor de processos e passagem de bastão), `codex-usage.ts` (uso a partir de `exec --json`), `guard-codex.ts` (entrada de hooks e portão de aprovação) e `dispatch.ts`. Veja o [guia do Codex](../how-to/use-codex.md).

## Organização dos prompts

`commands/run.md` (cerca de 130 linhas) é o roteador do `/emet` no Claude Code; no Codex, os `codex/skills/**` e `codex/hooks.json` gerados cumprem esse papel. Cada arquivo de `emet/reference/` é um grupo de fases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), carregado somente quando o modo da execução atual precisa dele. Um teste falha se qualquer um deles passar de 20.000 bytes, para que um único arquivo não tome conta do contexto depois de uma compactação. As fases instruem o coordenador a reler a seção relevante antes de cada rodada de correção ou revisão. O `emet self install` apaga um `phases-8-closeout.md` remanescente que ainda coincide com o manifesto de instalação e, caso contrário, o separa como `phases-8-closeout.md.retired`; esse arquivo foi dividido em `phases-8-review.md` (revisão e gate) e `phases-8-landing.md` (aterrissagem e encerramento). O `phases-8-spec-landing.md` guarda as regras de `landing.unit: spec`: integrar cada onda em `spec/<id>`, sincronizar o tronco e aterrissar o spec uma única vez. O `emet self install` também mescla os hooks do emet, entre eles o `emet guard` como o hook `PreToolUse`, em `~/.claude/settings.json`.

## Distribuição

O `emet self install` coloca o binário independente, grava os prompts reescritos em `~/.claude/` e, com `--from <checkout>`, copia o código-fonte de `emet/` para `~/.claude/emet`. O plugin do Codex é descrito por `.codex-plugin/plugin.json`, gerado com `bun run build:codex` junto com `codex/skills/**` e `codex/hooks.json`. O caminho do plugin do Claude Code traz um shim que baixa um binário independente com checksum verificado, construído por `tools/build-binaries.ts`. Veja o [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## Veja também

- [Primeiros passos](../start/install.md) e [Trackers e aterrissagem](../how-to/configure-tracker.md)
- [Referência de configuração](../reference/configuration.md), [referência da CLI](../reference/cli.md) e [Dependências](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) e [emet/AGENTS.md](../../emet/AGENTS.md)
- [Índice da documentação](../README.md)
