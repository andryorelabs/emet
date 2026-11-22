---
title: Flottenprüfung
description: Mit emet doctor beliebig viele Repositories gleichzeitig und nur lesend prüfen und sehen, welche Aufmerksamkeit brauchen.
seoTitle: "Flottenprüfung: mehrere Repos mit emet doctor"
sourceHash: 5eef774032962f35
---

emet wird bereits in mehreren Repos eingesetzt? `emet doctor` prüft beliebig viele davon gleichzeitig und nur lesend:

```bash
emet doctor ~/code/*
```

Der Bericht enthält pro Repo: eine gültige `emet.config.json`, alle vier vorhandenen `docs/agents/*.md`-Dateien, keine übrig gebliebenen `TODO(emet):`-Markierungen, ob die Befehle in `commands.selfCheck` tatsächlich aufgelöst werden, sowie die trackerspezifischen Abhängigkeitsbefunde des Repos (`gh`, Linear; siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md)). Das Plugin mattpocock-skills und die Flags der externen CLIs (`gh`, dazu die der CLI des Agent-Hosts selbst: unter Claude Code `claude --bg` und `claude agents --json`, unter Codex `codex exec --json` und `--output-schema`, alle geprüft über `--help`) werden einmal für den gesamten Durchlauf geprüft, nicht pro Repo.

`emet doctor` prüft die Flags selbst, nicht nur, ob die Binärdateien existieren. Es liest `--help` für `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) und, unter Claude Code, `claude` (`--bg`) und `claude agents` (`--json`) und meldet jedes Flag, das eine neuere oder ältere CLI nicht mehr dokumentiert. Ein umbenanntes Flag würde sonst eine Welle mittendrin scheitern lassen. Die Prüfungen von `claude` und `claude agents` gehören zum Claude-Code-Host. Auf dem Codex-Host ersetzen die Host-Flag-Prüfungen sie, statt hinzuzukommen: `emet doctor` prüft `codex exec` auf `--json` und `--output-schema` (`hostCliFlagRequirements` in `emet/src/doctor.ts`). Die Version von `codex` wird nicht mit `codex.minVersion` verglichen; siehe [emet mit Codex ausführen](codex.md).

## Repos gemeinsam ändern und starten

`emet fleet` arbeitet mit den Repos, die eine `emet.config.json` haben und eine Ebene unter einem Root liegen (Standard `~/code`):

```bash
emet fleet list --root ~/code
emet fleet set handoff.autoChain false --dry-run
emet fleet launch --feature "add dark mode" --repos app,site
```

- `list` gibt für jedes Repo Pfad, `tracker.kind`, `handoff.autoChain` und `models.worker` aus. `--json` gibt es als Daten aus.
- `set <key> <value>` ändert einen Config-Schlüssel in jedem aufgelisteten Repo. Jeder Wert wird vor dem Schreiben über den Config-Loader validiert; ein ungültiger Wert ändert kein Repo und endet mit Exit-Code 1. `--dry-run` schreibt nichts und gibt für jedes Repo den alten und den neuen Wert aus.
- `launch --feature <text>` öffnet in jedem Repo eine `/emet:run --draft <text>`-Sitzung, nach denselben Bereitschaftsprüfungen wie `emet chain`. `--repos` beschränkt den Start auf eine kommagetrennte Liste.

## Blockierte Sitzungen sehen

```bash
emet fleet status
```

Gibt pro Repo aus, wie viele emet-Sitzungen auf eine Entscheidung warten, arbeiten oder untätig sind, blockierte Repos zuerst. Es liest die letzten 24 Stunden des globalen Journals und schließt beendete Sitzungen aus. `--json` gibt die Sitzungen selbst aus. Innerhalb eines Repos listet `emet status` sie unter `sessions`. Ist `attention.alert` aktiv (Standard), löst emet außerdem einen Alarm aus, sobald eine Sitzung zu warten beginnt; siehe die [Konfigurationsreferenz](../reference/configuration.md#attention).

Jede Sonde ist auf 5 s begrenzt, damit ein hängendes `gh auth status` (ohne Netzwerk) keine Welle blockieren kann. Die `preflight.requiredCommands` eines Repos sind eine repo-eigene Liste von Binärdateien, die `emet preflight` und `emet doctor` im PATH voraussetzen. Siehe die [CLI-Referenz](../reference/cli.md#flottenprüfung) und die [Konfigurationsreferenz](../reference/configuration.md#preflight).
