---
title: Controllo della flotta
description: Controlla un numero qualsiasi di repository in una volta con emet doctor, in sola lettura, e scopri quali richiedono attenzione.
seoTitle: "Controllo della flotta: più repo con emet doctor"
sourceHash: 7b3c5a56abfffcc1
---

Usi già emet in più repo? `emet doctor` ne controlla un numero qualsiasi in una volta, in sola lettura:

```bash
emet doctor ~/code/*
```

Per ogni repo il report indica: un `emet.config.json` valido, tutti e quattro i file `docs/agents/*.md` presenti, nessun marcatore `TODO(emet):` rimasto, se i comandi in `commands.selfCheck` si risolvono davvero e i risultati sulle dipendenze specifiche del tracker del repo (`gh`, Linear; vedi il [riferimento delle dipendenze](../reference/dependencies.md)). Il plugin mattpocock-skills e i flag delle CLI esterne (`gh`, più quelli della CLI propria dell'Agent host: su Claude Code `claude --bg` e `claude agents --json`, su Codex `codex exec --json` e `--output-schema`, tutti verificati tramite `--help`) vengono controllati una sola volta per l'intera scansione, non per ogni repo.

`emet doctor` verifica i flag stessi, non solo che i binari esistano. Legge `--help` per `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) e, su Claude Code, `claude` (`--bg`) e `claude agents` (`--json`) e segnala ogni flag che una CLI più recente o più vecchia non documenta più. Un flag rinominato farebbe altrimenti fallire un'ondata a metà. I controlli su `claude` e `claude agents` sono quelli dell'host Claude Code. Sull'host Codex i controlli sui flag dell'host li sostituiscono invece di aggiungersi: `emet doctor` controlla `codex exec` per `--json` e `--output-schema` (`hostCliFlagRequirements` in `emet/src/doctor.ts`). Non confronta la versione di `codex` con `codex.minVersion`; vedi [Eseguire emet su Codex](codex.md).

## Modificare e avviare su più repo

`emet fleet` lavora sui repo che hanno un `emet.config.json` un livello sotto una radice (predefinita `~/code`):

```bash
emet fleet list --root ~/code
emet fleet set handoff.autoChain false --dry-run
emet fleet launch --feature "add dark mode" --repos app,site
```

- `list` stampa, per ogni repo, il percorso, `tracker.kind`, `handoff.autoChain` e `models.worker`. `--json` lo stampa come dati.
- `set <key> <value>` modifica una chiave di configurazione in ogni repo elencato. Ogni valore viene validato dal loader della configurazione prima di scrivere qualsiasi cosa; un valore non valido non modifica nessun repo e termina con codice 1. `--dry-run` non scrive nulla e stampa il valore vecchio e quello nuovo di ogni repo.
- `launch --feature <text>` apre una sessione `/emet:run --draft <text>` in ogni repo, dopo gli stessi controlli di prontezza di `emet chain`. `--repos` la limita a un elenco separato da virgole.

Ogni sonda è limitata a 5 s, così un `gh auth status` bloccato (senza rete) non può fermare un'ondata. Le `preflight.requiredCommands` di un repo sono un elenco, gestito dal repo, di binari che `emet preflight` e `emet doctor` richiedono nel PATH. Vedi il [riferimento della CLI](../reference/cli.md#controllo-della-flotta) e il [riferimento della configurazione](../reference/configuration.md#preflight).

## Vedere le sessioni bloccate

Quando una sessione attende una decisione, `emet fleet status` mostra quali repo hanno sessioni bloccate, quelli bloccati per primi:

```bash
emet fleet status
emet fleet status --json
```

Legge il journal globale, quindi non serve alcuna radice né alcun controllo sui repo. Per ogni repo stampa `<repo>: <b> blocked, <w> working, <i> idle`, considerando le sessioni delle ultime 24 ore (esclusa `ended`). Dentro un repo, `emet status` elenca le sessioni in `sessions[]`. Per disattivare l'avviso alla transizione, imposta [`attention.alert`](../reference/configuration.md#attention) a `false`.
