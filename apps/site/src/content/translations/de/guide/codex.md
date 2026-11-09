---
title: emet mit Codex ausführen
description: "Codex als Agent host für emet nutzen: Plugin installieren, agentHost setzen, einmal freigeben und die Grenzen kennen."
seoTitle: emet mit Codex ausführen
sourceHash: a64f64be24588f52
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

4. Installiere die `emet` CLI wie in [Erste Schritte](getting-started.md) beschrieben und führe dann `emet doctor .` aus. Auf dem Codex-Host meldet es ein `codex`, das älter als `codex.minVersion` ist, ein fehlendes Flag `--json` oder `--output-schema` bei `codex exec` und ein fehlendes `mattpocock-skills` samt den beiden Befehlen oben.

Die beiden Plugin-Befehle aus Schritt 3 folgen dem Muster, das der Spike für einen lokalen Marketplace verifiziert hat; ihre genaue Schreibweise für dieses Repository ist bis zum ersten Release `unverified`.

## Den Agent host wählen

Setze `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

Der Standard ist `"claude"`. Der Abschnitt `codex` legt Modelle, Aufwand, Mindestversion und Sandbox fest; siehe die [Konfigurationsreferenz](../reference/configuration.md#codex) und [Modelle und Aufwand](models-and-effort.md). Starte einen Lauf in Codex mit `$emet:run`. `emet launch <spec> --wave <n>` startet eine Welle in einem losgelösten `codex exec` und speichert dessen Thread-ID, sodass `codex exec resume <id>` sie fortsetzt; es wird kein Orca-Tab geöffnet.

## Die einmalige Freigabe

emet verlangt eine einzige Freigabe, nach dem Plan. In Claude Code ist das ein Prompt. In Codex ist es ein Hook:

- Solange `.emet/runs/spec<id>/approval.json` nicht existiert, verweigert `emet guard` jede Änderung (`apply_patch`, `Bash`), außer Schreibzugriffen unter `.emet/runs/**/draft/**`, mit der Begründung `not approved: send approve <id>`. Das Gate greift, sobald ein Verzeichnis `.emet/runs/spec<id>/` ohne `approval.json` existiert; in diesem Zustand hinterlässt `/emet:run` den Lauf, nachdem Phase 4 den Spec materialisiert hat.
- Du gibst frei, indem du eine Prompt-Zeile sendest, die genau `approve <id>` lautet. Der `UserPromptSubmit`-Hook schreibt dann die Freigabedatei mit demselben Hashing wie `emet approve`. Dieselben Worte in Tool-Ausgaben oder Modelltext bewirken nichts.
- Die Alternative ist `/plan $emet:run`: Gib den Plan im eigenen Plan-Modus von Codex frei statt über den Hook.

Sobald dieses Verzeichnis existiert, schlägt das Gate geschlossen fehl: Eine fehlende oder unlesbare Freigabedatei hält Änderungen verweigert. Der Guard prüft außerdem jeden Pfad eines `apply_patch` gegen die `.emet/surface.json` des Tickets.

## Wie eine Welle abläuft

- `emet dispatch --role worker` prüft den Claim und den Slot, legt `.emet/worktrees/agent-<ticket>` an, baut ein `CODEX_HOME`-Overlay pro Lauf unter `.emet/runs/<run>/codex-home/`, das deine Authentifizierung und Konfiguration verlinkt statt kopiert, und startet `codex exec` mit dem aufgelösten Modell und Aufwand, dem Modus `codex.sandbox` (standardmäßig `workspace-write`), `--json` und `--output-schema`. Ereignisse werden in `.emet/runs/<run>/codex/<ticket>.jsonl` erfasst.
- Die Regeln des Overlays erlauben `git add` und `git commit` und verbieten `git push`. Dein `~/.codex` wird nie beschrieben.
- `emet review-run` führt den Reviewer schreibgeschützt über ein Paket aus `emet review-package` aus; die Stufe `passive` startet keinen Prozess.
- Nutzung und Stillstandserkennung lesen das erfasste JSONL: den Token-Verbrauch aus `turn.completed`-Ereignissen, die Lebendigkeit aus dem `codex`-Prozess und der Änderungszeit der Datei.

## Grenzen und `unverified`-Punkte

- Der Aufwand `ultra` wird nie gesendet und in der Konfiguration abgelehnt.
- `danger-full-access` ist nur verfügbar, wenn du `codex.sandbox` darauf setzt; nichts aktiviert es standardmäßig.
- Es gibt keine Entsprechungen für `ScheduleWakeup`, `TaskStop` oder `LSP`. emet fragt stattdessen seine eigene CLI ab.
- Rollout-Dateien unter `~/.codex/sessions` haben kein stabiles Format, daher liest emet die selbst erfasste Ausgabe von `exec --json`.
- Die Recherche markiert diese Verhaltensweisen als `unverified`, und jede steht hinter einer kleinen Funktion, sodass eine Änderung in Codex nur eine Stelle berührt: ein `CODEX_HOME` pro Lauf mit verlinkter Authentifizierung, der Ort der Regeldatei im Overlay, `--dangerously-bypass-hook-trust`, der Alias `CLAUDE_PLUGIN_ROOT` in Hook-Befehlen, das Ausgabeformat von `codex plugin list`, ein Modell, das eine Skill über ihren Namen lädt, und `emet dispatch` in einer verschachtelten Sandbox. Siehe [die Machbarkeitsrecherche](../research/codex-viability.md).
- Dass ein Modell versucht, `approval.json` zu fälschen, wurde nicht beobachtet. Das Gate würde den Versuch verweigern, aber das ist `unverified`.
- Codex aus einem unbeaufsichtigten Supervisor (systemd, Container) zu betreiben, nachdem die startende Sitzung beendet ist, ist `unverified`.
- Codex-Modellnamen und -Preise ändern sich; die Preistabelle muss neu geprüft werden, sobald echte Wellen gelaufen sind.
