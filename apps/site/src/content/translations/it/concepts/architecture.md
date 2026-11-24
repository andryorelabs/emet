---
title: Architettura
description: Una mappa del codice di emet/src e di come i prompt di /emet la guidano.
seoTitle: Architettura di emet
sourceHash: ac65f41cf78af13e
---

Una mappa del codice di `emet/src` e di come i prompt di `/emet` la guidano. I termini seguono [GLOSSARY.md](../../GLOSSARY.md); le decisioni dietro la struttura sono in [docs/adr](../adr/README.md). Per i problemi, vedi la [risoluzione dei problemi](../troubleshooting.md).

- [Struttura](#struttura)
- [Come i prompt guidano la CLI](#come-i-prompt-guidano-la-cli)
- [Mappa dei moduli](#mappa-dei-moduli)
- [Organizzazione dei prompt](#organizzazione-dei-prompt)
- [Distribuzione](#distribuzione)
- [Vedi anche](#vedi-anche)

## Struttura

Ci sono due metà. I prompt (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, e i `codex/skills/**` e `codex/hooks.json` generati per Codex) dicono all'agente cosa fare in ogni fase. La CLI `emet` (`emet/bin/emet.ts` e `emet/src/`) fa tutto ciò che deve essere deterministico: controlli, claim, slot, gate, scritture sul tracker e landing. I prompt non reimplementano mai un controllo che la CLI già effettua.

`emet/bin/emet.ts` è un dispatcher sottile: legge il primo argomento e passa il controllo a un modulo di sottocomando, che legge da sé il resto di `process.argv`. I codici di uscita hanno lo stesso significato in tutti i sottocomandi.

## Come i prompt guidano la CLI

`commands/run.md` è un router breve. Carica un file di fase di `emet/reference/` alla volta, così una compattazione non perde mai le regole della fase corrente.

| Fase                                       | Prompt                                                                                        | Chiamate alla CLI                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 intervista, spec, ticket, approvazione | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 dispatch e worker                      | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 review, gate, landing, chiusura          | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 handoff e concatenamento                 | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

Il coordinatore è l'unico a scrivere sul tracker (ADR-0005): i worker riferiscono tramite una nota di handoff e `emet results`, e il coordinatore le pubblica. `emet guard` gira come hook `PreToolUse` e blocca gli inneschi noti di fallimenti nelle esecuzioni senza supervisione.

## Mappa dei moduli

Ogni modulo ha un `*.test.ts` accanto. `tools/architecture-map.test.ts` fallisce quando un modulo non di test di `emet/src` manca da questo elenco.

**Configurazione, installazione e verifica**

- `init.ts` scrive la configurazione e lo scheletro dei documenti; `config.ts` legge `emet.config.json` (il vecchio `forge.config.json` è ancora letto); `names.ts` risolve un nome nella sua grafia attuale o precedente.
- `doctor.ts` è la scansione della flotta; `preflight.ts` controlla l'igiene del dispatch; `dependencies.ts` e `skills.ts` (il contratto di mattpocock-skills) controllano ciò che serve a un'esecuzione; `map.ts` scrive la sintesi del codebase; `plugin-detect.ts` riporta quali plugin sono installati.
- `setup.ts` installa gli extra opzionali, `setupledger.ts` registra ogni modifica in modo che si possa annullare, e `settingsapply.ts` contiene le impostazioni consigliate di Claude Code.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` e `self-host-codex.ts` implementano `emet self`: installazione, installazioni da sorgente, aggiornamenti e i file per ogni host. `hooks-merge.ts` unisce gli hook di emet nelle impostazioni dell'host, `uninstall.ts` annulla un'installazione a partire dal ledger, `migrate.ts` sposta i nomi precedenti, `update-notice.ts` e `whats-new.ts` informano la persona sulle nuove release, e `embedded-tree.generated.ts` contiene i file incorporati nel binario compilato.
- `assets.ts` legge quei file incorporati.

**Stato delle esecuzioni**

- `claims.ts` gestisce le prenotazioni dei ticket, `slots.ts` il pool di slot dei worker, `resources.ts` i dati dell'host, `runs.ts` la liveness e `runcurrent.ts` l'esecuzione corrente di un checkout.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` e `landed.ts` gestiscono worktree, lock e la pulizia dei branch già atterrati.
- `status.ts` riporta ondate e sessioni, `launch.ts` e `chain.ts` avviano esecuzioni e l'ondata successiva senza supervisione, `fleet.ts` lavora tra più repo e `phase.ts` registra la fase corrente.
- `signals.ts` ripulisce in caso di interruzione.

**Tracker e spec**

- `tracker.ts` e `tracker-files.ts` (il tracker locale `.scratch/`) leggono e scrivono i ticket, `ticketclose.ts` li chiude, `validate.ts` controlla la copertura delle spec, `approve.ts` registra l'approvazione e `surfaces.ts` trova le sovrapposizioni delle superfici di modifica.
- `specmerge.ts` integra i delta delle spec nelle spec vive; `specbranch.ts`, `speclanding.ts` e `specabandon.ts` gestiscono il branch `spec/<id>`; `landing-unit.ts` stabilisce se un'esecuzione atterra per spec o per ondata; `afterspec.ts` e `promote.ts` eseguono il passaggio successivo alla spec.

**Handoff dei worker**

- `handoff.ts`, `results.ts` e `materializelog.ts` portano al coordinatore ciò che un worker riferisce, e `mailbox.ts` è la casella di posta gestita dalla CLI per i worker Codex.

**Review e landing**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (il ledger dei rilievi), `review-run.ts` (il reviewer Codex), `assess.ts` (il classificatore di rischio), `gate.ts`, `land.ts` e `ci.ts` controllano, rivedono e fanno atterrare un'ondata. `deploycheck.ts` esegue il controllo post-deploy.

**Journal, attenzione e reportistica**

- `journal.ts` aggiunge eventi e `insights.ts` li legge; `attention.ts` registra lo stato di attenzione di una sessione e `attention-alert.ts` genera l'avviso; `metrics.ts` e `usage.ts` riportano costi e risultati.
- `memory.ts` e `engram-client.ts` cercano e salvano lezioni in Engram.

**Sicurezza**

- `guard.ts`, `guard-destructive.ts` e `guard-codex.ts` sono gli hook di protezione.

**Gestione dei comandi e helper condivisi**

- `commands.ts` descrive i comandi e i loro flag, `flags.ts` i flag accettati da ogni comando, `envelope.ts` l'output `--json`, `errors.ts` i codici di errore, `exit-codes.ts` e `exit-code.ts` i codici di uscita, `env.ts` la vista dell'ambiente, `color.ts` e `banner.ts` l'output del terminale, e `present.ts`, `narrow.ts` e `optional.ts` piccoli helper di restringimento dei tipi.
- `test-preload.ts` e `expect-rejection.ts` supportano i test.

I valori specifici di ogni host stanno dietro l'interfaccia `AgentHost` in `agenthost.ts`: `agenthost-claude.ts` è l'adattatore di Claude Code e `agenthost-codex.ts` quello di Codex, scelti da `agentHost` nella configurazione. Il lato Codex aggiunge `codex-models.ts` (risoluzione dei modelli), `codex-home.ts` (overlay `CODEX_HOME` per esecuzione), `codex-process.ts` e `codex-session.ts` (esecutore di processi e passaggio di consegne), `codex-usage.ts` (utilizzo da `exec --json`), `guard-codex.ts` (input degli hook e cancello di approvazione) e `dispatch.ts`. Vedi la [guida a Codex](../how-to/use-codex.md).

## Organizzazione dei prompt

`commands/run.md` (circa 130 righe) è il router di `/emet` su Claude Code; su Codex, i `codex/skills/**` e `codex/hooks.json` generati svolgono quel ruolo. Ogni file in `emet/reference/` è un gruppo di fasi (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), caricato solo quando la modalità dell'esecuzione corrente ne ha bisogno. Un test fallisce se uno qualsiasi supera i 20.000 byte, così un file non può occupare tutto il contesto dopo una compattazione. Le fasi dicono al coordinatore di rileggere la sezione pertinente prima di ogni round di correzione o review. `emet self install` elimina un `phases-8-closeout.md` rimasto che corrisponde ancora al manifest di installazione e altrimenti lo mette da parte come `phases-8-closeout.md.retired`; quel file è diviso in `phases-8-review.md` (review e gate) e `phases-8-landing.md` (landing e chiusura). `phases-8-spec-landing.md` contiene le regole di `landing.unit: spec`: integrare ogni ondata in `spec/<id>`, sincronizzare il trunk e far atterrare la spec una sola volta. `emet self install` unisce inoltre gli hook di emet, tra cui `emet guard` come hook `PreToolUse`, in `~/.claude/settings.json`.

## Distribuzione

`emet self install` colloca il binario standalone, scrive i prompt riscritti sotto `~/.claude/` e, con `--from <checkout>`, copia i sorgenti di `emet/` in `~/.claude/emet`. Il plugin Codex è descritto da `.codex-plugin/plugin.json`, generato con `bun run build:codex` insieme a `codex/skills/**` e `codex/hooks.json`. Il percorso del plugin di Claude Code distribuisce uno shim che scarica un binario standalone con checksum verificato, costruito da `tools/build-binaries.ts`. Vedi [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## Vedi anche

- [Per iniziare](../start/install.md) e [Tracker e landing](../how-to/configure-tracker.md)
- [Riferimento della configurazione](../reference/configuration.md), [riferimento della CLI](../reference/cli.md) e [Dipendenze](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) e [emet/AGENTS.md](../../emet/AGENTS.md)
- [Indice della documentazione](../README.md)
