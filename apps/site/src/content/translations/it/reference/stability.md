---
title: Stabilità
description: Ciò che emet promette di non rompere e ciò che si riserva il diritto di cambiare.
seoTitle: Stabilità di emet
sourceHash: 5a596d218f43a27d
---

Ciò che emet promette di non rompere e ciò che si riserva il diritto di cambiare. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## Superfici stabili

Una modifica a una superficie stabile che rompe un chiamante esistente è un breaking change. Attende una versione major ed è segnalata in [CHANGELOG.md](../../CHANGELOG.md).

- **Flag della CLI.** I sottocomandi e i flag elencati nel [riferimento della CLI](cli.md). Un flag non viene rimosso né cambia significato; possono essere aggiunti nuovi flag.
- **Codici di uscita.** `0` pulito, `1` riscontri su cui intervenire, `2` errore di configurazione o di utilizzo, `3` errore interno. I prompt e gli script si basano su questi numeri. Vedi i [codici di uscita](cli.md#codici-di-uscita).
- **Lo schema di configurazione.** `emet.config.json` come descritto da [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) e dal [riferimento della configurazione](configuration.md). Una chiave non viene rimossa né rinominata senza un incremento del `version` dello schema; possono essere aggiunte nuove chiavi facoltative.
- **L'envelope `--json`.** La forma di primo livello del JSON che un comando stampa con `--json`. I campi non vengono rimossi né cambiano tipo; possono essere aggiunti nuovi campi, quindi i parser devono ignorare i campi che non conoscono.

## Superfici interne

Possono cambiare in qualsiasi release, senza altra voce di changelog oltre a una normale nota. Non dipenderne.

- I moduli sotto `emet/src/` e le loro funzioni e tipi esportati.
- La formulazione dei prompt in `emet/reference/`, `commands/` e `agents/`, che cambia solo in un ticket che nomina i paragrafi ([ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- La forma e la posizione dei file di stato, dei registri e dei record sotto `.emet/`, e del pool di slot a livello di host.
- I file Codex generati sotto `codex/` e `.codex-plugin/`.
- Tutto ciò che si trova sotto `tools/`, `apps/` e `docs/research/`.
- Il testo leggibile di messaggi, report e dell'output di `--help`.

## Deprecazioni

Una superficie stabile viene deprecata per almeno una release minor prima di essere rimossa in una major. La deprecazione è annunciata nel changelog e, dove la CLI può rilevarla, con un avviso su stderr.

## Decisioni

I decision record in [docs/adr](../adr/README.md) spiegano perché le superfici sono tracciate così. Se non sei sicuro da che parte ricada qualcosa, chiedi in una issue prima di dipenderne.
