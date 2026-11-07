---
title: Riferimento della configurazione
description: Ogni chiave di emet.config.json con il suo valore predefinito e il suo significato.
seoTitle: Riferimento della configurazione di emet
sourceHash: 72d2564863187ae0
---

Ogni chiave di `emet.config.json`, con il suo valore predefinito e il suo significato. La fonte di verità è [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Torna al [README](../../README.md).

`emet init` scrive il file. `emet preflight` e `emet doctor` lo validano. Una chiave contrassegnata come prose-only è letta dai prompt di `/emet`, non dalla CLI. Una chiave contrassegnata come deprecated è ancora accettata. Lo schema consente inoltre una chiave di testo libero `"//"` per le note (mai letta da alcuno strumento) e `"version"`, che è sempre `1`.

## pr

Come viene unita la PR di un'ondata.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (predefinito `true`): attende i controlli della PR e la unisce; senza controlli, la unisce subito. Un controllo fallito viene corretto e inviato, fino a `maxCiFixAttempts` volte, poi la PR resta aperta per una persona. Un'ondata con qualcosa di segnalato non viene mai unita automaticamente.
- `mergeMethod` (predefinito `squash`): `squash`, `merge` o `rebase`, passato a `gh pr merge`.
- `maxCiFixAttempts` (predefinito `2`, minimo `0`): quante volte il coordinatore può tentare di correggere un controllo fallito prima di lasciare la PR aperta per una persona.

## handoff

Cosa accade dopo la chiusura di un'ondata e i limiti di dimensione della nota di handoff di un worker. Validato da `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (predefinito `60`): numero massimo di righe che una nota `.emet/handoff-<ticket>.md` può avere prima che `emet handoff --check` la respinga.
- `maxChars` (predefinito `8000`, circa 2k token): numero massimo di caratteri di una nota di handoff.
- `autoChain` (predefinito `false`): dopo un'ondata pulita e unita, con altre ondate ancora da fare, avvia la successiva con `claude --bg` invece di stampare `/emet:run --dispatch <spec-id>`. Si ispeziona con `claude agents` o `claude attach emet-<spec-id>-w<n>`. Requisiti:
  1. `claude` nel PATH, con supporto a `--bg`.
  2. Un workspace fidato. `--bg` gira in modo non interattivo, quindi la finestra di fiducia non compare mai; apri `claude` in modo interattivo nel repo una volta e accettala.
  3. L'avviso di bypass accettato una volta in una sessione interattiva (`skipDangerousModePermissionPrompt`), dato che l'ondata successiva gira nel `handoff.permissionMode`, non nella modalità della sessione che la avvia.

  L'avvio avviene solo se la PR è stata unita e nulla era segnalato, e viene saltato se una sessione `emet-<spec-id>-*` è già attiva (`claude agents --json`). Se l'avvio fallisce, ripiega sulla stampa di `/emet:run --dispatch <spec-id>`.

- `launcher` (predefinito `auto`, uno tra `auto`, `orca`, `bg`): apre anche l'ondata in una scheda di Orca che esegue `claude attach`. `auto` interroga il runtime di Orca (`orca status`), quindi funziona anche da sessioni `claude --bg`, che non hanno `TERM_PROGRAM`; `orca` ci prova sempre; `bg` mai. L'ondata gira comunque in background, e una scheda che non si apre non ferma mai la catena. `emet launch <spec-id> --wave <n>` esegue l'intero avvio; vedi [`emet launch`](cli.md#esecuzioni-worker-e-slot).
- `permissionMode` (predefinito `bypassPermissions`, uno tra `bypassPermissions`, `auto`, `acceptEdits`): modalità di permesso della sessione concatenata. Non è ereditata dalla sessione che la avvia, perché il classificatore della modalità `auto` può negare un passaggio come `gh pr merge` e lasciare un'ondata a metà. Le tue regole `permissions.deny` continuano ad applicarsi, ma l'avviso di bypass deve essere stato accettato una volta in modo interattivo (`skipDangerousModePermissionPrompt`).

## budgets

Tutti facoltativi.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (predefinito `2`, minimo `1`): quante volte un ticket può fallire `verify` prima che il gate risponda `defer`. Il ticket riceve l'etichetta deferred e il resto dell'ondata prosegue. Un guasto ambientale, come il comando di test che esce con 126/127 o un'interruzione del provider, mette in pausa l'esecuzione senza consumare un tentativo.
- `reviewRounds` (predefinito `2`, minimo `1`): quanti round di review/correzione riceve un ticket prima di una sola escalation al livello di modello successivo. Ciò che resta aperto dopo riceve una decisione.
- `stallNudgeCap` (predefinito `6`, minimo `1`): quante volte un worker bloccato viene sollecitato. Il conteggio non si azzera mai.

## models

Modello e impegno per ruolo. Ogni chiave è facoltativa; omettendo la sezione restano worker `sonnet`/`medium` e reviewer `opus`/`medium`. L'impegno è uno tra `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (predefinito `sonnet`), `worker.effort` (predefinito `medium`): il worker. La riga `Model:` di un ticket sostituisce `worker` solo per quel worker.
- `reviewer.medium` e `reviewer.high` (predefiniti `opus`, `medium` ciascuno): il reviewer per ogni livello di rischio restituito da `emet assess`. Alza `reviewer.high.effort` (per esempio a `high`) per maggiore attenzione sulle ondate rischiose.
- `triage` (predefinito `haiku`): il modello economico per il triage dei log di CI e per la review di livello passive. Un controllo fallito viene passato a un agente su questo modello, che restituisce al massimo circa 2k token con riferimenti `file:line`.
- `escalation` (predefinito `{ "sonnet": "opus" }`): il livello di modello successivo per ogni nome di modello, usato quando un ticket raggiunge il suo limite di correzioni.

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (predefinito `[]`): sottostringhe di percorso aggiuntive, senza distinzione tra maiuscole e minuscole, che impongono il livello di review `high` in `emet assess`, oltre all'insieme integrato (autenticazione, sicurezza, pagamenti, webhook, CI, l'installer, lockfile, migrazioni e sink pericolosi come SQL grezzo o pipe-to-shell).

## landing

- `mode` (predefinito `pr`): `pr` apre una pull request (richiede `gh`). `merge` unisce il branch di integrazione nel trunk locale con `emet land` e non fa mai push, con `commands.selfCheck` al posto della CI. Indipendente dal tracker. Vedi [ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Con quale issue tracker parla `/emet`. La CLI legge `kind` per decidere quali controlli sulle dipendenze si applicano; il resto documenta l'adattatore seguito dal comando `/emet` (vedi [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obbligatorio): `linear`, `github` o `local`. Per `local`, vedi [Tracker locale](cli.md#tracker-locale) e [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: chi scrive ogni transizione di stato del ticket: `worker`, `coordinator` o `automatic` (lo fa l'integrazione del tracker, per esempio l'integrazione GitHub di Linear all'apertura o al merge di una PR). Il coordinatore non scrive mai una transizione contrassegnata come `automatic`.
- `github.priorityLabels`: associa un livello di priorità (`"1"` = P0 la più alta fino a `"4"` = P3) al nome di un'etichetta GitHub, per esempio `{"1":"P0","2":"P1"}`. Se non ne è dichiarata nessuna, i ticket sono ordinati per `createdAt` crescente e `emet doctor` lo segnala.
- `github.stateLabels`: associa uno stato del workflow (`todo`, `in-progress`, `in-review`) al nome di un'etichetta GitHub, per esempio `{"todo":"status:todo"}`. `done` e `canceled` sono dedotti dallo stato chiuso dell'issue e da `state_reason`.
- `linear`: impostazioni specifiche di Linear (chiave del team, nomi degli stati del workflow). Lette solo dal modello che segue `docs/agents/issue-tracker.md`, mai dalla CLI.
- `local.idPrefix` (deprecated): gli id dei ticket locali sono ora `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (deprecated): modelli di etichette e di riferimenti alle PR, per esempio `Closes #{number}` (github) o `Refs: {id}` (linear).

## preflight

- `requiredFiles` (predefinito nessuno): file che `emet preflight` richiede nella radice del repo prima che un'ondata venga inviata, ciascuno `{ "path", "why" }`; `why` compare nel messaggio di errore. Vuoto significa che il controllo non viene eseguito.
- `requiredCommands` (predefinito nessuno): binari che devono risolversi nel PATH prima del dispatch. `emet preflight` fallisce con uscita 1 indicando quelli che non si risolvono, e `emet doctor` li segnala. È l'elenco proprio del repo, separato dai [controlli sulle dipendenze](dependencies.md#cosa-controlla-cosa) guidati dal tracker; `gh` ha già un controllo dedicato, quindi elencarlo è facoltativo. Aggiunte comuni: `rg` e `sg`.

## specs

- `dir` (predefinito `docs/specs`): directory relativa al repo delle spec vive, scritte da `emet spec-merge`.

## map

- `path` (predefinito `docs/agents/codebase.md`): percorso relativo al repo della mappa generata da `emet map`.

## concurrency

- `waveSize` (predefinito `4`, minimo `1`): numero massimo di chiamate Agent inviate insieme in un'ondata.
- `maxLiveWorkers` (predefinito `auto`): limite globale condiviso da ogni coordinatore `/emet` in esecuzione su questo host, in ogni repo. Il pool di slot sta sotto `~/.local/state/emet/slots`, non in un singolo repo. `auto` ricava il limite dal numero di CPU e dalla RAM dell'host; un intero positivo lo fissa. Un controllo separato del margine di memoria (`EMET_MEM_RESERVE_GIB`, predefinito 8 GiB) nega un acquire quando la memoria disponibile è troppo bassa, a prescindere da questo limite. La variabile d'ambiente `EMET_MAX_LIVE_WORKERS` sostituisce questo campo e accetta anch'essa `auto`.
- `runIdleThresholdMs` (predefinito `5400000`, 90 minuti): per quanto tempo un'esecuzione senza ancora attiva viene ancora classificata come inattiva anziché morta, in base alla sola freschezza della trascrizione. La variabile d'ambiente `EMET_RUN_IDLE_THRESHOLD_MS` la sostituisce.

Vedi [Variabili d'ambiente](cli.md#variabili-dambiente).

## ticket

- `idPattern`: sorgente di una regex ancorata a cui deve corrispondere l'id di un ticket, per esempio `^PROJ-\d+$`. Un pattern non valido è un errore di configurazione grave.
- `branchPrefix`: prefisso in minuscolo (`^[a-z0-9-]+$`) per il branch locale di un worker. I branch sono `<branchPrefix>-<number>-<slug>`, e `cleanup` scansiona il glob `<branchPrefix>-*`.
- `idExample` (deprecated, prose-only): un id di esempio che corrisponde a `idPattern`.
- `branchPattern` (deprecated, prose-only): modello completo del nome del branch.

## commands

Tutti prose-only.

- `selfCheck`: comandi che un worker esegue prima di considerare finita la sua modifica, per esempio `["npm run check"]`. Con `landing.mode` `merge` sostituisce la CI.
- `workerScopedSuite`: comando che un worker esegue per testare solo l'area toccata. `emet verify` ne richiede il superamento.
- `fullSuite.run`: comando per la suite dell'intero repo, eseguito una volta sul branch di integrazione dopo l'unione dei branch di un'ondata. Un'esecuzione rossa blocca la PR e `autoChain`.
- `fullSuite.singleton`: `true` se solo un worktree alla volta può eseguire la suite.
- `fullSuite.runInBackground`, `fullSuite.reset` (deprecated): flag per l'esecuzione in background e comandi di ripristino dello stato.

## worktree

- `lockReason`: modello per il motivo del `git worktree lock` che un worker scrive al bootstrap, compilato da `emet lock-reason`. Il valore predefinito è `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Sostituiscilo solo per aggiungere campi: `emet lock-reason` rifiuta un modello che elimina il token letterale `emet` oppure uno tra `run=`, `ticket=`, `anchor=`, `at=` o `slug=`.
- `copyFromMain` (prose-only): percorsi copiati dal checkout del trunk in un worktree nuovo prima del bootstrap, per esempio file env non tracciati.
- `bootstrap` (prose-only): comandi di shell eseguiti una volta in un worktree nuovo prima dell'avvio di un worker, per esempio `["npm ci"]`. Eseguiti dalla fase 6 di `/emet`, mai dalla CLI.
- `stateDir` (deprecated, prose-only): directory per i log locali dell'esecuzione, per esempio `.emet`.

## usage

- `oversizedReadLines` (predefinito `400`, minimo `1`): una Read senza offset né limite su un file con più di questo numero di righe conta come sovradimensionata in `emet usage`.
- `stalledMinutes` (predefinito `10`, minimo `1`): soglia predefinita di `--minutes` per `emet usage --stalled`.

## sizing

- `inlineMaxLines` (predefinito `100`, minimo `1`): il corpo di ticket più grande, in righe, mantenuto inline nel prompt di un worker.

## schema

Prose-only. La proprietà degli schemi di dati di questo repo, usata dalla regola di prevenzione dei conflitti della fase 3 quando si dividono i ticket. Vuoto od omesso salta la regola.

- `ownedPaths`: percorsi che definiscono lo schema condiviso, per esempio `["prisma/schema.prisma"]`. Al massimo un worker per ondata può toccarli.
- `sharedDatabase` (deprecated): `true` se i worker condividono un unico database fisico.

## commit

Prose-only.

- `trailer`: chiave del trailer git che un worker aggiunge ai commit che fanno riferimento al ticket, per esempio `Refs`.
- `trailerPosition`: `body` o `footer`.

## repo

- `trunk`: il branch verso cui confluiscono le modifiche di ogni worker e la base di ogni confronto git di cleanup e preflight, per esempio `main`.
- `remote` (predefinito `origin`): il remote git su cui risiede `trunk`.
- `integrationBranch` (deprecated, prose-only): branch facoltativo di lunga durata su cui un'ondata si integra prima del trunk.
- `commitTypes` (deprecated, prose-only): tipi di Conventional Commit consentiti per i commit dei worker.

## design

Facoltativo, prose-only. `null` od omesso salta il passaggio di review di design/UI.

- `canvasIndex` (deprecated): percorso di un file canvas di design che i worker controllano prima delle modifiche all'interfaccia.
