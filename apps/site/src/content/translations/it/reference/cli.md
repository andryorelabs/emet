---
title: Riferimento della CLI
description: Ogni sottocomando di emet, i gate e i registri, i codici di uscita e le variabili d'ambiente.
seoTitle: Riferimento della CLI di emet
sourceHash: 5f612062f6f49bcc
---

Ogni sottocomando di `emet`, i gate e i registri, i codici di uscita e le variabili d'ambiente. I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Torna al [README](../../README.md). Ogni comando stampa il proprio utilizzo con `--help`.

## Sottocomandi

Tre comandi slash racchiudono la CLI dentro Claude Code: `/emet:run` (la pipeline), `/emet:init` (`emet init`) e `/emet:doctor` (`emet doctor .`). Su Codex sono le skill `$emet:run`, `$emet:init` e `$emet:doctor`. Un `emet` in un normale terminale richiede `emet self install`; altrimenti esegui `! emet <subcommand>` all'interno di una sessione.

`emet <command> [...args]`. `emet --version` stampa la versione.

In qualsiasi repo git:

```bash
emet init       # autodetects package manager, trunk branch, tracker kind
emet preflight  # confirms the repo is dispatch-ready
```

`emet init` lascia un marcatore `TODO(emet):` nei file `docs/agents/*.md` generati per tutto ciò che non riesce a dedurre da solo (un lock condiviso del database di test, la proprietà dello schema e così via). Compilali; `emet preflight` rifiuta il dispatch finché ne resta uno.

Poi, dentro Claude Code (su Codex usa `$emet:run` con gli stessi argomenti):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Configurazione e verifica

### `emet migrate`

Rinomina un repo legacy con i nomi di emet.

- `--dry-run`

### `emet init`

Rileva automaticamente gestore di pacchetti, branch trunk, tipo di tracker e modalità after-spec (vedi [`handoff.afterSpec`](configuration.md#handoff)). Imposta [`schema.ownedPaths`](configuration.md#schema) quando trova uno schema Prisma (`prisma/schema.prisma` o una cartella `prisma/schema/`) o una cartella di migrazioni Drizzle (`drizzle/` accanto a un `drizzle.config.*`), e scrive `emet.config.json` e i file `docs/agents/*.md`.

- `--tracker linear|github|local`: `--tracker local` configura il tracker locale.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Verifica in sola lettura di un numero qualsiasi di repo in una volta; per impostazione predefinita la directory corrente.

- `--all`
- `<path> ...`: i repo da verificare.

Per un repo che configura [`verify.browser`](configuration.md#verify) riporta anche un riscontro facoltativo su `agent-browser`: un binario mancante è `indeterminate` (una riga `optional:` con il rimedio di installazione), e quando il binario esiste un `agent-browser doctor` che fallisce compare come avviso. Nessuno dei due è mai un errore e nessuno cambia il codice di uscita. Un repo senza `verify.browser` non mostra nulla.

#### Controllo della flotta

`emet doctor` verifica più repo in una volta, in sola lettura:

```bash
emet doctor ~/code/*
```

Riporta, per ogni repo: un `emet.config.json` valido, tutti e quattro i file `docs/agents/*.md` presenti, zero marcatori `TODO(emet):` rimasti, se i comandi in `commands.selfCheck` si risolvono davvero, e i riscontri sulle dipendenze specifici del tracker di quel repo (`gh`, Linear; vedi [dipendenze](dependencies.md#cosa-controlla-cosa)).

Il plugin mattpocock-skills e i flag delle CLI esterne vengono controllati una sola volta per l'intera scansione, non per repo. Sono `gh`, più quelli dell'Agent host: `claude --bg` e `claude agents --json` su Claude Code, `codex exec --json` e `--output-schema` su Codex, controllati tramite `--help`.

### `emet setup`

Propone le installazioni opzionali con prompt readline.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: combinabile con `--with`, `--yes` e `--json`. Stampa i passi pianificati di ogni elemento scelto, o `already-present`, e non cambia nulla: non esegue comandi, non scrive file né voci del registro, ed esce con 0.
- `--restore <id>`: annulla uno dei due elementi ripristinabili; vedi [Registro di setup e ripristino](#registro-di-setup-e-ripristino).

Senza TTY, o con `--yes` o `--with`, non chiede nulla e installa esattamente gli elementi indicati; senza TTY e senza `--with` non installa nulla e stampa il catalogo di `--list`. Ogni passo riporta `installed`, `already-present`, `skipped` o `failed`; un errore non ferma gli altri, e il codice di uscita è 1 se qualcuno è fallito. `/emet:setup` è il punto di ingresso del plugin e pone le stesse scelte con `AskUserQuestion`. Ogni elemento `installed` viene annotato nel registro di setup.

Gli elementi:

- `mattpocock-skills` (attivo di default), `engram`, `mascot`, `orca-pet` e `gh-auth`.
- `agent-browser` (spento di default): esegue `bun add -g agent-browser@latest` poi `agent-browser install`, e scrive `~/.agent-browser/config.json` con `contentBoundaries: true` e `maxOutput: 50000` solo quando quel file non esiste. Poi esegue `agent-browser doctor` e stampa un avviso se fallisce. Non fissa mai una versione e non passa mai `--with-deps`, quindi quando mancano librerie di sistema stampa il comando da eseguire a mano.
- `context7` (spento di default): esegue `bun add -g ctx7@latest`, poi `ctx7 setup --cli --claude --yes`, e `ctx7 setup --cli --codex --yes` solo quando `codex` è nel PATH. Installa la CLI `ctx7` e la sua skill `find-docs`, non il server MCP, non fissa mai una versione e stampa il comando da eseguire a mano quando un passo di `ctx7 setup` fallisce. `ctx7` invia eventi di utilizzo anonimi a meno che non sia impostato `CTX7_TELEMETRY_DISABLED=1`, e un `CONTEXT7_API_KEY` nell'ambiente ha la precedenza sull'account salvato da `ctx7 login`.
- `firecrawl-local` (spento di default): richiede `cargo`, ed esegue `cargo install firecrawl-local` quando il binario manca. Poi registra un server MCP di Claude Code a livello utente con `FIRECRAWL_CLOUD=search` e `--public-only`, sostituendo una registrazione precedente con altre impostazioni. Scrape, crawl e map girano sulla macchina, solo la ricerca web va a Firecrawl Cloud e gli indirizzi privati sono bloccati.
  - Passa il Chrome più recente scaricato da `agent-browser` come `FIRECRAWL_CHROME_PATH`.
  - Su Linux, dove AppArmor limita i namespace utente non privilegiati, stampa un profilo AppArmor e i comandi `sudo` per caricarlo, perché Firecrawl Local non esegue mai Chrome senza la sua sandbox.
  - Senza un Chrome utilizzabile, le pagine che si renderizzano con JavaScript tornano vuote.
- `claude-settings`: le impostazioni consigliate di Claude Code, applicate solo se scelte, dopo un backup con timestamp di `settings.json`.

#### Registro di setup e ripristino

`emet setup` annota ogni elemento che termina `installed` in `setup-ledger.json`, nella directory di stato, come `{ id, at, undo }`. Un elemento `already-present` non annota nulla, e un secondo `installed` dello stesso id mantiene lo stato precedente della prima voce. Le scritture sul registro sono atomiche, e un registro malformato è un errore che ne indica il percorso, mai letto come vuoto.

I record di annullamento contengono ciò che serve per ripristinare:

- `claude-settings`: il `model` precedente (o nessuno), le regole deny effettivamente aggiunte e il percorso del backup.
- `firecrawl-local`: la voce MCP precedente a livello utente (letta da `~/.claude.json` prima dell'esecuzione di `claude mcp remove`) e se emet ha eseguito `cargo install`.
- Plugin: l'id del plugin.
- `orca-pet`: i file scritti.
- `agent-browser`: il globale bun (e il file di configurazione, quando l'ha creato emet).
- `context7`: il globale bun.
- `engram`: la formula brew e il plugin.

`emet setup --restore <id>` accetta solo `claude-settings` e `firecrawl-local`; qualsiasi altro id esce con 2.

- `claude-settings` ripristina il `model` precedente (o elimina la chiave quando non ce n'era uno) e rimuove solo le regole deny aggiunte da emet, dopo un backup con timestamp. Quando il `model` attuale non è quello impostato da setup, lo mantiene e stampa un avviso.
- `firecrawl-local` esegue `claude mcp remove firecrawl-local -s user`, poi `claude mcp add-json firecrawl-local '<previous json>' -s user` quando era stata annotata una voce.

Un ripristino riuscito rimuove la voce del registro; un id senza voce stampa `nothing to restore for <id>` ed esce con 1.

`emet uninstall` annulla ogni voce del registro allo stesso modo: `claude-settings` e `firecrawl-local` come con `--restore`, i plugin con `claude plugin uninstall <id>`, i file di `orca-pet` e una configurazione agent-browser creata da emet eliminandoli. Per i globali brew, bun e cargo stampa il comando di rimozione (per esempio `bun remove -g ctx7`) e non lo esegue mai, e non tocca mai `gh auth`. Ogni voce annullata esce dal registro, e un extra che fallisce non ferma gli altri.

### `emet self install`

L'installazione standalone: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: elenca ogni scrittura e non scrive nulla.
- `--force`: procede anche se il plugin emet è installato; senza, il comando si rifiuta di procedere mentre il plugin è installato.
- `--from <checkout>`: riproduce un'installazione da sorgenti con Bun. I sorgenti della CLI vengono copiati in `~/.claude/emet` e `~/.local/bin/emet` diventa un wrapper che esegue `bun` su di essi, così `emet selftest` funziona; fallisce senza `bun`. I contributori usano `emet self install --from .`.

Colloca il binario in `~/.local/share/emet/versions/<v>/emet` con il symlink `~/.local/bin/emet`, scrive i prompt di riferimento e `.install-manifest.json` in `~/.claude/emet/`, i comandi in `~/.claude/commands/emet/` e gli agenti in `~/.claude/agents/`.

Unisce gli hook di emet in `~/.claude/settings.json` (con un backup, hook estranei intatti) e, quando Codex è presente, scrive le skill sotto `~/.agents/skills` e aggiunge gli hook a `$CODEX_HOME/hooks.json` (predefinito `~/.codex`; `config.toml` non viene mai scritto, quindi approva gli hook una volta con `/hooks`).

Una seconda esecuzione non cambia nulla; un file modificato viene mantenuto e la nuova versione finisce accanto come `<file>.new`. Lo script di installazione in una riga da [Installazione](../start/install.md) scarica il binario della release, verifica `SHA256SUMS` ed esegue questo comando.

### `emet self update`

`emet self update [latest|X.Y.Z]` scarica la release, verifica `SHA256SUMS` (e l'attestazione quando `gh` è presente) e la mette in staging. Lo scambio del symlink e dei file installati avviene solo quando nessuno slot worker è occupato; altrimenti resta in sospeso fino al successivo avvio di sessione. Un errore lascia intatta la versione corrente e viene registrato nel journal. La versione precedente viene mantenuta per il rollback e quelle più vecchie vengono eliminate. Non fa nulla per le installazioni tramite plugin.

- `--auto [off|on]`: ciò che esegue l'hook `SessionStart`. Gira al massimo una volta al giorno, in background e in silenzio quando sei offline; `off` o `on` lo attiva o disattiva. Anche `EMET_AUTO_UPDATE=0` lo disattiva.

### `emet uninstall`

Rimuove un'installazione di `emet self install` e ciò che `emet setup` ha aggiunto. Costruisce prima l'intero piano, poi lo esegue.

- `--dry-run`: stampa il piano e non cambia nulla.
- `--yes`: salta la conferma. Con un TTY e senza `--yes` chiede una volta, e senza TTY e senza `--yes` stampa il piano, non cambia nulla ed esce con 0.
- `--purge`: rimuove anche la directory di stato (`EMET_STATE_DIR`, altrimenti `XDG_STATE_HOME/emet`) e `~/.emet`; senza, restano entrambe.
- `--json`: stampa il risultato come JSON.

Cosa rimuove:

- Ogni file del manifest di installazione il cui hash corrisponde ancora a quello registrato, insieme al suo gemello `.new`; i file modificati restano e vengono elencati.
- Lo shim `~/.local/bin/emet`, solo quando è il wrapper dell'installazione o un symlink verso `~/.claude/emet` o `~/.local/share/emet/versions`, poi il manifest e le directory rimaste vuote.
- Da `~/.claude/settings.json` e da `$CODEX_HOME/hooks.json` (predefinito `~/.codex`), ogni comando di hook di emet in qualsiasi evento (`emet guard`, `emet setup --notice`, `emet whats-new --hook` e `emet self update --auto`). Mantiene tutti gli altri hook ed elimina i gruppi e gli eventi rimasti vuoti.
- Le skill Codex sotto `~/.agents/skills/emet/` che corrispondono ancora a questo emet (quelle modificate restano e vengono elencate), la directory delle versioni `~/.local/share/emet/versions` e lo stato di installazione `~/.local/share/emet/install.json`.
- Gli extra del registro di setup (vedi [Registro di setup e ripristino](#registro-di-setup-e-ripristino)).

Quando un backup di installazione (`.pre-emet-guard-backup.`) contiene esattamente ciò che resta, ne vengono ripristinati i byte; quando non resta nulla, il file viene rimosso; altrimenti viene scritto prima un backup con timestamp.

Senza manifest o stato di installazione (installazione come plugin) salta i file e stampa `claude plugin uninstall emet@emet-marketplace`; quando `codex` è nel PATH stampa anche come rimuovere il plugin Codex. Esce con 1 quando un passo è fallito o un file che deve leggere (manifest, settings, registro) è illeggibile, e ne indica il percorso.

### `emet whats-new`

Stampa un avviso una tantum dopo gli aggiornamenti di emet.

- `--hook`: la forma che esegue l'hook `SessionStart`.

### `emet fleet`

Lavora sui repo git con un `emet.config.json` un livello sotto `--root` (predefinito `~/code`). Vedi la [guida alla flotta](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: elenca i repo con `tracker.kind`, `handoff.autoChain` e `models.worker`.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: modifica una chiave di configurazione in ogni repo elencato, validando prima tramite il caricatore di configurazione (un valore non valido non cambia nulla ed esce con 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: apre una sessione `/emet:run --draft <text>` in ogni repo dopo i controlli di prontezza di `emet chain`. `--dry-run` stampa i lanci pianificati senza avviare alcuna sessione.
- `emet fleet status [--json]`: legge il journal globale e stampa, per ogni repo, l'ultimo stato di ogni sessione nelle ultime 24 ore (esclusa `ended`).

`fleet status` stampa una riga `<repo>: <b> blocked, <w> working, <i> idle` per repo, con i repo bloccati per primi. `--json` stampa `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`. Esce con 0 anche quando non ci sono sessioni.

### `emet preflight`

Conferma che il repo è pronto per il dispatch.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` stampa il percorso assoluto di `SKILL.md` di una skill di mattpocock-skills. Esce con 1 se la skill non viene trovata.

### `emet selftest`

Esegue i test unitari della CLI stessa. Solo per installazioni da sorgenti; un binario compilato esce con 1 e ti dice di eseguire `emet doctor`.

## Esecuzioni, worker e slot

### `emet claims`

Riserva un ticket per un'esecuzione: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: rilascia un claim.
- `--list`: elenca i claim.
- `--prune [--dry-run]`: elimina i claim obsoleti.

### `emet slots`

Prende uno slot worker dal pool dell'host in `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: libera gli slot dell'esecuzione.
- `--release-index <index>`: libera uno slot.
- `--list`: elenca gli slot.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Senza argomenti, recupera le esecuzioni chiuse o morte il cui lavoro è atterrato. Dopo un merge, `emet cleanup --run <runId>` libera i branch, i claim dei ticket e gli slot dei worker dell'ondata.

- `--run <id>`: pulisce questa esecuzione.
- `--all`: una scansione dei branch su tutto il repo.
- `--dry-run`
- `--force`

In ogni modalità elimina anche ogni branch locale la cui PR è stata unita al commit di punta del branch, insieme al worktree di agente pulito e non bloccato che lo contiene.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` stampa il motivo del `git worktree lock` che un worker scrive al bootstrap.

### `emet launch`

`emet launch <spec-id> --wave <n>`: su Claude Code, avvia un'ondata come sessione `claude --bg` e ne apre la scheda di Orca secondo `handoff.launcher` (su Codex vedi [Host Codex](#host-codex)). Esegue l'intero avvio (controllo delle sessioni duplicate, `claude --bg`, scheda) e stampa `{ name, id, attach, orcaTab: { opened, reason } }`. Usalo, e non un semplice `claude --bg`, ogni volta che vuoi un'ondata in un'altra sessione a mano.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` esegue `emet gate` con i flag del gate ricevuti e avvia l'ondata successiva solo quando la decisione è `chain`.

Prima del lancio controlla la prontezza (margine di memoria dell'host, disco e inode liberi nel repo e in `/tmp`, la CLI `orca`) e poi conferma che la sessione figlia sia elencata. Qualsiasi altra decisione, un problema di prontezza bloccante (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) o una sessione già esistente per la stessa spec e ondata esce con 1 con i motivi e non lancia nulla.

### `emet status`

`emet status [--spec <id>] [--brief]` stampa Working / Checking / Ready / Needs-decision per ondata come JSON più una riga di riepilogo. `emet status --help` documenta il JSON.

- `--spec <id>`
- `--brief`: stampa invece al massimo tre righe: lo stato complessivo, ciò che attende una persona (se c'è) e l'azione successiva.

Il JSON include anche `sessions: [{sessionId, state, blocked, since, runId}]`: l'ultimo stato di attenzione di ogni sessione di proprietà di emet di questo repo nelle ultime 24 ore, escluse le sessioni `ended`. `blocked` è true quando `state` è `needs-decision`, e `since` è l'ora di quello stato. Qualsiasi sessione bloccata porta lo `state` complessivo a `needs-decision`, anche quando nessuna ondata è attiva; la riga di riepilogo indica quante sessioni sono bloccate e `--brief` le elenca nella riga di ciò che attende una persona.

### `emet run`

`emet run current [--json]` stampa l'esecuzione attiva del repo (id esecuzione, spec, ondata, fase e ultimo aggiornamento), letta da `.emet/phase.json`. Senza esecuzione attiva stampa `no active run` ed esce con 0.

### `emet memory`

Cerca e salva lezioni in [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: cerca le lezioni delle esecuzioni precedenti. Cerca con `match_mode: "any"` (`--limit` è 5 per impostazione predefinita, massimo 20), conserva solo le note la cui topic key inizia con `emet/<repo>/lessons/` e stampa `{available: true, results: [{id, topicKey, title, content}]}` con `content` troncato a 2000 caratteri. `<repo>` è l'ultimo segmento del percorso di `git remote get-url <repo.remote>` senza `.git`, altrimenti il nome base del worktree principale.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: legge da stdin da 1 a 5 punti elenco di lezioni (righe `- ` di al massimo 300 caratteri ciascuna) e li aggiunge come sezione `## <runId> — <outcome> (<date>)` alla nota con topic key `emet/<repo>/lessons/<key>`, oppure crea quella nota. Una nota oltre i 20000 caratteri scarta le sue sezioni più vecchie. Stampa `{available: true, saved: true, topicKey}`.

Entrambi i sottocomandi parlano con Engram avviando `engram mcp --tools=agent` nella radice del repo; il plugin Engram non è richiesto. Non passano mai un `project` a Engram.

Codici di uscita: `2` per un uso errato (nessun sottocomando, query mancante, nessun punto elenco, più di 5 punti elenco, un punto elenco oltre 300 caratteri, un esito sconosciuto, una key non valida). Ogni problema di Engram (non nel PATH, handshake fallito, errore di uno strumento, timeout, JSON malformato) esce con `0`.

- Prima di un handshake riuscito l'output è `{available: false, reason}`.
- Dopo, l'output è `{available: true, results: [], reason}` per `search` oppure `{available: true, saved: false, reason}` per `save`.
- `memory.enabled: "off"` stampa `{available: false, reason: "memory.enabled is off"}` e non avvia nulla. Vedi [`memory`](configuration.md#memory).

### `emet insights`

Legge il [diario degli eventi](../concepts/attention-and-journal.md) e riporta le esecuzioni per origine (umana o auto), le decisioni del gate per decisione e motivo, gli interventi umani per esecuzione, gli esiti dei lanci e i ticket chiusi. Le righe illeggibili vengono saltate e contate. Un diario vuoto o mancante stampa un report a zero ed esce con 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: aggiunge una baseline; i report successivi coprono solo gli eventi dopo di essa, a meno che non sia dato `--all`.

### `emet usage`

Riporta l'uso della sessione.

- `--session <id>` oppure `--file <path>`
- `--stalled [--minutes N]`: elenca i worker bloccati.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` valida o rende la nota `.emet/handoff-<ticket>.md` di un worker.

- `--check <path>`: valida la nota. Un controllo superato stampa `missing skills: …` quando l'elenco `missing` non è vuoto.
- `--expect-skills a,b` (solo con check): fa fallire il controllo per ogni skill indicata che non sia né nell'elenco `loaded` né in quello `missing`.
- `--render <path>`: rende la nota.

La nota può contenere una sezione `skills:`, scritta `skills: none` oppure `skills: loaded: a, b; missing: c`. È richiesta solo quando `state` è `done`, e qualsiasi altro valore fa fallire il controllo.

### `emet metrics`

`emet metrics [--run <id>]` riporta token, costo equivalente in API e tempo di esecuzione per ticket, per ondata e per esecuzione, letti dalle trascrizioni delle sessioni. Confronta inoltre il budget di contesto stimato per ticket con quello effettivamente usato da ogni worker. Il suo riepilogo va in fondo al report finale dell'esecuzione.

### `emet ask`

La casella di posta dei worker: interroga il coordinatore, oppure attende la risposta.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: invia la domanda.
- `--wait <n>`: attende la risposta.
- `--slice <seconds>`

Con `--wait`, l'uscita `0` è una risposta, `3` un timeout della slice e `4` scaduto.

### `emet inbox`

`emet inbox --run <id>` elenca come JSON le domande aperte dei worker.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` risponde a una domanda di un worker.

## Pianificazione, review e landing

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` è il passo after-spec, secondo [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: non apre alcuna pull request.
- `--no-promote`: salta il passo.
- `--hold`: scrive il marcatore `<run dir>/runs/<id>/no-promote` e stampa `{"held":true}`. Finché esiste, `emet promote --spec <id>` esce con 0 con una nota `skipped` e non apre alcuna pull request, così `--no-promote` sopravvive tra le sessioni di una spec.

In modalità `promote` apre una pull request da `develop` a `main` con titolo `chore: 🔖 promote develop`, attende con `emet ci --pr <n> --wait` e la unisce con un merge commit solo quando lo stato è `pass`. Poi, solo se `main` contiene contenuti che mancano a `develop` (il confronto `develop...main` elenca almeno un file modificato; i soli merge commit non contano), apre una pull request di sincronizzazione da `main` a `develop`, ne attende i check allo stesso modo e la unisce con [`pr.mergeMethod`](configuration.md#pr) solo quando lo stato è `pass`. Quando `main` contiene soltanto merge commit, non si apre alcuna pull request di sincronizzazione e `syncReason` ne spiega il motivo. Una pull request di sincronizzazione il cui stato è `fail`, `timeout` o `env-fault`, o il cui merge viene rifiutato, resta aperta e non cambia mai il risultato del promote.

Aggiunge al journal un evento `promote` con il numero della pull request, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` e `reason`. `afterSpec` può essere un elenco di regole; la modalità viene allora scelta in base ai percorsi che il promote di `develop` porterebbe con sé (vedi [`handoff.afterSpec`](configuration.md#handoff)), e un `git fetch` o `git diff` che fallisce fa uscire il comando con 1 prima che si apra qualsiasi pull request.

L'esito stampato contiene:

- `rule`: l'indice della regola corrispondente, oppure `null` per la forma stringa o nessuna corrispondenza.
- `reason`.
- `syncPrNumber`: `null` quando non si è aperta alcuna pull request di sincronizzazione.
- `syncMerged` e `syncReason`: una frase che spiega perché una pull request di sincronizzazione è stata lasciata aperta, altrimenti `null`.
- `deployCheck: { run, reason }`: indica se il coordinatore deve eseguire `emet deploy-check`.

In modalità `release` non unisce nulla e lascia la pull request di release a una persona. Con `afterSpec` `none`, con `--no-promote`, con una spec in hold, o quando l'ultima ondata della spec è stata lasciata aperta o segnalata, esce con 0 con una nota `skipped`. Viene comunque eseguito dopo un'ultima ondata pulita, così l'esito porta la decisione `deployCheck` (sul trunk `main` il deploy check viene eseguito qualunque sia la modalità). Una CI che non è `pass` non unisce nulla ed esce con 1.

### `emet deploy-check`

Esegue `deploy.check.command` finché esce con 0, fino a `retries` tentativi o `timeoutSeconds`, attendendo `intervalSeconds` tra l'uno e l'altro, e stampa `state: ok | failed | timeout` con `attempts`.

- `--json`

Uscita `0` ok, `1` failed, `3` timeout. Senza `deploy.check` configurato esce con 0 e `skipped: "no deploy check configured"`. Il coordinatore lo esegue solo quando l'esito di `emet promote` ha `deployCheck.run` true. Vedi [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` rifiuta glob di superfici consentite sovrapposti tra i ticket di un'ondata.

### `emet assess`

`emet assess --base <ref> --head <ref>` classifica un diff come `passive`, `medium` o `high` e stampa un JSON con il livello, i motivi e il modello e l'impegno consigliati per il reviewer. Vedi [Modelli e impegno](../../README.md#models--effort) e [`review`](configuration.md#review).

- `--quick`: il JSON contiene anche `"quickRejected": true|false` e il comando esce con 1 quando il livello è `high` (uno **Stop** per una **Quick run**: nessun auto-merge, la PR resta aperta), altrimenti con 0. Senza `--quick` l'output e i codici di uscita non cambiano.

Il JSON contiene anche due decisioni:

- `browserVerify: { run, reason }`: `run` è `true` solo quando il livello ha un reviewer, [`verify.browser`](configuration.md#verify) è configurato, il binario `agent-browser` è nel PATH e, quando `paths` è impostato, un percorso modificato corrisponde. Altrimenti `reason` indica la prima condizione non soddisfatta.
- `dualReview: { run, reason }`: `run` è `true` solo quando il livello è `high`, `agentHost` è `claude`, [`review.dual`](configuration.md#review) non è `off` e il binario `codex` è nel PATH. Altrimenti `reason` indica la prima condizione non soddisfatta.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` unisce un branch di integrazione nel trunk locale (`landing.mode` `merge`). `commands.selfCheck` sostituisce la CI e non viene inviato nulla.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` gestisce il branch della spec `spec/<id>` di `landing.unit: spec` (vedi [`landing`](configuration.md#landing)). Tutti stampano JSON.

- `ensure`: crea il branch dal trunk (idempotente), scrive `.emet/specs/<id>/branch.json` e rifiuta quando è in checkout il branch di un'altra spec.
- `integrate --wave <n> --branch <integration> --tickets a,b`: unisce il branch dell'ondata in `spec/<id>` con `--no-ff` e i trailer `Emet-Wave` ed `Emet-Tickets`, registra l'ondata, aggiunge `spec.integrate` e, quando `landing.pushSpecBranch` è true, invia il branch senza aprire una PR.
- `status`: stampa `branch`, `tip`, le ondate e i ticket integrati e `behindTrunk`, e ricostruisce `branch.json` dai trailer quando manca un'ondata.
- `sync`: unisce il trunk nel branch, non fa mai rebase, e in caso di conflitto annulla, elenca i percorsi ed esce con un codice diverso da zero.
- `land [--partial]`: sincronizza, poi in modalità `pr` invia il branch, apre una PR con una riga `Closes` per ticket, ne attende i check e la unisce con `landing.specMergeMethod` (di default un merge commit, ignorando `pr.mergeMethod`). In modalità `merge` unisce nel trunk locale con `--no-ff` e non invia mai nulla. Aggiunge `spec.land`.
- `abandon --force`: crea il tag `abandoned/spec-<id>`, elimina il branch, aggiunge `spec.abandon` e riporta a `ready-for-agent` i ticket integrati di un tracker locale; senza `--force` si rifiuta.

`emet tracker frontier` conta i ticket elencati in `branch.json` come blocchi chiusi, e `emet status` guadagna `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` fonde i delta dei requisiti `ADDED`/`MODIFIED`/`REMOVED` della spec in `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: stampa la directory in cui vanno i delta.

Con `specs.enabled` attivo, il coordinatore scrive i delta e lo esegue una volta per spec, sul branch di integrazione dell'ultima ondata prima della sua review, poi fa il commit del risultato. Controlla ogni area prima di scrivere qualsiasi cosa. Un conflitto, o un requisito che perderebbe uno scenario, esce con 1 e lascia ogni file intatto. Con `specs.enabled` disattivato non fonde nulla ed esce con 0.

### `emet map`

`emet map [--refresh]` scrive una sintesi di un codebase esistente (stack, struttura, convenzioni, test, hotspot) in `docs/agents/codebase.md` (`map.path`), marcata con lo SHA del commit da cui è stata costruita. Lo stesso commit produce sempre lo stesso file.

- `--refresh`
- `--stale`: esce con 1 quando HEAD ha superato il marcatore, e in tal caso `emet preflight` avvisa.
- `--for <globs>`: stampa solo le sezioni che corrispondono alle superfici di modifica di un ticket; quell'output è l'unica parte della mappa che un brief di worker include.

### `emet guard`

L'hook `PreToolUse` di Claude Code; legge il JSON dell'hook da stdin (la forma Codex è sotto [Host Codex](#host-codex)). `emet self install` lo collega in `~/.claude/settings.json`. Blocca una manciata di inneschi noti di fallimenti nelle esecuzioni senza supervisione (vedi `emet/src/guard.ts`).

## Tracker locale

Con `tracker.kind: "local"`, spec e ticket sono file markdown sotto `.scratch/` del worktree principale (non versionato): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, ciascuno con righe `Status:` e `Blocked by:` e commenti sotto `## Comments`. `emet init --tracker local` lo configura. Vedi [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` è `"pr"` (predefinito) o `"merge"`, indipendente dal tracker. In modalità `merge` un'ondata atterra come un unico merge locale nel trunk con `emet land`, con `commands.selfCheck` al posto della CI e senza push. Con `landing.unit: "spec"` (predefinito) l'intera spec atterra una volta con `emet spec-branch land`. `gh` serve solo quando il tracker è `github` o il landing è `pr`. Vedi [ADR-0010](../adr/0010-local-merge-landing.md) e [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` è il tracker locale su `.scratch/`, JSON su stdout. Il coordinatore legge e scrive spec e ticket tramite esso.

#### `emet tracker close`

Con `tracker.kind: "github"`, `emet tracker close <ticket>... [--pr <n>]` chiude ogni ticket (`CLA-<n>`, `#<n>` o un numero nudo) con `gh issue close --reason completed`, ne verifica lo stato e riporta `closed` o `already-closed`.

- `--pr <n>`: aggiunge il commento "Landed in #<n>".

Poi, per ogni genitore distinto di un ticket `closed` o `already-closed`, legge `gh issue view <spec> --json state,subIssuesSummary`. Quando la spec è aperta e `subIssuesSummary.completed` è uguale a un `total` diverso da zero, chiude la spec con `gh issue close --reason completed` e il commento "All <total> tickets landed.", poi la verifica.

L'output guadagna `specs`, un `{ spec, outcome, detail? }` per ogni genitore distinto con esito `closed`, `open`, `already-closed` o `failed`. Un ticket senza genitore non ne aggiunge, e una lettura o chiusura della spec fallita non cambia mai il risultato di un ticket. Esce con `1` se un ticket o una spec è fallito, dopo aver elaborato il resto. I ticket Linear vengono confermati Done dal coordinatore tramite l'MCP di Linear.

## PR di landing e concatenamento delle ondate

Con `landing.unit: "wave"`, un'ondata è una PR; con `"spec"`, una PR copre tutte le ondate integrate. Il suo corpo contiene una riga `Closes #N` per ogni ticket (la parola chiave di chiusura del tracker), e il coordinatore sposta i ticket in in-review quando apre la PR. La PR viene poi unita secondo `pr.autoMerge`, oppure resta aperta quando l'ondata è stata segnalata, `autoMerge` è `false` o le correzioni della CI sono esaurite (la PR riceve allora l'etichetta di decisione umana). Le ondate successive girano nelle proprie sessioni, mai in quella che ha eseguito l'ondata 1. Le sezioni `pr` e `handoff` controllano cosa succede dopo; vedi [`pr`](configuration.md#pr) e [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` interroga i check della PR finché non terminano o scade il timeout (predefinito 30). Stampa `state: pass | fail | env-fault | timeout`, i check falliti e `flakeReruns`, e non esegue mai il merge.

- `--rerun-flakes`: riesegue una volta ogni check fallito tramite `gh run rerun --failed`; un check che passa alla riesecuzione è un Flake.
- `--timeout-minutes <m>`

Una PR senza check è `pass` con `noChecks: true`. Uscita `0` pass, `1` fail o env-fault, `3` timeout. `env-fault` indica check terminati con `STARTUP_FAILURE` o rimasti in coda troppo a lungo: una CI che non è mai partita, non un errore del codice.

## Host Codex

Questi comandi servono l'Agent host Codex (`agentHost` `"codex"`); vedi la [guida a Codex](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: dopo aver controllato la prenotazione e lo slot, crea `.emet/worktrees/agent-<ticket>`, costruisce un overlay `CODEX_HOME` per esecuzione e avvia il worker come `codex exec` distaccato.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: attende la sua fine e stampa lo stato del risultato registrato.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` esegue il reviewer come `codex exec` in sola lettura su un pacchetto di `emet review-package` e stampa il JSON dei rilievi per `emet review --findings`. Il livello `passive` non avvia alcun processo.

- `--browser-verify true|false`: il predefinito è `false`. Con `true` il prompt termina con l'asse Browser, con `--session review-<run>` compilato da `--run`, così il reviewer Codex verifica la UI come fa il reviewer Claude (passalo quando `emet assess` ha stampato `browserVerify.run: true`; vedi [`verify`](configuration.md#verify)). Senza il flag il prompt non cambia, e un valore diverso da `true` o `false` esce con 2 con la riga di utilizzo.
- `--coverage-out <file>`: scrive anche i verdetti di Coverage del reviewer Codex in `<file>` come array JSON (stdout stampa comunque solo i rilievi); usalo sull'host Codex, dove gira un solo reviewer.

I rilievi possono contenere i campi facoltativi `s` e `userOption` descritti sotto `emet review`.

### `emet launch` su Codex

`emet launch <spec-id> --wave <n>` avvia un `codex exec` distaccato che esegue `$emet:run --dispatch <spec>` e registra il suo id di thread. Non si apre alcuna scheda Orca, e `codex exec resume <id>` riprende la sessione.

### `emet guard` su Codex

Con `EMET_AGENT_HOST=codex`, `emet guard` legge l'input degli hook di Codex, controlla i percorsi di `apply_patch` rispetto a `.emet/surface.json` e tiene chiuso il cancello di approvazione finché non arriva una riga di prompt `approve <id>`.

## Gate e registri

Le fasi non decidono da sole quando un ticket è finito, unibile o vale un altro tentativo. Chiamano un comando della CLI che legge un registro su disco e stampa la decisione. I registri di esecuzione stanno sotto `.emet/runs/<run-id>/` e il ledger delle review sotto `.emet/review/`, nel checkout principale, non nel worktree di un worker. I comandi qui sotto sono elencati nell'ordine della pipeline.

### `emet validate`

Prima dell'approvazione: `emet validate --spec <id> | --file <plan.json>` esegue la validazione del piano.

- Ogni `S#` è coperto da almeno un ticket e ha uno scenario di accettazione.
- Ogni ticket copre almeno un `S#`.
- Le superfici di modifica sono disgiunte all'interno di un'ondata.
- Nessun ciclo di dipendenze.
- Con [`validate.coupledSurfaces`](configuration.md#validate), un errore `coupled-surface-split` quando un ticket che tocca il `source` di una coppia è in un'ondata precedente a quella di un ticket che tocca i suoi `dependents` (uscita 1).
- Un elenco di ticket vuoto è un errore `no-tickets` (uscita 1, "plan has no tickets; write one folded ticket"), con o senza elementi `S#`. Un piano con un ticket marcato `folded: true` che copre ogni `S#` passa.

`emet preflight` lo esegue di nuovo sul piano approvato.

### `emet approve`

Approvazione: `emet approve --run <id> --spec <file>` scrive `approval.json` con gli hash della spec e dell'elenco dei ticket. Il dispatch si rifiuta se uno dei due cambia dopo (`--check`).

- `--quick`: scrive anche `"mode": "quick"`, che rende `wave` l'unità di landing per quell'esecuzione. Senza, il campo è assente e i record più vecchi superano comunque `--check`.

### `emet materialize-log`

Creazione dei ticket: `emet materialize-log --run <id> --record/--lookup` salva l'ID di ogni ticket creato non appena esiste, così un'esecuzione interrotta non crea mai duplicati.

### `emet results`

Worker terminato: `emet results --run <id> --write/--read <ticket>`. I worker scrivono un file di risultato locale (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` o `NEEDS_CONTEXT`, più una riga `Risk:`). Solo il coordinatore scrive sul tracker.

### `emet verify`

Dopo ogni worker: `emet verify <ticket> --run <id>` verifica che esistano commit oltre la base del dispatch, che ogni percorso modificato sia dentro le superfici di modifica del ticket, che la nota di handoff superi `handoff --check` e che `commands.workerScopedSuite` passi. Review e merge rifiutano un ticket senza registro di superamento.

### `emet review-package`

Input della review: `emet review-package <base> <head> --out <file>` raggruppa il diff per il reviewer, che lo riceve come percorso di file. Esce con 3 se l'intervallo è vuoto o non discende da base.

### `emet review`

Review: `emet review --ticket <t> --findings <file>` tiene il ledger dei rilievi e impone l'ordine di triage (`intent_gap` → `bad_plan` → `patch` → `defer`) e il limite di round.

- `--base <ref>`: risolve `<ref>` in uno sha al primo round e lo memorizza; i round successivi lo riutilizzano, e uno sha diverso esce con 2 indicando quello memorizzato. Un rilievo su una riga che il diff `<base>..HEAD` non ha aggiunto o modificato viene memorizzato con `preexisting: true`, e `emet gate` non lo conta come bloccante.
- `--findings <file>`: i rilievi accettano i campi facoltativi `s: "S<n>"` (il requisito interessato), `userOption: "S<n>"` e `agreement: "both"` o `"single"`. Un rilievo `userOption` contraddice un requisito `(user option)`: è sempre bloccante, anche quando preesistente, e con `gate.onHold: fix-and-continue` va in hold con `next: fix-findings`. Un `userOption` non stringa esce con 2.
- `--coverage <file or -> [--expect S1,S3]`: memorizza un array JSON di verdetti di Coverage `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) come `coverage` del ledger, sostituendo il precedente, e non usa alcun round di review. Apre un rilievo `VG-S<n>` (major, `patch`) per ogni `met` il cui `test` manca, il cui file non esiste o non contiene `test.name`, e per ogni S# di `--expect` senza verdetto. Un rilievo `VG-` si chiude solo quando un successivo `--coverage` non lo produce più o un verdetto di recheck lo risolve, mai per la sua assenza da un round di `--findings`. Stampa `{coverage, open}` ed esce con 1 finché un rilievo è aperto; non esegue test.
- `--merge <a.json> <b.json>` (senza `--ticket`): stampa un unico array di rilievi unito per `--findings -`. Due rilievi si accoppiano quando condividono `s` o condividono `file` con righe a distanza di al massimo 3, e una coppia mantiene l'`id` del primo file, la severità più alta e `agreement: "both"`. Un rilievo non accoppiato riceve `agreement: "single"`, con un id in collisione del secondo file prefissato da `X-`; un rilievo `userOption` non viene mai scartato.
- `--recheck --verdicts <file>`: termina un round di correzione. Vengono valutati solo i rilievi aperti al suo inizio, un rilievo diventa `resolved` solo tramite un verdetto, e il recheck conta contro `budgets.fixRounds` (uscita 1 che indica il limite quando è esaurito).
- `--escalate`: passa al livello di modello successivo.
- `--rule` e `--rulings`: registrano ed elencano le "Rulings I made" per il report e il corpo della PR.

### `emet gate`

Merge o catena: `emet gate <ticket> --tier … --ci … --integration …` stampa `merge`, `hold`, `chain`, `stop` o `defer` come JSON con i relativi motivi. Legge il registro di verify, i rilievi aperti, il livello di rischio, la CI, la suite di integrazione e i budget. Un `hold` porta `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` o `report-infrastructure`. Vedi [`gate`](configuration.md#gate).

- `--no-record`: tiene la decisione fuori dal journal.

Dopo che i branch di un'ondata sono stati uniti, `commands.fullSuite` viene eseguito una volta sul branch di integrazione. Un'esecuzione rossa blocca la PR e `autoChain`. Il gate riceve il risultato come `--integration`. Per i budget letti dal gate, vedi [`budgets`](configuration.md#budgets).

## Codici di uscita

I codici di uscita hanno significato in ogni sottocomando.

| Codice | Significato                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `0`    | Pulito.                                                                                               |
| `1`    | Riscontri su cui intervenire.                                                                         |
| `2`    | Errore di configurazione o di utilizzo; lo strumento non è mai partito. Anche un comando sconosciuto. |
| `3`    | Errore interno.                                                                                       |

Anche un flag sconosciuto esce con `2` e ne indica il nome. Ctrl-C esce con `130`.

## Flag globali

Ogni comando li accetta; i flag propri di ciascun comando sono elencati da `emet <command> --help`.

| Flag         | Effetto                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `--json`     | Stampa su stdout un unico envelope `{ok, data, error: {code, message, fix}}`, anche per `--help` e `--version`.   |
| `--no-color` | Disattiva il colore ANSI. Il colore rispetta anche `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` e se l'output è un TTY. |
| `--verbose`  | Stampa lo stack di un errore inatteso. Senza, il catch di primo livello stampa un errore su una riga.             |
| `--help`     | Stampa l'utilizzo del comando.                                                                                    |

`emet --version` stampa la versione; `emet --version --json` stampa `{"ok": true, "data": {"version": ...}, "error": null}`. Con `--json` un comando che fallisce esce con il suo solito codice e stampa `ok: false` con un `code` di errore tra `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` o `exit-<n>`; ciò che il comando ha stampato su stdout è il `data` dell'envelope.

Su un TTY, `emet` stampa su stderr un avviso su una riga quando è nota una release più recente. Controlla al massimo una volta al giorno, mette in cache la risposta, non attende mai la rete e resta in silenzio con `--json` o senza TTY.

## Variabili d'ambiente

Variabili rivolte all'utente. Una variabile, se impostata, sostituisce il valore di configurazione corrispondente.

| Variabile                     | Effetto                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` declassa un blocco di dipendenza a un avviso per quella sola esecuzione. Impostala nella tua shell, non in qualcosa che il coordinatore esegue senza supervisione. |
| `EMET_MAX_LIVE_WORKERS`       | Sostituisce [`concurrency.maxLiveWorkers`](configuration.md#concurrency); accetta un intero positivo o `auto`.                                                                                                    |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Sostituisce [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), in millisecondi.                                                                                                                    |
| `EMET_STATE_DIR`              | Directory di stato a livello di host, che contiene il pool di slot worker. Ordine di risoluzione: `$EMET_STATE_DIR`, poi `$XDG_STATE_HOME/emet`, poi `~/.local/state/emet`.                                       |
| `EMET_MEM_RESERVE_GIB`        | Margine di memoria in GiB che deve restare libero; un acquire viene negato quando la memoria disponibile è inferiore. Predefinito 8. Alimenta anche il tetto di worker `auto`.                                    |
| `EMET_MEM_PER_WORKER_GIB`     | Memoria in GiB presunta per worker quando `maxLiveWorkers` è `auto`. Predefinito 2. Aumentala per uno stack più pesante per worker, come una suite E2E guidata da browser per ogni worktree.                      |
| `EMET_CPU_OVERSUBSCRIBE`      | Moltiplicatore di CPU per il tetto di worker `auto`. Predefinito 1.                                                                                                                                               |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` disattiva `emet self update --auto`: esce con 0 senza alcuna chiamata di rete. Come `emet self update --auto off`.                                                                           |
| `EMET_AGENT_HOST`             | `codex` fa leggere a `emet guard` l'input degli hook di Codex. Impostata dagli hook di Codex; lasciala non impostata su Claude Code.                                                                              |

Il tetto `auto` è `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. I nomi legacy `FORGE_*` vengono ancora letti; `EMET_*` prevale quando entrambi sono impostati.
