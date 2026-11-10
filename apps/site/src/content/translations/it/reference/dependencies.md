---
title: Dipendenze
description: Di cosa ha bisogno emet sulla macchina e quale comando verifica ogni voce.
seoTitle: Dipendenze di emet
sourceHash: 1c97a7ccd5572ab4
---

Di cosa ha bisogno emet sulla macchina e quale comando verifica ogni voce. I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Torna al [README](../../README.md).

## Obbligatorie

Prima ciò che condividono entrambi gli Agent host, poi ciò che aggiunge ciascun host.

- **[bun](https://bun.sh)**: solo per le installazioni da sorgenti. Il binario standalone non richiede alcun runtime.
- **`rsync`** e **`sha256sum` o `shasum`**: richiesti da `install.sh`.
- **`git`**: richiesto a runtime. Quasi ogni sottocomando lo invoca tramite shell.
- **CLI `gh`, autenticata**: richiesta quando il tracker è `github` o il landing è `pr`. Le PR la usano sempre. Con `tracker.kind: "local"` e `landing.mode: "merge"`, `gh` non è richiesto.
- **Il plugin `mattpocock-skills`**: le fasi di intervista, spec e ticket richiamano skill che vivono lì. Su Claude Code viene dal marketplace `claude-plugins-official`; su Codex vedi [Host Codex](#host-codex).

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **La CLI `claude` e i comandi del plugin emet** (`/emet:run`, `/emet:init`, `/emet:doctor`): solo host Claude Code.
- **Gli agenti `emet-worker` e `emet-reviewer`** in `~/.claude/agents/`: solo host Claude Code, installati da `install.sh`. La fase 6 e la fase 8 fanno il dispatch tramite `subagent_type`, quindi la mancanza di uno dei due interrompe il dispatch. Vedi [Modelli e impegno](../../README.md#models--effort).
- **Un server MCP di Linear dichiarato in `.mcp.json` (o a livello utente)**: solo se il repo usa il tracker `linear`. emet verifica la dichiarazione. Se la connessione sia autenticata è nell'archivio delle credenziali dell'Agent host e da qui non si può controllare. Su Claude Code, se un'esecuzione non riesce a leggere i ticket, riavvia Claude Code e approva la connessione. Il passaggio equivalente su Codex non è verificato.

Nulla di quanto sopra viene mai installato o autenticato al posto dell'utente. Cambia chi lo controlla e con quanta severità.

## Host Codex

Solo quando `agentHost` è `"codex"`; vedi la [guida a Codex](../guide/codex.md). Gli agenti `emet-worker` e `emet-reviewer` lì non si usano.

- **La CLI `codex`**, con accesso effettuato, alla versione `codex.minVersion` (predefinita `0.167.0`) o successiva. `emet doctor` verifica che `codex exec --help` elenchi `--json` e `--output-schema`.
- **Il plugin `mattpocock-skills`** in Codex, verificato con `codex plugin list`:

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **Il plugin emet per Codex** (`.codex-plugin/plugin.json`), che fornisce le skill `$emet:run`, `$emet:init` e `$emet:doctor` e l'hook di approvazione.

emet non scrive mai nel tuo `~/.codex`: i worker girano con un `CODEX_HOME` per esecuzione che collega la tua autenticazione e configurazione.

## Cosa controlla cosa

|                                                                                 | `emet init`                        | `emet doctor`                               | `emet preflight`                                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| plugin mancante/disattivato                                                     | stampa il comando di installazione | lo segnala (una volta, per tutta la flotta) | **blocca il dispatch**                                                                            |
| agente `emet-worker`/`emet-reviewer` mancante (solo host Claude Code)           | —                                  | lo segnala (una volta, per tutta la flotta) | **blocca il dispatch**                                                                            |
| `gh` mancante/non autenticato (tracker: `github`)                               | stampa cosa eseguire               | lo segnala                                  | **blocca il dispatch**                                                                            |
| server Linear non dichiarato (tracker: `linear`)                                | stampa una nota                    | lo segnala                                  | **blocca il dispatch**                                                                            |
| la CLI dell'host (`claude` su Claude Code) non nel PATH, o una sonda in timeout | stampa una nota                    | lo segnala                                  | **avvisa, non blocca mai**: significa «non è stato possibile controllare», non «verificato rotto» |
| un flag da cui emet dipende manca in `--help`                                   | —                                  | lo segnala                                  | —                                                                                                 |

### Controlli sui flag

`emet doctor` verifica i flag stessi, non solo che i binari esistano. Legge `--help` per `gh issue view` e `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) e, a seconda dell'host, la CLI propria dell'Agent host: su Claude Code `claude` (`--bg`) e `claude agents` (`--json`), su Codex invece `codex exec` (`--json`, `--output-schema`). Segnala ogni flag che una CLI più recente o più vecchia non documenta più. Un flag rinominato farebbe altrimenti fallire un'ondata a metà.

### Timeout e come saltare un blocco

Ogni sonda è limitata a 5 s, così un `gh auth status` bloccato (senza rete) non può fermare un'ondata. Se un blocco di `preflight` è esso stesso sbagliato per il tuo ambiente, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` lo declassa a un avviso per quella sola esecuzione. Impostala nella tua shell, non in qualcosa che il coordinatore `/emet` esegue senza supervisione. Vedi [Variabili d'ambiente](cli.md#variabili-dambiente).

### Binari gestiti dal repo

Le `preflight.requiredCommands` di un repo (in `emet.config.json`) sono un elenco separato, gestito dal repo, di binari che `emet preflight` e `emet doctor` richiedono nel PATH. È utile per `rg` e `sg`, che i prompt dei worker propongono come alternative più rapide alla lettura integrale di un file. `gh` non deve essere elencato lì; il controllo qui sopra lo copre già. Vedi [`preflight`](configuration.md#preflight).

Per errori e soluzioni, vedi la [risoluzione dei problemi](../troubleshooting.md#un-controllo-delle-dipendenze-fallisce).
