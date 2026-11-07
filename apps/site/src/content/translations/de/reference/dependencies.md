---
title: Abhängigkeiten
description: Was emet auf dem Rechner braucht und welcher Befehl jeden Eintrag prüft.
seoTitle: Abhängigkeiten von emet
sourceHash: 628a2bb58f655fd5
---

Was emet auf dem Rechner braucht und welcher Befehl jeden Eintrag prüft. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Zurück zur [README](../../README.md).

## Erforderlich

- **[bun](https://bun.sh)**: nur für Installationen aus dem Quellcode. Die eigenständige Binärdatei braucht keine Laufzeitumgebung.
- **`rsync`** und **`sha256sum` oder `shasum`**: von `install.sh` benötigt.
- **`git`**: zur Laufzeit erforderlich. Nahezu jeder Unterbefehl ruft es über die Shell auf.
- **`gh`-CLI, angemeldet**: erforderlich, wenn der Tracker `github` ist oder das Landing `pr` verwendet. PRs nutzen es immer. Mit `tracker.kind: "local"` und `landing.mode: "merge"` ist `gh` nicht erforderlich.
- **Das Plugin `mattpocock-skills`** (Marketplace `claude-plugins-official`): Die Phasen Interview, Spec und Ticket von `/emet` rufen Skills auf, die dort liegen.

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **Die Agents `emet-worker` und `emet-reviewer`** in `~/.claude/agents/`: von `install.sh` installiert. Phase 6 und Phase 8 dispatchen über `subagent_type`, daher bricht das Fehlen eines der beiden den Dispatch. Siehe [Modelle und Aufwand](../../README.md#models--effort).
- **Ein in `.mcp.json` (oder im Nutzerbereich) deklarierter Linear-MCP-Server**: nur, wenn das Repo den Tracker `linear` verwendet. emet prüft die Deklaration. Ob die Verbindung angemeldet ist, steht im eigenen Credential-Speicher von Claude Code und lässt sich von hier aus nicht prüfen. Schlägt ein Lauf beim Lesen von Tickets fehl, Claude Code neu starten und die Verbindung freigeben.

Nichts davon wird jemals im Auftrag des Nutzers installiert oder angemeldet. Unterschiedlich ist, wer es prüft und wie streng.

## Was was prüft

|                                                             | `emet init`                      | `emet doctor`                   | `emet preflight`                                                                                  |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Plugin fehlt/deaktiviert                                    | gibt den Installationsbefehl aus | meldet es (einmal, flottenweit) | **blockiert den Dispatch**                                                                        |
| Agent `emet-worker`/`emet-reviewer` fehlt                   | —                                | meldet es (einmal, flottenweit) | **blockiert den Dispatch**                                                                        |
| `gh` fehlt/nicht angemeldet (Tracker: `github`)             | gibt aus, was auszuführen ist    | meldet es                       | **blockiert den Dispatch**                                                                        |
| Linear-Server nicht deklariert (Tracker: `linear`)          | gibt einen Hinweis aus           | meldet es                       | **blockiert den Dispatch**                                                                        |
| `claude` nicht im PATH oder eine Sonde läuft in ein Timeout | gibt einen Hinweis aus           | meldet es                       | **warnt, blockiert nie**: Das heißt „konnte nicht geprüft werden“, nicht „als defekt verifiziert“ |
| ein von emet benötigtes Flag fehlt in `--help`              | —                                | meldet es                       | —                                                                                                 |

### Flag-Prüfungen

`emet doctor` prüft die Flags selbst, nicht nur, ob die Binärdateien existieren. Es liest `--help` für `gh issue view` und `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) und `claude agents` (`--json`) und meldet jedes Flag, das eine neuere oder ältere CLI nicht mehr dokumentiert. Ein umbenanntes Flag würde sonst eine Welle mittendrin scheitern lassen.

### Timeouts und Überspringen einer Sperre

Jede Sonde ist auf 5 s begrenzt, damit ein hängendes `gh auth status` (ohne Netzwerk) keine Welle blockieren kann. Ist eine Sperre von `preflight` für die eigene Umgebung selbst falsch, stuft `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` sie für diesen einen Lauf zu einer Warnung herab. In der eigenen Shell setzen, nicht in etwas, das der `/emet`-Koordinator unbeaufsichtigt ausführt. Siehe [Umgebungsvariablen](cli.md#umgebungsvariablen).

### Repo-eigene Binärdateien

Die `preflight.requiredCommands` eines Repos (in `emet.config.json`) sind eine separate, repo-eigene Liste von Binärdateien, die `emet preflight` und `emet doctor` im PATH voraussetzen. Sie ist nützlich für `rg` und `sg`, die die Worker-Prompts als schnellere Alternativen zum vollständigen Lesen einer Datei anbieten. `gh` muss dort nicht aufgeführt werden; die obige Prüfung deckt es bereits ab. Siehe [`preflight`](configuration.md#preflight).

Zu Fehlern und Lösungen siehe [Fehlerbehebung](../troubleshooting.md#eine-abhängigkeitsprüfung-schlägt-fehl).
