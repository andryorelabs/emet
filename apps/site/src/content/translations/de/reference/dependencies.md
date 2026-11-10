---
title: Abhängigkeiten
description: Was emet auf dem Rechner braucht und welcher Befehl jeden Eintrag prüft.
seoTitle: Abhängigkeiten von emet
sourceHash: 1c97a7ccd5572ab4
---

Was emet auf dem Rechner braucht und welcher Befehl jeden Eintrag prüft. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Zurück zur [README](../../README.md).

## Erforderlich

Zuerst, was beide Agent-Hosts gemeinsam haben, dann, was jeder Host hinzufügt.

- **[bun](https://bun.sh)**: nur für Installationen aus dem Quellcode. Die eigenständige Binärdatei braucht keine Laufzeitumgebung.
- **`rsync`** und **`sha256sum` oder `shasum`**: von `install.sh` benötigt.
- **`git`**: zur Laufzeit erforderlich. Nahezu jeder Unterbefehl ruft es über die Shell auf.
- **`gh`-CLI, angemeldet**: erforderlich, wenn der Tracker `github` ist oder das Landing `pr` verwendet. PRs nutzen es immer. Mit `tracker.kind: "local"` und `landing.mode: "merge"` ist `gh` nicht erforderlich.
- **Das Plugin `mattpocock-skills`**: Die Phasen Interview, Spec und Ticket rufen Skills auf, die dort liegen. Unter Claude Code kommt es aus dem Marketplace `claude-plugins-official`; für Codex siehe [Codex-Host](#codex-host).

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **Die `claude`-CLI und die Plugin-Befehle von emet** (`/emet:run`, `/emet:init`, `/emet:doctor`): nur Claude-Code-Host.
- **Die Agents `emet-worker` und `emet-reviewer`** in `~/.claude/agents/`: nur Claude-Code-Host, von `install.sh` installiert. Phase 6 und Phase 8 dispatchen über `subagent_type`, daher bricht das Fehlen eines der beiden den Dispatch. Siehe [Modelle und Aufwand](../../README.md#models--effort).
- **Ein in `.mcp.json` (oder im Nutzerbereich) deklarierter Linear-MCP-Server**: nur, wenn das Repo den Tracker `linear` verwendet. emet prüft die Deklaration. Ob die Verbindung angemeldet ist, steht im eigenen Credential-Speicher des Agent-Hosts und lässt sich von hier aus nicht prüfen. Schlägt unter Claude Code ein Lauf beim Lesen von Tickets fehl, Claude Code neu starten und die Verbindung freigeben. Der entsprechende Schritt unter Codex ist nicht verifiziert.

Nichts davon wird jemals im Auftrag des Nutzers installiert oder angemeldet. Unterschiedlich ist, wer es prüft und wie streng.

## Codex-Host

Nur wenn `agentHost` `"codex"` ist; siehe den [Codex-Leitfaden](../guide/codex.md). Die Agents `emet-worker` und `emet-reviewer` werden dort nicht verwendet.

- **Die `codex`-CLI**, angemeldet, in Version `codex.minVersion` (Standard `0.167.0`) oder neuer. `emet doctor` prüft, dass `codex exec --help` `--json` und `--output-schema` aufführt.
- **Das Plugin `mattpocock-skills`** in Codex, geprüft mit `codex plugin list`:

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **Das emet-Plugin für Codex** (`.codex-plugin/plugin.json`), das die Skills `$emet:run`, `$emet:init` und `$emet:doctor` sowie den Freigabe-Hook mitbringt.

emet schreibt nie in dein `~/.codex`: Worker laufen mit einem `CODEX_HOME` pro Lauf, das deine Anmeldung und Konfiguration verlinkt.

## Was was prüft

|                                                                                              | `emet init`                      | `emet doctor`                   | `emet preflight`                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Plugin fehlt/deaktiviert                                                                     | gibt den Installationsbefehl aus | meldet es (einmal, flottenweit) | **blockiert den Dispatch**                                                                        |
| Agent `emet-worker`/`emet-reviewer` fehlt (nur Claude-Code-Host)                             | —                                | meldet es (einmal, flottenweit) | **blockiert den Dispatch**                                                                        |
| `gh` fehlt/nicht angemeldet (Tracker: `github`)                                              | gibt aus, was auszuführen ist    | meldet es                       | **blockiert den Dispatch**                                                                        |
| Linear-Server nicht deklariert (Tracker: `linear`)                                           | gibt einen Hinweis aus           | meldet es                       | **blockiert den Dispatch**                                                                        |
| die Host-CLI (`claude` unter Claude Code) nicht im PATH oder eine Sonde läuft in ein Timeout | gibt einen Hinweis aus           | meldet es                       | **warnt, blockiert nie**: Das heißt „konnte nicht geprüft werden“, nicht „als defekt verifiziert“ |
| ein von emet benötigtes Flag fehlt in `--help`                                               | —                                | meldet es                       | —                                                                                                 |

### Flag-Prüfungen

`emet doctor` prüft die Flags selbst, nicht nur, ob die Binärdateien existieren. Es liest `--help` für `gh issue view` und `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) und, je nach Host, die eigene CLI des Agent-Hosts: unter Claude Code `claude` (`--bg`) und `claude agents` (`--json`), unter Codex stattdessen `codex exec` (`--json`, `--output-schema`). Es meldet jedes Flag, das eine neuere oder ältere CLI nicht mehr dokumentiert. Ein umbenanntes Flag würde sonst eine Welle mittendrin scheitern lassen.

### Timeouts und Überspringen einer Sperre

Jede Sonde ist auf 5 s begrenzt, damit ein hängendes `gh auth status` (ohne Netzwerk) keine Welle blockieren kann. Ist eine Sperre von `preflight` für die eigene Umgebung selbst falsch, stuft `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` sie für diesen einen Lauf zu einer Warnung herab. In der eigenen Shell setzen, nicht in etwas, das der `/emet`-Koordinator unbeaufsichtigt ausführt. Siehe [Umgebungsvariablen](cli.md#umgebungsvariablen).

### Repo-eigene Binärdateien

Die `preflight.requiredCommands` eines Repos (in `emet.config.json`) sind eine separate, repo-eigene Liste von Binärdateien, die `emet preflight` und `emet doctor` im PATH voraussetzen. Sie ist nützlich für `rg` und `sg`, die die Worker-Prompts als schnellere Alternativen zum vollständigen Lesen einer Datei anbieten. `gh` muss dort nicht aufgeführt werden; die obige Prüfung deckt es bereits ab. Siehe [`preflight`](configuration.md#preflight).

Zu Fehlern und Lösungen siehe [Fehlerbehebung](../troubleshooting.md#eine-abhängigkeitsprüfung-schlägt-fehl).
