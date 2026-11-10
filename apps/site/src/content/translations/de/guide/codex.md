---
title: emet mit Codex ausführen
description: "Codex als Agent host für emet nutzen: Plugin installieren, agentHost setzen, einmal freigeben und die Grenzen kennen."
seoTitle: emet mit Codex ausführen
sourceHash: fedf7f4694193076
---

emet läuft neben Claude Code auch auf der Codex CLI. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md); das Produkt, in dem ein Lauf ausgeführt wird, ist der **Agent host**. Diese Seite behandelt die Installation auf der Codex-Seite, die Wahl des Hosts, die einmalige Freigabe und die bekannten Grenzen. Zurück zum [Dokumentationsindex](../README.md).

Auf dem Codex-Host bleibt die Pipeline dieselbe: Interview, Spec, Tickets, eine Freigabe, parallele Worker in Worktrees, ein Review pro Welle, dann das Landen. Anders ist nur die Technik darunter. Jeder Worker und jeder Reviewer ist ein eigener `codex exec`-Prozess, gestartet von `emet dispatch` und `emet review-run`, und aus den Slash-Befehlen werden die Skills `$emet:run`, `$emet:init` und `$emet:doctor`. Der Claude-Code-Pfad bleibt unberührt.

## Installation

1. Installiere die `codex` CLI in der Version aus `codex.minVersion` (Standard `0.167.0`) oder neuer und melde dich an.
2. Installiere das Plugin `mattpocock-skills` in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Installiere das emet-Plugin. Das Repository enthält `.codex-plugin/plugin.json` sowie die generierten Skills und Hooks unter `codex/`:

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Installiere die `emet` CLI wie in [Erste Schritte](getting-started.md) beschrieben und führe dann `emet doctor .` aus. `install.sh` installiert außerdem die Claude-Code-Befehle und -Agents unter `~/.claude`; das ist unter Codex harmlos, und `emet doctor` warnt nicht davor, dass das Codex-Plugin und `install.sh` zusammen vorhanden sind. Auf dem Codex-Host meldet es ein `codex`, das älter als `codex.minVersion` ist, ein fehlendes Flag `--json` oder `--output-schema` bei `codex exec` und ein fehlendes `mattpocock-skills` samt den beiden Befehlen oben.

Beide Plugin-Befehle aus Schritt 3 wurden gegen das echte `codex` (0.167.0) ausgeführt: In einem frischen `CODEX_HOME` enden sie mit Exit-Code 0, und `codex plugin list` zeigt `emet@emet-marketplace installed, enabled`. Die Form mit lokalem Pfad, `codex plugin marketplace add <repo>`, liefert dasselbe Ergebnis.

## Den Agent host wählen

Setze `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

Der Standard ist `"claude"`. Der Abschnitt `codex` legt Modelle, Aufwand, Mindestversion und Sandbox fest; siehe die [Konfigurationsreferenz](../reference/configuration.md#codex) und [Modelle und Aufwand](models-and-effort.md). Starte einen Lauf in Codex mit `$emet:run`. `emet launch <spec> --wave <n>` startet eine Welle in einem losgelösten `codex exec` und speichert dessen Thread-ID, sodass `codex exec resume <id>` sie fortsetzt; es wird kein Orca-Tab geöffnet.

## Die einmalige Freigabe

emet verlangt eine einzige Freigabe, nach dem Plan. In Claude Code ist das ein Prompt. In Codex ist es ein Hook:

- Solange `.emet/runs/spec<id>/approval.json` nicht existiert, verweigert `emet guard` jede Änderung (`apply_patch`, `Bash`), außer Schreibzugriffen unter `.emet/runs/**/draft/**`, mit der Begründung `not approved: send approve <id>`. Das Gate greift, sobald ein Verzeichnis `.emet/runs/spec<id>/` ohne `approval.json` existiert; in diesem Zustand hinterlässt `$emet:run` den Lauf, nachdem Phase 4 den Spec materialisiert hat.
- Du gibst frei, indem du eine Prompt-Zeile sendest, die genau `approve <id>` lautet. Der `UserPromptSubmit`-Hook schreibt dann die Freigabedatei mit demselben Hashing wie `emet approve`. Dieselben Worte in Tool-Ausgaben oder Modelltext bewirken nichts.
- Die Alternative ist `/plan $emet:run`: Gib den Plan im eigenen Plan-Modus von Codex frei statt über den Hook.

Sobald dieses Verzeichnis existiert, schlägt das Gate geschlossen fehl: Eine fehlende oder unlesbare Freigabedatei hält Änderungen verweigert. Der Guard prüft außerdem jeden Pfad eines `apply_patch` gegen die `.emet/surface.json` des Tickets.

## Wie eine Welle abläuft

- `emet dispatch --role worker` prüft den Claim und den Slot, legt `.emet/worktrees/agent-<ticket>` an, baut ein `CODEX_HOME`-Overlay pro Lauf unter `.emet/runs/<run>/codex-home/` und startet `codex exec` mit dem aufgelösten Modell und Aufwand, dem Modus `codex.sandbox` (standardmäßig `danger-full-access`), `--json` und `--output-schema`. Ereignisse werden in `.emet/runs/<run>/codex/<ticket>.jsonl` erfasst. Der Worker wird über die `threadId` seines `thread.started`-Ereignisses und diesen JSONL-Pfad identifiziert; die Prozess-ID ist nur ein Hilfsfeld.
- Das Overlay wird erzeugt, nicht verlinkt. Deine `auth.json` wird per Symlink eingebunden (nie kopiert), der Plugin-Cache von emet wird aus deinem Codex-Home verlinkt, wenn er existiert, und das Overlay schreibt seine eigene minimale `config.toml`: den lokalen Marketplace und `[plugins."emet@emet-marketplace"] enabled = true`, eine `trusted`-Tabelle `[projects."<dir>"]` nur für die eigenen Verzeichnisse des Laufs sowie das aufgelöste `model` und `model_reasoning_effort`. Keine deiner `[projects]`-Tabellen und keine anderen Einstellungen werden kopiert, und dein `~/.codex` wird nie beschrieben.
- Die `rules/default.rules` des Overlays erlaubt `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` und die `emet`-Unterbefehle `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff` und `ask` und verbietet `git push`. Weil die Standard-Sandbox Schreibzugriffe nicht mehr blockiert, verweigert `emet guard` zusätzlich jeden `Bash`-Befehl, dessen argv `git push` ausführt, einschließlich `git -C <dir> push` und `git --git-dir=<dir> push`, unabhängig von der Sandbox.
- Ein Worker hat nie einen Seitenkanal zum Koordinator. Er eskaliert über das Postfach des Laufs: `emet ask --run <run> --ticket <ticket> --body <text>` zeichnet eine Frage auf und gibt ihre ID aus, und `emet ask ... --wait <n>` fragt die Antwort ab (Exit-Code 0 gibt sie aus, 3 bedeutet, dass das Zeitfenster abgelaufen ist, 4 bedeutet, dass `budgets.askWaitMinutes` aufgebraucht ist, sodass der Worker ein BLOCKED-Ergebnis schreibt und endet). Solange ein lebender Worker eine offene Frage hat, gibt `emet dispatch --wait` `question <ticket> <id>` statt eines Ergebnisstatus aus und stuft den Worker nie als festgefahren ein; der Koordinator liest `emet inbox --run <run>`, antwortet mit `emet reply --run <run> --ticket <ticket> --id <n> --body <text>` und setzt `emet dispatch --wait` fort. Ein aufgezeichnetes Ergebnis hat immer Vorrang vor einer offenen Frage. Siehe [ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md).
- Ergebnisse werden aus `<git-common-dir>/.emet/runs/<run>/results/` gelesen, demselben Ort, an den `emet results --write` schreibt, sodass ein Worker in seinem eigenen Worktree gefunden wird.
- `emet review-run` führt den Reviewer schreibgeschützt über ein Paket aus `emet review-package` aus; die Stufe `passive` startet keinen Prozess.
- Modelle werden gegen `models_cache.json` im Home des Laufs aufgelöst, sonst in deinem echten Codex-Home (nur lesend). Ein konfigurierter Slug, der nicht gelistet ist, wird ersetzt, und die Ersetzung wird protokolliert; löst sich nichts auf, schlägt `emet review-run` vor dem Modellaufruf fehl und nennt die Rolle und die gelisteten Slugs.
- Nutzung und Stillstandserkennung lesen das erfasste JSONL: den Token-Verbrauch aus `turn.completed`-Ereignissen und die Lebendigkeit daraus, dass die Datei wächst, sodass ein Worker in einem anderen PID-Namespace weiterhin als lebendig gilt. `emet preflight` und `emet cleanup` teilen sich eine Regel für ein rückgewinnbares Worktree ohne Eigentümer (Worker-Branch, Ticket gelandet, sauberer Baum, keine fremde Sperre), sodass preflight nur dann zu `emet cleanup` rät, wenn cleanup etwas täte.

## Was der echte Codex-Lauf gezeigt hat

Der [Probe-Bericht](../research/codex-probe-report.md) hat nach diesen Änderungen jede Prüfung mit `codex-cli 0.167.0` (ChatGPT-Free-Plan, Linux) wiederholt. Alle früheren `failed`-Zeilen sind jetzt `verified`:

- Ein Ablauf mit 2 Wellen hat echte Commits von Codex-Workern auf dem Trunk gelandet: Welle 1 aus `emet dispatch`, Welle 2 aus einer Sitzung, die mit `emet launch <spec> --wave 2` gestartet wurde und `$emet:run` aus dem Plugin-Cache des Overlays geladen hat. `emet review-run` lief in jedem Ablauf.
- Das optionale E2E (`EMET_CODEX_E2E=1`) besteht: Der Worker committet unter `danger-full-access`, und `codex execpolicy check` antwortet `forbidden` für `git push origin develop` und `allow` für `git -C <dir> commit`.
- `~/.codex/config.toml` behielt über die Probe, das E2E und sieben Abläufe denselben sha256.

## Grenzen und `unverified`-Punkte

- Der Aufwand `ultra` wird nie gesendet und in der Konfiguration abgelehnt.
- `danger-full-access` ist der Standardwert von `codex.sandbox` für Codex-Worker und `emet launch`, weil die Sandbox `workspace-write` `.git` schreibgeschützt macht und ein Worker nicht committen könnte. Setze `codex.sandbox` auf `"workspace-write"`, um die Sandbox zu behalten; Worker können dann nicht committen. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) hält den Zielkonflikt fest. Der Claude-Pfad nutzt es nie. Ohne Sandbox sind die Push-Verweigerung in `emet guard` und die Regeldatei die Leitplanken.
- Es gibt keine Entsprechungen für `ScheduleWakeup`, `TaskStop` oder `LSP`. emet fragt stattdessen seine eigene CLI ab.
- Rollout-Dateien unter `~/.codex/sessions` haben kein stabiles Format, daher liest emet die selbst erfasste Ausgabe von `exec --json`.
- Gegen die echte CLI verifiziert und weiterhin hinter kleinen Funktionen, sodass eine Änderung in Codex nur eine Stelle berührt: ein `CODEX_HOME` pro Lauf mit verlinkter Authentifizierung, die Regeldatei unter `rules/default.rules`, `--dangerously-bypass-hook-trust`, der Alias `CLAUDE_PLUGIN_ROOT` in Hook-Befehlen, das Ausgabeformat von `codex plugin list`, ein Modell, das eine Skill über ihren Namen lädt, `emet dispatch` in einer verschachtelten Sitzung, ein Modell, das versucht, `approval.json` zu fälschen (verweigert), und beide Formen von `codex plugin marketplace add`. Siehe [die Machbarkeitsrecherche](../research/codex-viability.md).
- Weiterhin `unverified`: Codex aus einem unbeaufsichtigten Supervisor unter systemd oder in einem Container zu betreiben (getestet wurde nur ein abgekoppelter Prozess).
- Bekannte Folgeaufgaben aus dem Probe-Bericht: `emet init` schreibt für `agentHost: "codex"` Claude-Modellnamen in `models`, ein expliziter `emet dispatch --model` wird nicht gegen den Cache aufgelöst, `emet lock-reason` sucht einen `claude`-Vorfahren, und ein Ticket, dessen Worker gestorben ist, kann nicht in dasselbe Worktree neu gestartet werden.
- Codex-Modellnamen und -Preise ändern sich; die Preistabelle muss neu geprüft werden, sobald echte Wellen gelaufen sind.
