---
title: Flottenprüfung
description: Mit emet doctor beliebig viele Repositories gleichzeitig und nur lesend prüfen und sehen, welche Aufmerksamkeit brauchen.
seoTitle: "Flottenprüfung: mehrere Repos mit emet doctor"
sourceHash: 511c25889b2a8244
---

emet in mehreren Repos gleichzeitig prüfen, ändern und starten. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Voraussetzungen

- emet ist installiert; siehe [Installation](../start/install.md).
- Jedes Repo hat eine `emet.config.json` und liegt eine Ebene unter einem Root (Standard `~/code`).
- `gh` ist im `PATH` und angemeldet; siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md).

## Die Repos prüfen

:::steps

1. Führe die nur lesende Prüfung für beliebig viele Repos aus:

   ```bash
   emet doctor ~/code/*
   ```

2. Lies den Bericht pro Repo: eine gültige `emet.config.json`, alle vier `docs/agents/*.md`-Dateien, keine übrig gebliebenen `TODO(emet):`-Markierungen, `commands.selfCheck`-Befehle, die sich auflösen lassen, sowie die Befunde zu den Tracker-Abhängigkeiten des Repos.
3. Lies die Befunde für den gesamten Durchlauf, die einmal ausgegeben werden: das Plugin mattpocock-skills und die Flags der externen CLIs, geprüft über `--help` (`gh`, unter Claude Code `claude --bg` und `claude agents --json`, unter Codex `codex exec --json` und `--output-schema`). Ein umbenanntes Flag wird hier gemeldet, bevor es eine Welle scheitern lässt.

:::

## Eine Einstellung in jedem Repo ändern

:::steps

1. Liste auf, was jedes Repo derzeit hat:

   ```bash
   emet fleet list --root ~/code
   ```

   Es gibt für jedes Repo Pfad, `tracker.kind`, `handoff.autoChain` und `models.worker` aus; `--json` gibt es als Daten aus.

2. Sieh dir die Änderung vorab an:

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` schreibt nichts und gibt für jedes Repo den alten und den neuen Wert aus.

3. Wende sie an, indem du denselben Befehl ohne `--dry-run` ausführst. Der Wert wird zuvor über den Config-Loader validiert; ein ungültiger Wert ändert kein Repo und endet mit Exit-Code 1.

:::

## Ein Feature in mehreren Repos starten

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

Es öffnet in jedem Repo eine `/emet:run --draft <text>`-Sitzung, nach denselben Bereitschaftsprüfungen wie `emet chain`. `--repos` beschränkt den Start auf eine kommagetrennte Liste.

## Blockierte Sitzungen sehen

```bash
emet fleet status
```

Es gibt pro Repo aus, wie viele emet-Sitzungen auf eine Entscheidung warten, arbeiten oder untätig sind, blockierte Repos zuerst. Es liest die letzten 24 Stunden des globalen Journals und schließt beendete Sitzungen aus; `--json` gibt die Sitzungen aus. Innerhalb eines Repos listet `emet status` sie unter `sessions`. Siehe [Aufmerksamkeit und Journal](../concepts/attention-and-journal.md) und die [Konfigurationsreferenz](../reference/configuration.md#attention).

## Prüfen

:::steps

1. Führe `emet doctor ~/code/*` erneut aus und prüfe, dass kein Repo einen Fehler meldet.
2. Führe `emet fleet list --root ~/code` aus und prüfe, dass der geänderte Schlüssel in jedem Repo den neuen Wert zeigt.
3. Führe `emet fleet status` aus und prüfe, dass kein Repo unerwartet blockiert ist.

:::

Jede Sonde ist auf 5 s begrenzt, sodass ein hängendes `gh auth status` keine Welle blockieren kann. `preflight.requiredCommands` ist eine repo-eigene Liste von Binärdateien, die `emet preflight` und `emet doctor` voraussetzen; siehe die [CLI-Referenz](../reference/cli.md#fleet-check) und die [Konfigurationsreferenz](../reference/configuration.md#preflight).
