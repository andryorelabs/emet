---
title: Controllo della flotta
description: Controlla un numero qualsiasi di repository in una volta con emet doctor, in sola lettura, e scopri quali richiedono attenzione.
seoTitle: "Controllo della flotta: più repo con emet doctor"
sourceHash: 1d421e4c50bc2c59
---

Usi già emet in più repo? `emet doctor` ne controlla un numero qualsiasi in una volta, in sola lettura:

```bash
emet doctor ~/code/*
```

Per ogni repo il report indica: un `emet.config.json` valido, tutti e quattro i file `docs/agents/*.md` presenti, nessun marcatore `TODO(emet):` rimasto, se i comandi in `commands.selfCheck` si risolvono davvero e i risultati sulle dipendenze specifiche del tracker del repo (`gh`, Linear; vedi il [riferimento delle dipendenze](../reference/dependencies.md)). Il plugin mattpocock-skills e i flag delle CLI esterne (`gh`, `claude --bg`, `claude agents --json`, verificati tramite `--help`) vengono controllati una sola volta per l'intera scansione, non per ogni repo.

`emet doctor` verifica i flag stessi, non solo che i binari esistano. Legge `--help` per `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) e `claude agents` (`--json`) e segnala ogni flag che una CLI più recente o più vecchia non documenta più. Un flag rinominato farebbe altrimenti fallire un'ondata a metà. Sull'host Codex controlla inoltre `codex` rispetto a `codex.minVersion` e `codex exec` per `--json` e `--output-schema`; vedi [Eseguire emet su Codex](codex.md).

Ogni sonda è limitata a 5 s, così un `gh auth status` bloccato (senza rete) non può fermare un'ondata. Le `preflight.requiredCommands` di un repo sono un elenco, gestito dal repo, di binari che `emet preflight` e `emet doctor` richiedono nel PATH. Vedi il [riferimento della CLI](../reference/cli.md#controllo-della-flotta) e il [riferimento della configurazione](../reference/configuration.md#preflight).
