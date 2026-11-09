---
title: Architettura
description: Una mappa del codice di emet/src e di come i prompt di /emet la guidano.
seoTitle: Architettura di emet
sourceHash: 3145bbde94eade03
---

Una mappa del codice di `emet/src` e di come i prompt di `/emet` la guidano. I termini seguono [GLOSSARY.md](../GLOSSARY.md); le decisioni dietro la struttura sono in [docs/adr](adr/README.md). Per i problemi, vedi la [risoluzione dei problemi](troubleshooting.md).

- [Struttura](#struttura)
- [Come i prompt guidano la CLI](#come-i-prompt-guidano-la-cli)
- [Mappa dei moduli](#mappa-dei-moduli)
- [Organizzazione dei prompt](#organizzazione-dei-prompt)
- [Distribuzione](#distribuzione)
- [Vedi anche](#vedi-anche)

## Struttura

Ci sono due metà. I prompt (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`) dicono a Claude cosa fare in ogni fase. La CLI `emet` (`emet/bin/emet.ts` e `emet/src/`) fa tutto ciò che deve essere deterministico: controlli, claim, slot, gate, scritture sul tracker e landing. I prompt non reimplementano mai un controllo che la CLI già effettua.

`emet/bin/emet.ts` è un dispatcher sottile: legge il primo argomento e passa il controllo a un modulo di sottocomando, che legge da sé il resto di `process.argv`. I codici di uscita hanno lo stesso significato in tutti i sottocomandi.

## Come i prompt guidano la CLI

`commands/run.md` è un router breve. Carica un file di fase di `emet/reference/` alla volta, così una compattazione non perde mai le regole della fase corrente.

| Fase                                       | Prompt                                       | Chiamate alla CLI                                                             |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 intervista, spec, ticket, approvazione | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 dispatch e worker                      | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 review, gate, landing, chiusura          | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 handoff e concatenamento                 | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

Il coordinatore è l'unico a scrivere sul tracker (ADR-0005): i worker riferiscono tramite una nota di handoff e `emet results`, e il coordinatore le pubblica. `emet guard` gira come hook `PreToolUse` e blocca gli inneschi noti di fallimenti nelle esecuzioni senza supervisione.

## Mappa dei moduli

Ogni modulo ha un `*.test.ts` accanto.

| Area                      | Moduli                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurazione e verifica | `init.ts` (configurazione e scheletro dei documenti), `config.ts` (`emet.config.json`, il vecchio `forge.config.json` è ancora letto), `doctor.ts` (scansione della flotta), `preflight.ts` (igiene del dispatch), `dependencies.ts`, `skills.ts` (contratto di mattpocock-skills), `map.ts` (sintesi del codebase) |
| Stato delle esecuzioni    | `claims.ts` (prenotazioni dei ticket), `slots.ts` (pool di slot dei worker), `resources.ts` (dati dell'host), `runs.ts` (liveness), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                                                              |
| Tracker                   | `tracker.ts`, `tracker-files.ts` (tracker locale `.scratch/`), `validate.ts` (copertura delle spec), `specmerge.ts`, `approve.ts`, `surfaces.ts` (sovrapposizione delle superfici di modifica)                                                                                                                      |
| Handoff dei worker        | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                                                                     |
| Review e landing          | `verify.ts`, `reviewpackage.ts`, `review.ts` (ledger dei rilievi), `assess.ts` (classificatore di rischio), `gate.ts`, `land.ts`                                                                                                                                                                                    |
| Reportistica              | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                                                                            |
| Sicurezza                 | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                                                                  |
| Helper condivisi          | `narrow.ts`, `optional.ts`, `assets.ts` (file incorporati nei binari compilati)                                                                                                                                                                                                                                     |

I valori specifici di ogni host stanno dietro l'interfaccia `AgentHost` in `agenthost.ts`: `agenthost-claude.ts` è l'adattatore di Claude Code e `agenthost-codex.ts` quello di Codex, scelti da `agentHost` nella configurazione. Il lato Codex aggiunge `codex-models.ts` (risoluzione dei modelli), `codex-home.ts` (overlay `CODEX_HOME` per esecuzione), `codex-process.ts` e `codex-session.ts` (esecutore di processi e passaggio di consegne), `codex-usage.ts` (utilizzo da `exec --json`), `guard-codex.ts` (input degli hook e cancello di approvazione), `dispatch.ts` e `review-run.ts`. Vedi la [guida a Codex](guide/codex.md).

## Organizzazione dei prompt

`commands/run.md` (circa 130 righe) è il router di `/emet`. Ogni file in `emet/reference/` è un gruppo di fasi (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`), caricato solo quando la modalità dell'esecuzione corrente ne ha bisogno. Un test fallisce se uno qualsiasi supera i 20.000 byte, così un file non può occupare tutto il contesto dopo una compattazione. Le fasi dicono al coordinatore di rileggere la sezione pertinente prima di ogni round di correzione o review. `install.sh` mette da parte un vecchio `phases-6-9.md` unico come `phases-6-9.md.retired` quando è stato modificato o è anteriore al manifesto di installazione, e altrimenti lo elimina. `install.sh` collega inoltre `emet guard` in `~/.claude/settings.json` come hook `PreToolUse`.

## Distribuzione

`install.sh` copia `emet/` in `~/.claude/emet` e riscrive i prompt. Il percorso del plugin distribuisce uno shim che scarica un binario standalone con checksum verificato, costruito da `tools/build-binaries.ts`. Vedi [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## Vedi anche

- [Per iniziare](guide/getting-started.md) e [Tracker e landing](guide/trackers-and-landing.md)
- [Riferimento della configurazione](reference/configuration.md), [riferimento della CLI](reference/cli.md) e [Dipendenze](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) e [emet/AGENTS.md](../emet/AGENTS.md)
- [Indice della documentazione](README.md)
