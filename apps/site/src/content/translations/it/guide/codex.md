---
title: Eseguire emet su Codex
description: "Usa Codex come Agent host di emet: installa il plugin, imposta agentHost, approva una sola volta e conosci i limiti."
seoTitle: Eseguire emet su Codex
sourceHash: fedf7f4694193076
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

4. Installa la CLI `emet` come descritto in [Per iniziare](getting-started.md), poi esegui `emet doctor .`. `install.sh` installa anche i comandi e gli agenti di Claude Code sotto `~/.claude`; su Codex è innocuo, e `emet doctor` non avvisa se il plugin Codex e `install.sh` sono presenti insieme. Sull'host Codex segnala un `codex` più vecchio di `codex.minVersion`, un flag `--json` o `--output-schema` mancante in `codex exec` e un `mattpocock-skills` assente, con i due comandi qui sopra.

Entrambi i comandi di plugin del passo 3 sono stati eseguiti contro il vero `codex` (0.167.0): in un `CODEX_HOME` pulito terminano con codice 0 e `codex plugin list` mostra `emet@emet-marketplace installed, enabled`. La forma con percorso locale, `codex plugin marketplace add <repo>`, dà lo stesso risultato.

## Scegliere l'Agent host

Imposta `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

Il valore predefinito è `"claude"`. La sezione `codex` imposta i modelli, l'impegno, la versione minima e la sandbox; vedi il [riferimento della configurazione](../reference/configuration.md#codex) e [Modelli e impegno](models-and-effort.md). Avvia una run da Codex con `$emet:run`. `emet launch <spec> --wave <n>` avvia un'ondata in un `codex exec` scollegato e ne registra l'id del thread, così `codex exec resume <id>` la riprende; non viene aperta alcuna scheda di Orca.

## L'unica approvazione

emet chiede una sola approvazione, dopo il piano. Su Claude Code è un prompt. Su Codex è un hook:

- Finché `.emet/runs/spec<id>/approval.json` non esiste, `emet guard` nega ogni mutazione (`apply_patch`, `Bash`) tranne le scritture sotto `.emet/runs/**/draft/**`, con il motivo `not approved: send approve <id>`. Il gate si applica quando esiste una directory `.emet/runs/spec<id>/` senza il suo `approval.json`, lo stato in cui `$emet:run` lascia la run dopo la Fase 4, che materializza lo spec.
- Approvi inviando una riga di prompt che sia esattamente `approve <id>`. L'hook `UserPromptSubmit` scrive allora il file di approvazione con lo stesso hashing di `emet approve`. Le stesse parole nell'output di uno strumento o nel testo del modello non fanno nulla.
- L'alternativa è `/plan $emet:run`: approva il piano nella modalità piano di Codex invece che tramite l'hook.

Una volta che quella directory esiste, il gate fallisce in modo chiuso: un file di approvazione mancante o illeggibile mantiene negate le mutazioni. Il guard controlla anche ogni percorso di un `apply_patch` rispetto al `.emet/surface.json` del ticket.

## Come procede un'ondata

- `emet dispatch --role worker` controlla il claim e lo slot, crea `.emet/worktrees/agent-<ticket>`, costruisce un overlay di `CODEX_HOME` per run sotto `.emet/runs/<run>/codex-home/`, e avvia `codex exec` con il modello e l'impegno risolti, la modalità `codex.sandbox` (`danger-full-access` per impostazione predefinita), `--json` e `--output-schema`. Gli eventi vengono catturati in `.emet/runs/<run>/codex/<ticket>.jsonl`. Il worker è identificato dal `threadId` del suo evento `thread.started` e da quel percorso JSONL; l'id di processo è solo un campo ausiliario.
- L'overlay è generato, non collegato. Il tuo `auth.json` è collegato con un symlink (mai copiato), la cache del plugin emet è collegata dalla tua home Codex quando esiste, e l'overlay scrive un proprio `config.toml` minimo: il marketplace locale e `[plugins."emet@emet-marketplace"] enabled = true`, una tabella `[projects."<dir>"]` `trusted` solo per le directory proprie del run, e il `model` e il `model_reasoning_effort` risolti. Nessuna delle tue tabelle `[projects]` né altre impostazioni vengono copiate, e il tuo `~/.codex` non viene mai scritto.
- Il `rules/default.rules` dell'overlay consente `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` e i sottocomandi `emet` `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff` e `ask`, e vieta `git push`. Poiché la sandbox predefinita non blocca più le scritture, `emet guard` nega anche qualsiasi comando `Bash` il cui argv esegue `git push`, inclusi `git -C <dir> push` e `git --git-dir=<dir> push`, qualunque sia la sandbox.
- Un worker non ha mai un canale laterale verso il coordinatore. Esegue l'escalation tramite la casella del run: `emet ask --run <run> --ticket <ticket> --body <text>` registra una domanda e stampa il suo id, e `emet ask ... --wait <n>` interroga la risposta (il codice di uscita 0 la stampa, 3 significa che la finestra è trascorsa, 4 significa che `budgets.askWaitMinutes` è esaurito, quindi il worker scrive un risultato BLOCKED ed esce). Finché un worker attivo ha una domanda aperta, `emet dispatch --wait` stampa `question <ticket> <id>` invece di uno stato di risultato e non classifica mai il worker come bloccato; il coordinatore legge `emet inbox --run <run>`, risponde con `emet reply --run <run> --ticket <ticket> --id <n> --body <text>` e riprende `emet dispatch --wait`. Un risultato registrato prevale sempre su una domanda aperta. Vedi [ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md).
- I risultati vengono letti da `<git-common-dir>/.emet/runs/<run>/results/`, lo stesso posto in cui scrive `emet results --write`, così un worker nel proprio worktree viene trovato.
- `emet review-run` esegue il revisore in sola lettura su un pacchetto prodotto da `emet review-package`; il livello `passive` non avvia alcun processo.
- I modelli vengono risolti rispetto a `models_cache.json` nella home del run, altrimenti nella tua home Codex reale (sola lettura). Uno slug configurato che non è elencato viene sostituito e la sostituzione viene registrata; se nulla si risolve, `emet review-run` fallisce prima della chiamata al modello e nomina il ruolo e gli slug elencati.
- Utilizzo e rilevamento dello stallo leggono il JSONL catturato: l'uso di token dagli eventi `turn.completed` e la vitalità dalla crescita del file, così un worker in un altro namespace di pid risulta comunque vivo. `emet preflight` e `emet cleanup` condividono un'unica regola per un worktree senza proprietario recuperabile (branch di worker, ticket atterrato, albero pulito, nessun lock estraneo), quindi preflight consiglia `emet cleanup` solo quando cleanup agirebbe.

## Cosa ha mostrato il run Codex reale

Il [report della sonda](../research/codex-probe-report.md) ha rieseguito ogni controllo con `codex-cli 0.167.0` (piano gratuito ChatGPT, Linux) dopo queste modifiche. Tutte le righe `failed` precedenti ora sono `verified`:

- Un flusso di 2 ondate ha fatto atterrare sul trunk veri commit di worker Codex: l'ondata 1 da `emet dispatch`, l'ondata 2 da una sessione avviata con `emet launch <spec> --wave 2` che ha caricato `$emet:run` dalla cache del plugin dell'overlay. `emet review-run` è stato eseguito in ogni flusso.
- L'e2e opzionale (`EMET_CODEX_E2E=1`) passa: il worker fa commit sotto `danger-full-access`, e `codex execpolicy check` risponde `forbidden` per `git push origin develop` e `allow` per `git -C <dir> commit`.
- `~/.codex/config.toml` ha mantenuto lo stesso sha256 durante la sonda, l'e2e e sette flussi.

## Limiti e punti `unverified`

- L'impegno `ultra` non viene mai inviato ed è rifiutato nella configurazione.
- `danger-full-access` è il valore predefinito di `codex.sandbox` per i worker Codex e per `emet launch`, perché la sandbox `workspace-write` rende `.git` di sola lettura e un worker non potrebbe fare commit. Imposta `codex.sandbox` su `"workspace-write"` per mantenere la sandbox; i worker allora non possono fare commit. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) registra il compromesso. Il percorso Claude non lo usa mai. Senza sandbox, il rifiuto del push in `emet guard` e il file delle regole sono le protezioni.
- Non esistono equivalenti di `ScheduleWakeup`, `TaskStop` o `LSP`. emet interroga invece la propria CLI.
- I file rollout sotto `~/.codex/sessions` non hanno un formato stabile, quindi emet legge l'output di `exec --json` che ha catturato da sé.
- Verificato contro la vera CLI, e ancora dietro piccole funzioni, così un cambiamento in Codex tocca un solo punto: un `CODEX_HOME` per run con autenticazione collegata, il file delle regole in `rules/default.rules`, `--dangerously-bypass-hook-trust`, l'alias `CLAUDE_PLUGIN_ROOT` nei comandi degli hook, il formato di output di `codex plugin list`, un modello che carica una skill per nome, `emet dispatch` dentro una sessione annidata, un modello che tenta di falsificare `approval.json` (negato) ed entrambe le forme di `codex plugin marketplace add`. Vedi [la ricerca di fattibilità](../research/codex-viability.md).
- Ancora `unverified`: eseguire Codex da un supervisore non presidiato sotto systemd o in un container (è stato provato solo un processo staccato).
- Seguiti noti dal report della sonda: `emet init` scrive nomi di modelli Claude in `models` per `agentHost: "codex"`, un `emet dispatch --model` esplicito non viene risolto rispetto alla cache, `emet lock-reason` cerca un antenato `claude`, e un ticket il cui worker è morto non può essere ri-dispatchato nello stesso worktree.
- Nomi e prezzi dei modelli Codex cambiano; la tabella dei prezzi va ricontrollata dopo che saranno state eseguite ondate reali.
