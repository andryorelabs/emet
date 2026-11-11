---
title: Riferimento della CLI
description: Ogni sottocomando di emet, la tabella di gate e registri, i codici di uscita e le variabili d'ambiente.
seoTitle: Riferimento della CLI di emet
sourceHash: a8d3bf074f04de8e
---

Ogni sottocomando di `emet`, la tabella di gate e registri, i codici di uscita e le variabili d'ambiente. I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Torna al [README](../../README.md). Ogni comando stampa il proprio utilizzo con `--help`.

## Sottocomandi

Tre comandi slash racchiudono la CLI dentro Claude Code: `/emet:run` (la pipeline), `/emet:init` (`emet init`) e `/emet:doctor` (`emet doctor .`). Su Codex sono le skill `$emet:run`, `$emet:init` e `$emet:doctor`. Un `emet` in un normale terminale richiede `install.sh`; altrimenti esegui `! emet <subcommand>` all'interno di una sessione.

`emet <command> [...args]`. `emet --version` stampa la versione.

### Configurazione e verifica

- `emet migrate [--dry-run]`: rinomina un repo legacy con i nomi di emet.
- `emet init [--tracker linear|github|local] [--force]`: rileva automaticamente gestore di pacchetti, branch trunk e tipo di tracker, e scrive `emet.config.json` e i file `docs/agents/*.md`. `--tracker local` configura il tracker locale.
- `emet doctor [--all] [<path> ...]`: verifica in sola lettura di un numero qualsiasi di repo in una volta; per impostazione predefinita la directory corrente.
- `emet preflight [--run <id>] [--post-dispatch]`: conferma che il repo è pronto per il dispatch.
- `emet skill-path <name>`: stampa il percorso assoluto di `SKILL.md` di una skill di mattpocock-skills. Esce con 1 se la skill non viene trovata.
- `emet selftest`: esegue i test unitari della CLI stessa. Solo per installazioni da sorgenti; un binario compilato esce con 1 e ti dice di eseguire `emet doctor`.

In qualsiasi repo git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` lascia un marcatore `TODO(emet):` nei file `docs/agents/*.md` generati per tutto ciò che non riesce a dedurre da solo (un lock condiviso del database di test, la proprietà dello schema e così via). Compilali; `emet preflight` rifiuta il dispatch finché ne resta uno.

Poi, dentro Claude Code (su Codex usa `$emet:run` con gli stessi argomenti):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Controllo della flotta

`emet doctor` controlla più repo in una volta, in sola lettura:

```bash
emet doctor ~/code/*
```

Per ogni repo il report indica: un `emet.config.json` valido, tutti e quattro i file `docs/agents/*.md` presenti, nessun marcatore `TODO(emet):` rimasto, se i comandi in `commands.selfCheck` si risolvono davvero e i risultati sulle dipendenze specifiche del tracker del repo (`gh`, Linear; vedi [dipendenze](dependencies.md#cosa-controlla-cosa)). Il plugin mattpocock-skills e i flag delle CLI esterne (`gh`, più quelli dell'Agent host: `claude --bg` e `claude agents --json` su Claude Code, `codex exec --json` e `--output-schema` su Codex, verificati tramite `--help`) vengono controllati una sola volta per l'intera scansione, non per ogni repo.

### Esecuzioni, worker e slot

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: riserva un ticket per un'esecuzione. `--release <ticket>`, `--list` e `--prune [--dry-run]` rilasciano un claim, elencano i claim o eliminano quelli obsoleti.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: prende uno slot worker dal pool dell'host in `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` e `--list` liberano gli slot o li elencano.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: senza argomenti, recupera le esecuzioni chiuse o morte il cui lavoro è atterrato; `--run` pulisce questa esecuzione; `--all` è una scansione dei branch su tutto il repo. Dopo un merge, `emet cleanup --run <runId>` libera i branch, i claim dei ticket e gli slot dei worker dell'ondata. In ogni modalità elimina anche ogni branch locale la cui PR è stata unita al commit di testa del branch, insieme al worktree dell'agente pulito e non bloccato che lo contiene.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: stampa il motivo del `git worktree lock` che un worker scrive al bootstrap.
- `emet launch <spec-id> --wave <n>`: su Claude Code, avvia un'ondata come sessione `claude --bg` e ne apre la scheda di Orca secondo `handoff.launcher` (su Codex vedi [Host Codex](#host-codex)). Esegue l'intero avvio (controllo delle sessioni duplicate, `claude --bg`, scheda) e stampa `{ name, id, attach, orcaTab: { opened, reason } }`. Usalo, e non un semplice `claude --bg`, ogni volta che vuoi un'ondata in un'altra sessione a mano.
- `emet status [--spec <id>]`: Working / Checking / Ready / Needs-decision per ondata come JSON più una riga di riepilogo. `emet status --help` documenta il JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: riporta l'uso della sessione; `--stalled` elenca i worker bloccati.
- `emet handoff --check <path> | --render <path>`: valida o rende la nota `.emet/handoff-<ticket>.md` di un worker.
- `emet metrics [--run <id>]`: riporta token, costo equivalente in API e tempo di esecuzione per ticket, per ondata e per esecuzione, letti dalle trascrizioni delle sessioni. Confronta inoltre il budget di contesto stimato per ticket con quello effettivamente usato da ogni worker. Il suo riepilogo va in fondo al report finale dell'esecuzione.

### Pianificazione, review e landing

- `emet validate --spec <id> | --file <path>`: validazione del piano; vedi [Gate e registri](#gate-e-registri).
- `emet surfaces --check <file.json | ->`: rifiuta glob di superfici consentite sovrapposti tra i ticket di un'ondata.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: vedi [Gate e registri](#gate-e-registri).
- `emet assess --base <ref> --head <ref>`: classifica un diff come `passive`, `medium` o `high` e stampa un JSON con il livello, i motivi e il modello e l'impegno consigliati per il reviewer. Vedi [Modelli e impegno](../../README.md#models--effort) e [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: unisce un branch di integrazione nel trunk locale (`landing.mode` `merge`). `commands.selfCheck` sostituisce la CI e non viene inviato nulla.
- `emet spec-merge --spec <id>`: dopo che un'ondata viene unita automaticamente, fonde i delta dei requisiti `ADDED`/`MODIFIED`/`REMOVED` della spec in `docs/specs/<area>.md` (`specs.dir`). Controlla ogni area prima di scrivere qualcosa. Un conflitto, o un requisito che perderebbe uno scenario, esce con 1 e lascia ogni file intatto.
- `emet map [--refresh]`: scrive una sintesi di un codebase esistente (stack, struttura, convenzioni, test, hotspot) in `docs/agents/codebase.md` (`map.path`), marcata con lo SHA del commit da cui è stata costruita. Lo stesso commit produce sempre lo stesso file. `emet map --stale` esce con 1 quando HEAD ha superato il marcatore, e in tal caso `emet preflight` avvisa. `emet map --for <globs>` stampa solo le sezioni che corrispondono alle superfici di modifica di un ticket; quell'output è l'unica parte della mappa inclusa nel brief di un worker.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: il tracker locale su `.scratch/`, JSON su stdout. Vedi [Tracker locale](#tracker-locale).
- `emet guard`: l'hook `PreToolUse` di Claude Code; legge il JSON dell'hook da stdin (la forma Codex è sotto [Host Codex](#host-codex)). `install.sh` lo collega in `~/.claude/settings.json`. Blocca una manciata di inneschi noti di fallimenti nelle esecuzioni senza supervisione (vedi `emet/src/guard.ts`).

### Tracker locale

Con `tracker.kind: "local"`, spec e ticket sono file markdown sotto `.scratch/` del worktree principale (non versionato): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, ciascuno con righe `Status:` e `Blocked by:` e commenti sotto `## Comments`. Il coordinatore li legge e li scrive tramite `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` lo configura. Vedi [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` è `"pr"` (predefinito) o `"merge"`, indipendente dal tracker. In modalità `merge` un'ondata atterra come un unico merge locale nel trunk con `emet land`, con `commands.selfCheck` al posto della CI e senza push. `gh` serve solo quando il tracker è `github` o il landing è `pr`. Vedi [ADR-0010](../adr/0010-local-merge-landing.md) e [`landing`](configuration.md#landing).

### PR di landing e concatenamento delle ondate

Un'ondata è una PR. Il suo corpo contiene `Closes #N` per ogni ticket (la parola chiave di chiusura del tracker), e il coordinatore sposta i ticket in in-review quando apre la PR. La PR viene poi unita secondo `pr.autoMerge`, oppure resta aperta quando l'ondata è stata segnalata, `autoMerge` è `false` o le correzioni di CI sono esaurite (la PR riceve allora l'etichetta human-decision). Le ondate successive girano in sessioni proprie, mai in quella che ha eseguito l'ondata 1. Le sezioni `pr` e `handoff` controllano cosa accade dopo; vedi [`pr`](configuration.md#pr) e [`handoff`](configuration.md#handoff).

### Host Codex

Questi comandi servono l'host di agente Codex (`agentHost` `"codex"`); vedi la [guida a Codex](../guide/codex.md).

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: dopo aver controllato la prenotazione e lo slot, crea `.emet/worktrees/agent-<ticket>`, costruisce un overlay `CODEX_HOME` per esecuzione e avvia il worker come `codex exec` distaccato. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` attende la fine e stampa lo stato di risultato registrato.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: esegue il reviewer come `codex exec` in sola lettura su un pacchetto di `emet review-package` e stampa il JSON dei rilievi per `emet review --findings`. Il livello `passive` non avvia alcun processo.
- `emet launch <spec-id> --wave <n>`: su questo host, avvia un `codex exec` distaccato che esegue `$emet:run --dispatch <spec>` e registra il suo id di thread. Non si apre alcuna scheda Orca, e `codex exec resume <id>` riprende la sessione.
- `emet guard`: con `EMET_AGENT_HOST=codex` legge l'input degli hook di Codex, controlla i percorsi di `apply_patch` rispetto a `.emet/surface.json` e tiene chiuso il cancello di approvazione finché non arriva una riga di prompt `approve <id>`.

## Gate e registri

Le fasi non decidono da sole quando un ticket è finito, unibile o vale un altro tentativo. Chiamano un comando della CLI che legge un registro su disco e stampa la decisione. I registri di esecuzione stanno sotto `.emet/runs/<run-id>/` e il ledger delle review sotto `.emet/review/`, nel checkout principale, non nel worktree di un worker.

| Passo                   | Comando                                              | Cosa impone                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prima dell'approvazione | `emet validate --file <plan.json>`                   | Ogni `S#` è coperto da almeno un ticket e ha uno scenario di accettazione. Ogni ticket copre almeno un `S#`. Le superfici di modifica sono disgiunte all'interno di un'ondata. Nessun ciclo di dipendenze. `emet preflight` lo esegue di nuovo sul piano approvato.                               |
| Approvazione            | `emet approve --run <id> --spec <file>`              | Scrive `approval.json` con gli hash della spec e dell'elenco dei ticket. Il dispatch rifiuta se uno dei due cambia dopo (`--check`).                                                                                                                                                              |
| Creazione dei ticket    | `emet materialize-log --run <id> --record/--lookup`  | Salva l'ID di ogni ticket creato non appena esiste, così un'esecuzione interrotta non crea mai duplicati.                                                                                                                                                                                         |
| Worker terminato        | `emet results --run <id> --write/--read <ticket>`    | I worker scrivono un file di risultato locale (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` o `NEEDS_CONTEXT`, più una riga `Risk:`). Solo il coordinatore scrive sul tracker.                                                                                                                         |
| Dopo ogni worker        | `emet verify <ticket> --run <id>`                    | Verifica che esistano commit oltre la base del dispatch, che ogni percorso modificato sia dentro le superfici di modifica del ticket, che la nota di handoff superi `handoff --check` e che `commands.workerScopedSuite` passi. Review e merge rifiutano un ticket senza registro di superamento. |
| Input della review      | `emet review-package <base> <head> --out <file>`     | Raggruppa il diff per il reviewer, che lo riceve come percorso di file. Esce con 3 se l'intervallo è vuoto o non discende da base.                                                                                                                                                                |
| Review                  | `emet review --ticket <t> --findings <file>`         | Tiene il ledger dei rilievi e impone l'ordine di triage (`intent_gap` → `bad_plan` → `patch` → `defer`) e il limite di round. `--escalate` passa al livello di modello successivo. `--rule`/`--rulings` registrano ed elencano i "Rulings I made" per il report e il corpo della PR.              |
| Merge o catena          | `emet gate <ticket> --tier … --ci … --integration …` | Stampa `merge`, `hold`, `chain`, `stop` o `defer` come JSON con i relativi motivi. Legge il registro di verify, i rilievi aperti, il livello di rischio, la CI, la suite di integrazione e i budget.                                                                                              |

Dopo che i branch di un'ondata sono stati uniti, `commands.fullSuite` viene eseguito una volta sul branch di integrazione. Un'esecuzione rossa blocca la PR e `autoChain`. Il gate riceve il risultato come `--integration`. Per i budget letti dal gate, vedi [`budgets`](configuration.md#budgets).

## Codici di uscita

I codici di uscita hanno lo stesso significato in ogni sottocomando.

| Codice | Significato                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| `0`    | Pulito.                                                                                                      |
| `1`    | Rilievi su cui agire.                                                                                        |
| `2`    | Errore di configurazione o di utilizzo; lo strumento non è mai stato eseguito. Anche un comando sconosciuto. |
| `3`    | Errore interno.                                                                                              |

## Variabili d'ambiente

Variabili rivolte all'utente. Una variabile, se impostata, sostituisce il valore di configurazione corrispondente.

| Variabile                     | Effetto                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` declassa un blocco per dipendenze a un avviso per quella sola esecuzione. Impostala nella tua shell, non in qualcosa che il coordinatore esegue senza supervisione. |
| `EMET_MAX_LIVE_WORKERS`       | Sostituisce [`concurrency.maxLiveWorkers`](configuration.md#concurrency); accetta un intero positivo o `auto`.                                                                                                     |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Sostituisce [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), in millisecondi.                                                                                                                     |
| `EMET_STATE_DIR`              | Directory di stato dell'host, che contiene il pool di slot dei worker. Ordine di risoluzione: `$EMET_STATE_DIR`, poi `$XDG_STATE_HOME/emet`, poi `~/.local/state/emet`.                                            |
| `EMET_MEM_RESERVE_GIB`        | Margine di memoria in GiB che deve restare libero; un acquire viene negato quando la memoria disponibile è inferiore. Predefinito 8. Alimenta anche il limite `auto` dei worker.                                   |
| `EMET_MEM_PER_WORKER_GIB`     | Memoria in GiB ipotizzata per worker quando `maxLiveWorkers` è `auto`. Predefinito 2. Aumentalo per uno stack per worker più pesante, come una suite E2E guidata da browser per ogni worktree.                     |
| `EMET_CPU_OVERSUBSCRIBE`      | Moltiplicatore di CPU per il limite `auto` dei worker. Predefinito 1.                                                                                                                                              |
| `EMET_AGENT_HOST`             | `codex` fa leggere a `emet guard` l'input degli hook di Codex. Impostata dagli hook di Codex; lasciala non impostata su Claude Code.                                                                               |

Il limite `auto` è `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. I vecchi nomi `FORGE_*` sono ancora letti; `EMET_*` ha la precedenza quando entrambi sono impostati.
