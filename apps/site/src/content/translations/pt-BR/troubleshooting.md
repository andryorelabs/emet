---
title: Solução de problemas
description: Falhas do emet doctor e do emet preflight, agrupadas pelo que você vê, cada uma com a causa e uma correção.
seoTitle: Solução de problemas do emet doctor e preflight
sourceHash: 2945f96c25af7fb6
---

Falhas do `emet doctor` e do `emet preflight`, agrupadas pelo que você vê, cada uma com a causa e uma correção. Os termos seguem o [GLOSSARY.md](../GLOSSARY.md). Para saber como as verificações se encaixam, veja a [arquitetura](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Um repositório que ainda tem apenas `forge.config.json`, `.forge/` ou variáveis `FORGE_*` continua funcionando: o `emet` lê os nomes legados, imprime uma linha no stderr nomeando cada arquivo legado, e o `emet migrate` os renomeia.

- [Sem emet.config.json](#sem-emetconfigjson)
- [emet.config.json está malformado](#emetconfigjson-está-malformado)
- [docs/agents ainda tem marcadores TODO(emet)](#docsagents-ainda-tem-marcadores-todoemet)
- [Uma verificação de dependência falha](#uma-verificação-de-dependência-falha)
- [não documenta mais uma flag em --help](#não-documenta-mais-uma-flag-em---help)
- [Um arquivo instalado está ausente ou foi editado desde a instalação](#um-arquivo-instalado-está-ausente-ou-foi-editado-desde-a-instalação)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [Sem slots de worker livres](#sem-slots-de-worker-livres)
- [Worktrees bloqueados esperados, encontrados menos](#worktrees-bloqueados-esperados-encontrados-menos)
- [Um ticket é reivindicado por vários worktrees ou branches](#um-ticket-é-reivindicado-por-vários-worktrees-ou-branches)
- [requiredCommands fora do PATH](#requiredcommands-fora-do-path)
- [Veja também](#veja-também)

## Sem emet.config.json

**Sintoma:** o `emet doctor` imprime `no emet.config.json — run "emet init" here`.

**Causa:** O repositório ainda não tem configuração do `/emet`.

**Correção:** Execute `emet init` na raiz do repositório, depois revise a configuração gerada e preencha os arquivos de `docs/agents/`.

## emet.config.json está malformado

**Sintoma:** `emet.config.json is malformed: <reason>`; o `emet preflight` termina com código 2.

**Causa:** A configuração é JSON estrito e é validada contra `emet/schema/emet.config.schema.json`. Comentários e vírgulas finais são rejeitados.

**Correção:** Corrija o campo nomeado no motivo, ou regenere com `emet init --force`.

## docs/agents ainda tem marcadores TODO(emet)

**Sintoma:** `docs/agents/ still has N TODO(emet): marker(s)`; o `emet doctor` também informa um `docs/agents/<file>` ausente.

**Causa:** O `emet init` deixa um marcador onde quer que não consiga detectar um valor.

**Correção:** Preencha cada linha marcada, ou resolva-as e execute `emet init --force`. O preflight se recusa a despachar enquanto restar algum.

## Uma verificação de dependência falha

**Sintoma:** linhas `dependency: ...` no `emet doctor`, ou uma falha de dependência bloqueante no `emet preflight` (por exemplo `gh` ausente ou não autenticado, ou o plugin mattpocock-skills ausente ou em uma versão não testada).

**Causa:** O `/emet` precisa de `git`, `gh` e do plugin mattpocock-skills; veja `emet/src/dependencies.ts` e `emet/src/skills.ts`.

**Correção:** Instale ou autentique a ferramenta, ou execute `/setup-matt-pocock-skills`. Se uma verificação estiver errada para o seu ambiente, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` a rebaixa a um aviso.

## não documenta mais uma flag em --help

**Sintoma:** `<tool> no longer documents <flags> in --help — emet relies on it`, ou `could not be run — cannot verify <flags>`.

**Causa:** O `emet doctor` verifica as flags das quais o `emet` depende, não apenas se o binário existe. A versão instalada removeu ou renomeou uma delas.

**Correção:** Instale uma versão da ferramenta que ainda documente a flag.

## Um arquivo instalado está ausente ou foi editado desde a instalação

**Sintoma:** `~/<path> is missing — re-run install.sh` ou `~/<path> was edited since install`.

**Causa:** A cópia instalada não corresponde mais ao manifesto de instalação.

**Correção:** Execute o `install.sh` de novo. Se houver um arquivo `.new` pendente ao lado de um arquivo editado, mescle-o ou apague-o.

## Stop hook error: forge: No such file or directory

**Sintoma:** o Claude Code imprime `Stop hook error: … forge: No such file or directory` (ou o mesmo para `emet`) ao final de cada turno.

**Causa:** O `~/.claude/settings.json` ainda tem um hook `forge guard` ou `emet guard` cujo binário foi movido ou removido.

**Correção:** Execute `emet doctor .`. Ele lista cada hook guard morto com seu evento e imprime um comando `cp … && jq …` que faz backup do `settings.json` e remove somente esses hooks. O doctor nunca edita o arquivo por conta própria.

## Sem slots de worker livres

**Sintoma:** `No free worker slots at all: 0 free out of N`, ou `only K/N worker slot(s) free`.

**Causa:** Cada slot em `~/.local/state/emet/slots` está nas mãos de uma execução viva ou ociosa, então a onda não consegue ser despachada por completo.

**Correção:** Espere uma execução liberar um slot, ou execute `emet cleanup --run <runId>` para uma execução que você sabe que terminou. O `emet status` mostra quem tem o quê.

## Worktrees bloqueados esperados, encontrados menos

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Sintoma:** `Expected N locked worktree(s) for run <id>, found M`.

**Causa:** Os workers não reivindicaram seu worktree com o motivo de bloqueio, ou `isolation: "worktree"` os colocou em outro lugar. Veja [`incidents.md`](../emet/reference/incidents.md).

**Correção:** Verifique `git worktree list --porcelain` para ver as entradas bloqueadas, e `emet lock-reason` para o formato de motivo esperado.

## Um ticket é reivindicado por vários worktrees ou branches

**Sintoma:** `<ticket> is claimed by N worktrees`, `has N branches`, ou `is checked out on branch ..., but its own lock names ticket ...`.

**Causa:** Uma nova tentativa ou um shell roteado incorretamente deixou um duplicado.

**Correção:** Mantenha o worktree ou a branch canônicos, apague ou bloqueie de novo o restante, e execute o `emet preflight` novamente.

## requiredCommands fora do PATH

**Sintoma:** `preflight.requiredCommands not on PATH: <names>`.

**Causa:** `preflight.requiredCommands` no `emet.config.json` lista binários de que o repositório precisa.

**Correção:** Instale os binários nomeados, ou remova-os da configuração se não forem mais necessários.

## Host Codex

Isto vale quando `agentHost` é `"codex"`. Veja [Executando o emet no Codex](guide/codex.md).

**Um `codex` mais antigo que `codex.minVersion`.** O `emet doctor .` informa isso. Instale a CLI `codex` na versão de `codex.minVersion` (padrão `0.167.0`) ou mais nova e execute `emet doctor .` de novo.

**Uma flag `--json` ou `--output-schema` ausente.** O `emet doctor .` informa um `codex exec` que não documenta uma das duas flags, e o emet depende de ambas para iniciar workers e reviewers. Instale uma versão do `codex` que ainda as documente.

**Um modelo configurado não está na lista.** O emet resolve os modelos em `models_cache.json` no home da execução, ou, se não houver, no seu home real do Codex (somente leitura). Um slug que não está na lista é substituído e a substituição é registrada. Se nada for resolvido, `emet review-run` falha antes da chamada ao modelo, informando o papel e os slugs listados. Defina um slug da lista em `codex.models`; veja a [referência de configuração](reference/configuration.md#codex).

## Veja também

- [Índice da documentação](README.md)
- [README](../README.md)
- [Primeiros passos](guide/getting-started.md)
- [Referência de configuração](reference/configuration.md)
- [Referência de dependências](reference/dependencies.md)
