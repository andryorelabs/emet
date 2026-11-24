---
title: Tracker e landing
description: Dove vivono i ticket, come un'ondata atterra come pull request o merge locale e come si concatenano le ondate.
seoTitle: Tracker e landing in emet
sourceHash: c79d8a04687b4620
---

Scegli dove vivono i ticket, come atterra una spec e se le ondate si concatenano. Ogni chiave citata qui è nel [riferimento della configurazione](../reference/configuration.md); ogni sottocomando è nel [riferimento della CLI](../reference/cli.md). I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Prerequisiti

- emet installato e un repo con un `emet.config.json`; esegui `emet init` se non ne ha uno.
- Per il tracker `github` o il landing `pr`: `gh` nel `PATH` e autenticato.
- Per il tracker `linear`: un server MCP di Linear dichiarato in `.mcp.json` (o a livello utente). Vedi il [riferimento delle dipendenze](../reference/dependencies.md).
- Per capire cosa cambiano queste impostazioni, leggi [Landing](../concepts/landing.md) e [Esecuzioni, ondate e spec](../concepts/runs-waves-specs.md).

## Scegliere il tracker

:::steps

1. Imposta `tracker.kind` in `emet.config.json` su `"linear"`, `"github"` o `"local"`.
2. Per un tracker locale, esegui `emet init --tracker local`. Spec e ticket sono allora file markdown sotto `.scratch/` del worktree principale (non versionato): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, ciascuno con righe `Status:` e `Blocked by:` e commenti sotto `## Comments`. Il coordinatore li legge e li scrive tramite `emet tracker`. Vedi [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Per gli altri tipi, conferma il prerequisito corrispondente indicato sopra.

:::

## Scegliere come atterra una spec

:::steps

1. Imposta `landing.mode` su `"pr"` (predefinito) o `"merge"`. In modalità `merge` una spec atterra come un unico merge locale nel trunk (`emet spec-branch land`, oppure `emet land` per ondata con `landing.unit: "wave"`), `commands.selfCheck` prende il posto della CI e non viene fatto alcun push. Vedi [ADR-0010](../adr/0010-local-merge-landing.md).
2. Imposta `landing.unit` su `"spec"` (predefinito, l'intera spec atterra in blocco) o `"wave"` (ogni ondata atterra da sola). Vedi [ADR-0037](../adr/0037-landing-per-spec.md).
3. Con `landing.unit: "spec"`, imposta `worktree.baseRef: "head"` nelle impostazioni di Claude Code, così i worktree dei worker partono dal branch `spec/<id>`. `emet preflight` ed `emet doctor` lo verificano.
4. In modalità `pr`, imposta `landing.specMergeMethod` (un merge commit per impostazione predefinita) su un metodo consentito dalle impostazioni del repository e dal ruleset del trunk; `emet doctor` avvisa quando non lo sono.
5. Per controllare il merge, imposta `pr.autoMerge` (predefinito `true`) e `pr.maxCiFixAttempts`. Imposta `pr.mergeMethod` solo con `landing.unit: "wave"`; una pull request della spec usa `landing.specMergeMethod` del passo 4 e lo ignora. Un'ondata con qualcosa di segnalato non viene mai unita automaticamente.

:::

I comandi del branch della spec (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) sono pilotati dal coordinatore; i loro flag sono nel [riferimento della CLI](../reference/cli.md).

## Concatenare le ondate

Le ondate successive girano in sessioni proprie. La concatenazione è disattivata per impostazione predefinita.

:::steps

1. Imposta la sezione `handoff` in `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. Su Claude Code, assicurati che `claude` sia nel `PATH` con supporto a `--bg`, che il workspace sia fidato (apri `claude` in modo interattivo nel repo una volta e accettalo) e che l'avviso di bypass sia stato accettato una volta in una sessione interattiva (`skipDangerousModePermissionPrompt`).
3. Su Codex, assicurati che `codex` sia nel `PATH` alla versione `codex.minVersion` o successiva, con `--json` e `--output-schema` su `codex exec`; l'ondata successiva parte come `codex exec` scollegato. Vedi [Eseguire emet su Codex](use-codex.md).
4. Imposta `handoff.launcher` (solo Claude Code) su `auto`, `orca` o `bg` per scegliere se l'ondata apre anche una scheda di Orca. `permissionMode` vale solo per Claude Code; su Codex la sessione concatenata usa `codex.sandbox`.
5. Per avviare a mano un'ondata in un'altra sessione, esegui `emet launch <spec-id> --wave <n>` invece di un semplice `claude --bg`. Stampa `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

La concatenazione parte solo se la PR è stata unita e nulla era segnalato, viene saltata se una sessione `emet-<spec-id>-*` è già attiva e ripiega sulla stampa di `/emet:run --dispatch <spec-id>` se l'avvio fallisce. Ispeziona un'ondata concatenata con `claude agents` o `claude attach emet-<spec-id>-w<n>`.

## Impostare budget e funzionalità facoltative

:::steps

1. Imposta la sezione `budgets` se i valori predefiniti non vanno bene:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` indica quante volte un ticket può fallire `verify` prima di essere rinviato; `reviewRounds` indica quanti round di review riceve un ticket prima di una sola escalation (i round di correzione hanno il proprio `budgets.fixRounds`, predefinito 2); `stallNudgeCap` indica quante volte un worker bloccato viene sollecitato. Vedi [Review e gate](../concepts/review-and-gates.md).

2. Imposta `specs.enabled` per tenere le [spec vive](../concepts/living-specs.md) in `docs/specs/` (`specs.dir`).
3. Esegui `emet map` per scrivere una mappa del codebase in `docs/agents/codebase.md` (`map.path`). `emet map --stale` esce con 1 quando HEAD ha superato il marcatore.
4. Esegui `emet metrics --run <id>` dopo un'esecuzione per token, costo e tempo di esecuzione per ticket, ondata ed esecuzione.

:::

Per una piccola modifica con un solo ticket, avvia `/emet:run --quick <request>` invece della pipeline completa; atterra sempre per ondata e si ferma davanti a una differenza ad alto rischio.

## Verifica

:::steps

1. Esegui `emet preflight`; valida le sezioni `tracker`, `landing`, `pr`, `handoff` e `budgets` ed esce con 2 se la configurazione non è valida.
2. Esegui `emet doctor .` e conferma che nessun errore nomini il tracker, `gh`, il server MCP di Linear o le impostazioni di landing.
3. Per un tracker locale, esegui `emet tracker frontier --spec <slug>` e conferma che elenchi i ticket che ti aspetti.

:::
