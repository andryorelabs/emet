---
title: Eseguire emet su Codex
description: "Usa Codex come Agent host di emet: installa il plugin, imposta agentHost, approva una sola volta e conosci i limiti."
seoTitle: Eseguire emet su Codex
sourceHash: 71c6c7d0686a6725
---

Esegui la pipeline di emet su Codex CLI invece che su Claude Code. I termini seguono [GLOSSARY.md](../../GLOSSARY.md); il prodotto in cui viene eseguita una run è l'**Agent host**. Torna all'[indice della documentazione](../README.md).

Come gira un'ondata su Codex, la guardia e i compromessi della sandbox sono spiegati in [Sicurezza](../concepts/security.md) e [Esecuzioni, ondate e spec](../concepts/runs-waves-specs.md).

## Prerequisiti

- La CLI `codex` alla versione indicata da `codex.minVersion` (predefinita `0.167.0`) o successiva, con accesso effettuato.
- `git` e `gh` nel `PATH`; vedi il [riferimento delle dipendenze](../reference/dependencies.md).
- Un repo con un `emet.config.json` (esegui `emet init` se non ne ha uno).

## Installazione

:::steps

1. Installa il plugin `mattpocock-skills` in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Installa emet con l'installazione standalone descritta in [Installazione](../start/install.md). Scrive le skill di emet sotto `~/.agents/skills/emet/` e aggiunge gli hook di emet a `$CODEX_HOME/hooks.json` (predefinito `~/.codex`), e non scrive mai `config.toml`. Installa anche l'`emet` da terminale e i comandi e gli agenti di Claude Code sotto `~/.claude`; su Codex è innocuo.

3. Approva gli hook. Codex non esegue un hook finché non lo approvi: apri `/hooks` e premi `t` nella pagina degli eventi, oppure approva il prompt "Hooks need review" all'avvio.

:::

### Opzionale: il plugin Codex

Al posto dell'installazione standalone puoi installare il plugin di emet:

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

Il plugin non porta con sé alcuno shim `emet`, quindi l'`emet` da terminale richiede comunque l'installazione standalone. `emet self install` si rifiuta di procedere mentre il plugin è installato, a meno che tu non passi `--force`, e `emet doctor` avvisa quando i due coesistono.

## Scegliere l'Agent host

:::steps

1. Imposta `agentHost` in `emet.config.json` (il valore predefinito è `"claude"`):

   ```json
   { "agentHost": "codex" }
   ```

2. Imposta modelli, impegno, versione minima e sandbox nella sezione `codex` se i valori predefiniti non vanno bene; vedi il [riferimento della configurazione](../reference/configuration.md#codex) e [Scegliere i modelli](choose-models.md).
3. Avvia una run da Codex con `$emet:run`. Per avviare un'ondata da un terminale, esegui `emet launch <spec> --wave <n>`; avvia un `codex exec` scollegato e ne registra l'id del thread, così `codex exec resume <id>` lo riprende. Non viene aperta alcuna scheda di Orca.

:::

## Approvare il piano

emet chiede una sola approvazione, dopo il piano. Su Codex è un hook.

:::steps

1. Attendi che `$emet:run` materializzi la spec. Finché `.emet/runs/spec<id>/approval.json` non esiste, `emet guard` nega ogni mutazione con il motivo `not approved: send approve <id>`.
2. Invia una riga di prompt che sia esattamente `approve <id>`. L'hook `UserPromptSubmit` scrive il file di approvazione. Le stesse parole nell'output di uno strumento o nel testo del modello non fanno nulla.
3. In alternativa, avvia con `/plan $emet:run` e approva il piano nella modalità piano di Codex.

:::

## Dopo un aggiornamento di emet

Con l'installazione standalone gli hook sono semplici voci in `hooks.json` e restano approvati. Con il plugin, Codex chiede di nuovo di fidarsi degli hook del plugin dopo ogni aggiornamento.

:::steps

1. Apri `/hooks` e premi `t` nella pagina degli eventi, oppure approva il prompt "Hooks need review" all'avvio. Fino ad allora l'emet guard e l'unica approvazione non vengono eseguiti.
2. Se lo shim stampa `release v<version> has no downloadable asset yet`, sta eseguendo la versione in cache. Riprova tra qualche minuto.

:::

## Verifica

:::steps

1. Esegui `emet doctor .`. Sull'host Codex segnala un `codex` più vecchio di `codex.minVersion`, un flag `--json` o `--output-schema` mancante in `codex exec`, hook non approvati e un `mattpocock-skills` assente.
2. Correggi ciò che segnala usando la voce corrispondente in [Risoluzione dei problemi](../troubleshooting.md#codex-host), poi eseguilo di nuovo finché non segnala alcun errore.

:::

Limiti noti: l'impegno `ultra` non viene mai inviato ed è rifiutato nella configurazione, e `codex.sandbox` ha come valore predefinito `danger-full-access` affinché i worker possano fare commit; impostalo su `"workspace-write"` per mantenere la sandbox, e i worker allora non possono fare commit. Vedi [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) e il [report della sonda](../research/codex-probe-report.md).
