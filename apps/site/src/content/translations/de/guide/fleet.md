---
title: Flottenprüfung
description: Mit emet doctor beliebig viele Repositories gleichzeitig und nur lesend prüfen und sehen, welche Aufmerksamkeit brauchen.
seoTitle: "Flottenprüfung: mehrere Repos mit emet doctor"
sourceHash: efeca623ade98bf1
---

emet wird bereits in mehreren Repos eingesetzt? `emet doctor` prüft beliebig viele davon gleichzeitig und nur lesend:

```bash
emet doctor ~/code/*
```

Der Bericht enthält pro Repo: eine gültige `emet.config.json`, alle vier vorhandenen `docs/agents/*.md`-Dateien, keine übrig gebliebenen `TODO(emet):`-Markierungen, ob die Befehle in `commands.selfCheck` tatsächlich aufgelöst werden, sowie die trackerspezifischen Abhängigkeitsbefunde des Repos (`gh`, Linear; siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md)). Das Plugin mattpocock-skills und die Flags der externen CLIs (`gh`, dazu die der CLI des Agent-Hosts selbst: unter Claude Code `claude --bg` und `claude agents --json`, unter Codex `codex exec --json` und `--output-schema`, alle geprüft über `--help`) werden einmal für den gesamten Durchlauf geprüft, nicht pro Repo.

`emet doctor` prüft die Flags selbst, nicht nur, ob die Binärdateien existieren. Es liest `--help` für `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) und, unter Claude Code, `claude` (`--bg`) und `claude agents` (`--json`) und meldet jedes Flag, das eine neuere oder ältere CLI nicht mehr dokumentiert. Ein umbenanntes Flag würde sonst eine Welle mittendrin scheitern lassen. Die Prüfungen von `claude` und `claude agents` gehören zum Claude-Code-Host. Auf dem Codex-Host ersetzen die Host-Flag-Prüfungen sie, statt hinzuzukommen: `emet doctor` prüft `codex exec` auf `--json` und `--output-schema` (`hostCliFlagRequirements` in `emet/src/doctor.ts`). Die Version von `codex` wird nicht mit `codex.minVersion` verglichen; siehe [emet mit Codex ausführen](codex.md).

Jede Sonde ist auf 5 s begrenzt, damit ein hängendes `gh auth status` (ohne Netzwerk) keine Welle blockieren kann. Die `preflight.requiredCommands` eines Repos sind eine repo-eigene Liste von Binärdateien, die `emet preflight` und `emet doctor` im PATH voraussetzen. Siehe die [CLI-Referenz](../reference/cli.md#flottenprüfung) und die [Konfigurationsreferenz](../reference/configuration.md#preflight).
