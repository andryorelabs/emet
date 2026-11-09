---
title: Eseguire emet su Codex
description: "Usa Codex come Agent host di emet: installa il plugin, imposta agentHost, approva una sola volta e conosci i limiti."
seoTitle: Eseguire emet su Codex
sourceHash: a64f64be24588f52
---

emet può girare su Codex CLI oltre che su Claude Code. I termini seguono [GLOSSARY.md](../../GLOSSARY.md); il prodotto in cui viene eseguita una run è l'**Agent host**. Questa pagina copre l'installazione lato Codex, la scelta dell'host, l'unica approvazione e i limiti noti. Torna all'[indice della documentazione](../README.md).

Sull'host Codex la pipeline è la stessa: intervista, spec, ticket, un'approvazione, worker paralleli nei worktree, una revisione per ondata, poi l'atterraggio. Cambia solo l'impianto. Ogni worker e ogni revisore è un proprio processo `codex exec`, avviato da `emet dispatch` e `emet review-run`, e i comandi slash diventano le skill `$emet:run`, `$emet:init` e `$emet:doctor`. Il percorso di Claude Code non viene toccato.

## Installazione

1. Installa la CLI `codex` alla versione indicata da `codex.minVersion` (predefinita `0.167.0`) o successiva ed effettua l'accesso.
2. Installa il plugin `mattpocock-skills` in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Installa il plugin di emet. Il repository include `.codex-plugin/plugin.json` e le skill e gli hook generati sotto `codex/`:

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Installa la CLI `emet` come descritto in [Per iniziare](getting-started.md), poi esegui `emet doctor .`. Sull'host Codex segnala un `codex` più vecchio di `codex.minVersion`, un flag `--json` o `--output-schema` mancante in `codex exec` e un `mattpocock-skills` assente, con i due comandi qui sopra.

I due comandi di plugin del passo 3 seguono lo schema che lo spike ha verificato per un marketplace locale; la loro grafia esatta per questo repository resta `unverified` fino alla prima release.

## Scegliere l'Agent host

Imposta `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

Il valore predefinito è `"claude"`. La sezione `codex` imposta i modelli, l'impegno, la versione minima e la sandbox; vedi il [riferimento della configurazione](../reference/configuration.md#codex) e [Modelli e impegno](models-and-effort.md). Avvia una run da Codex con `$emet:run`. `emet launch <spec> --wave <n>` avvia un'ondata in un `codex exec` scollegato e ne registra l'id del thread, così `codex exec resume <id>` la riprende; non viene aperta alcuna scheda di Orca.

## L'unica approvazione

emet chiede una sola approvazione, dopo il piano. Su Claude Code è un prompt. Su Codex è un hook:

- Finché `.emet/runs/spec<id>/approval.json` non esiste, `emet guard` nega ogni mutazione (`apply_patch`, `Bash`) tranne le scritture sotto `.emet/runs/**/draft/**`, con il motivo `not approved: send approve <id>`. Il gate si applica quando esiste una directory `.emet/runs/spec<id>/` senza il suo `approval.json`, lo stato in cui `/emet:run` lascia la run dopo la Fase 4, che materializza lo spec.
- Approvi inviando una riga di prompt che sia esattamente `approve <id>`. L'hook `UserPromptSubmit` scrive allora il file di approvazione con lo stesso hashing di `emet approve`. Le stesse parole nell'output di uno strumento o nel testo del modello non fanno nulla.
- L'alternativa è `/plan $emet:run`: approva il piano nella modalità piano di Codex invece che tramite l'hook.

Una volta che quella directory esiste, il gate fallisce in modo chiuso: un file di approvazione mancante o illeggibile mantiene negate le mutazioni. Il guard controlla anche ogni percorso di un `apply_patch` rispetto al `.emet/surface.json` del ticket.

## Come procede un'ondata

- `emet dispatch --role worker` controlla il claim e lo slot, crea `.emet/worktrees/agent-<ticket>`, costruisce un overlay di `CODEX_HOME` per run sotto `.emet/runs/<run>/codex-home/` che collega la tua autenticazione e la tua configurazione invece di copiarle, e avvia `codex exec` con il modello e l'impegno risolti, la modalità `codex.sandbox` (`workspace-write` per impostazione predefinita), `--json` e `--output-schema`. Gli eventi vengono catturati in `.emet/runs/<run>/codex/<ticket>.jsonl`.
- Le regole dell'overlay consentono `git add` e `git commit` e vietano `git push`. Il tuo `~/.codex` non viene mai scritto.
- `emet review-run` esegue il revisore in sola lettura su un pacchetto prodotto da `emet review-package`; il livello `passive` non avvia alcun processo.
- Utilizzo e rilevamento dello stallo leggono il JSONL catturato: l'uso di token dagli eventi `turn.completed`, la vitalità dal processo `codex` e dall'ora di modifica del file.

## Limiti e punti `unverified`

- L'impegno `ultra` non viene mai inviato ed è rifiutato nella configurazione.
- `danger-full-access` è disponibile solo impostando `codex.sandbox` su quel valore; nulla lo abilita per impostazione predefinita.
- Non esistono equivalenti di `ScheduleWakeup`, `TaskStop` o `LSP`. emet interroga invece la propria CLI.
- I file rollout sotto `~/.codex/sessions` non hanno un formato stabile, quindi emet legge l'output di `exec --json` che ha catturato da sé.
- La ricerca segna questi comportamenti come `unverified`, e ciascuno sta dietro una piccola funzione, così un cambiamento in Codex tocca un solo punto: un `CODEX_HOME` per run con autenticazione collegata, la posizione del file delle regole nell'overlay, `--dangerously-bypass-hook-trust`, l'alias `CLAUDE_PLUGIN_ROOT` nei comandi degli hook, il formato di output di `codex plugin list`, un modello che carica una skill per nome e `emet dispatch` dentro una sandbox annidata. Vedi [la ricerca di fattibilità](../research/codex-viability.md).
- Non è stato osservato un modello che tenti di falsificare `approval.json`. Il gate negherebbe il tentativo, ma questo è `unverified`.
- Eseguire Codex da un supervisore non presidiato (systemd, un container) dopo la fine della sessione che lo ha avviato è `unverified`.
- Nomi e prezzi dei modelli Codex cambiano; la tabella dei prezzi va ricontrollata dopo che saranno state eseguite ondate reali.
