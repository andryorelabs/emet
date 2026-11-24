---
title: Controllo della flotta
description: Controlla un numero qualsiasi di repository in una volta con emet doctor, in sola lettura, e scopri quali richiedono attenzione.
seoTitle: "Controllo della flotta: più repo con emet doctor"
sourceHash: 511c25889b2a8244
---

Controlla, modifica e avvia emet su più repo contemporaneamente. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## Prerequisiti

- emet installato; vedi [Installazione](../start/install.md).
- Ogni repo ha un `emet.config.json` e si trova un livello sotto una radice (predefinita `~/code`).
- `gh` nel `PATH`, autenticato; vedi il [riferimento delle dipendenze](../reference/dependencies.md).

## Controllare i repo

:::steps

1. Esegui il controllo in sola lettura su un numero qualsiasi di repo:

   ```bash
   emet doctor ~/code/*
   ```

2. Leggi il report per repo: un `emet.config.json` valido, tutti e quattro i file `docs/agents/*.md`, nessun marcatore `TODO(emet):` rimasto, comandi `commands.selfCheck` che si risolvono e i risultati sulle dipendenze del tracker di quel repo.
3. Leggi i risultati validi per l'intera scansione, stampati una sola volta: il plugin mattpocock-skills e i flag delle CLI esterne, verificati tramite `--help` (`gh` e, su Claude Code, `claude --bg` e `claude agents --json`, su Codex `codex exec --json` e `--output-schema`). Un flag rinominato viene segnalato qui prima che faccia fallire un'ondata.

:::

## Modificare un'impostazione in ogni repo

:::steps

1. Elenca ciò che ogni repo ha adesso:

   ```bash
   emet fleet list --root ~/code
   ```

   Stampa il percorso di ogni repo, `tracker.kind`, `handoff.autoChain` e `models.worker`; `--json` lo stampa come dati.

2. Visualizza l'anteprima della modifica:

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` non scrive nulla e stampa il valore vecchio e quello nuovo di ogni repo.

3. Applicala eseguendo lo stesso comando senza `--dry-run`. Il valore viene prima validato dal loader della configurazione; un valore non valido non modifica nessun repo e termina con codice 1.

:::

## Avviare una funzionalità in più repo

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

Apre una sessione `/emet:run --draft <text>` in ogni repo, dopo gli stessi controlli di prontezza di `emet chain`. `--repos` la limita a un elenco separato da virgole.

## Vedere le sessioni bloccate

```bash
emet fleet status
```

Stampa, per ogni repo, quante sessioni emet sono bloccate in attesa di una decisione, in esecuzione o inattive, con i repo bloccati per primi. Legge le ultime 24 ore del journal globale ed esclude le sessioni terminate; `--json` stampa le sessioni. Dentro un repo, `emet status` le elenca sotto `sessions`. Vedi [Attenzione e journal](../concepts/attention-and-journal.md) e il [riferimento della configurazione](../reference/configuration.md#attention).

## Verifica

:::steps

1. Esegui di nuovo `emet doctor ~/code/*` e conferma che nessun repo segnali un errore.
2. Esegui `emet fleet list --root ~/code` e conferma che la chiave modificata mostri il nuovo valore in ogni repo.
3. Esegui `emet fleet status` e conferma che nessun repo sia bloccato in modo inatteso.

:::

Ogni sonda è limitata a 5 s, così un `gh auth status` bloccato non può fermare un'ondata. `preflight.requiredCommands` è un elenco, gestito dal repo, di binari che `emet preflight` e `emet doctor` richiedono; vedi il [riferimento della CLI](../reference/cli.md#fleet-check) e il [riferimento della configurazione](../reference/configuration.md#preflight).
