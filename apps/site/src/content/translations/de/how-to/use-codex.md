---
title: emet mit Codex ausführen
description: "Codex als Agent host für emet nutzen: Plugin installieren, agentHost setzen, einmal freigeben und die Grenzen kennen."
seoTitle: emet mit Codex ausführen
sourceHash: 71c6c7d0686a6725
---

Die emet-Pipeline auf der Codex CLI statt auf Claude Code ausführen. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md); das Produkt, in dem ein Lauf ausgeführt wird, ist der **Agent host**. Zurück zum [Dokumentationsindex](../README.md).

Wie eine Welle unter Codex läuft sowie die Abwägungen bei Guard und Sandbox werden in [Sicherheit](../concepts/security.md) und [Läufe, Wellen und Specs](../concepts/runs-waves-specs.md) erklärt.

## Voraussetzungen

- Die `codex` CLI in der Version aus `codex.minVersion` (Standard `0.167.0`) oder neuer, angemeldet.
- `git` und `gh` im `PATH`; siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md).
- Ein Repo mit einer `emet.config.json` (führe `emet init` aus, wenn es keine hat).

## Installation

:::steps

1. Installiere das Plugin `mattpocock-skills` in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Installiere emet mit der eigenständigen Installation aus [Installation](../start/install.md). Sie schreibt die emet-Skills nach `~/.agents/skills/emet/` und hängt die emet-Hooks an `$CODEX_HOME/hooks.json` an (Standard `~/.codex`); `config.toml` schreibt sie nie. Sie installiert außerdem das `emet` im Terminal sowie die Claude-Code-Befehle und -Agents unter `~/.claude`; das ist unter Codex harmlos.

3. Vertraue den Hooks. Codex führt einen Hook erst aus, wenn du ihm vertraust: öffne `/hooks` und drücke auf der Ereignisseite `t`, oder bestätige beim Start die Meldung „Hooks need review“.

:::

### Optional: das Codex-Plugin

Statt der eigenständigen Installation kannst du das emet-Plugin installieren:

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

Das Plugin bringt keinen `emet`-Shim mit, daher braucht das `emet` im Terminal weiterhin die eigenständige Installation. `emet self install` verweigert die Ausführung, solange das Plugin installiert ist, es sei denn, du übergibst `--force`, und `emet doctor` warnt, wenn beide nebeneinander bestehen.

## Den Agent host wählen

:::steps

1. Setze `agentHost` in `emet.config.json` (Standard ist `"claude"`):

   ```json
   { "agentHost": "codex" }
   ```

2. Setze Modelle, Aufwand, Mindestversion und Sandbox im Abschnitt `codex`, wenn die Standardwerte nicht passen; siehe die [Konfigurationsreferenz](../reference/configuration.md#codex) und [Modelle wählen](choose-models.md).
3. Starte einen Lauf aus Codex mit `$emet:run`. Um eine Welle aus einem Terminal zu starten, führe `emet launch <spec> --wave <n>` aus; es startet ein abgekoppeltes `codex exec` und speichert dessen Thread-ID, sodass `codex exec resume <id>` es fortsetzt. Es wird kein Orca-Tab geöffnet.

:::

## Den Plan freigeben

emet fragt nach dem Plan nach einer einzigen Freigabe. Unter Codex ist das ein Hook.

:::steps

1. Warte, bis `$emet:run` die Spec materialisiert hat. Solange `.emet/runs/spec<id>/approval.json` nicht existiert, verweigert `emet guard` jede Änderung mit der Begründung `not approved: send approve <id>`.
2. Sende eine Prompt-Zeile, die genau `approve <id>` lautet. Der Hook `UserPromptSubmit` schreibt die Freigabedatei. Dieselben Worte in einer Tool-Ausgabe oder im Modelltext bewirken nichts.
3. Alternativ starte mit `/plan $emet:run` und gib den Plan im eigenen Plan-Modus von Codex frei.

:::

## Nach einem emet-Update

Bei der eigenständigen Installation sind die Hooks einfache Einträge in `hooks.json` und bleiben vertraut. Beim Plugin fragt Codex nach jedem Update erneut, ob du den Plugin-Hooks vertraust.

:::steps

1. Öffne `/hooks` und drücke auf der Ereignisseite `t`, oder bestätige beim Start die Meldung „Hooks need review“. Bis dahin laufen der emet-Guard und die einzelne Freigabe nicht.
2. Gibt der Shim `release v<version> has no downloadable asset yet` aus, läuft er mit der zwischengespeicherten Version. Versuche es in einigen Minuten erneut.

:::

## Prüfen

:::steps

1. Führe `emet doctor .` aus. Auf dem Codex-Host meldet es ein `codex`, das älter als `codex.minVersion` ist, ein fehlendes Flag `--json` oder `--output-schema` bei `codex exec`, nicht vertraute Hooks und ein fehlendes `mattpocock-skills`.
2. Behebe das Gemeldete anhand des passenden Eintrags in der [Fehlerbehebung](../troubleshooting.md#codex-host) und führe es erneut aus, bis es keine Fehler meldet.

:::

Bekannte Grenzen: Der Aufwand `ultra` wird nie gesendet und in der Konfiguration abgelehnt, und `codex.sandbox` ist standardmäßig `danger-full-access`, damit Worker committen können; setze es auf `"workspace-write"`, um die Sandbox zu behalten, dann können Worker nicht committen. Siehe [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) und den [Probe-Bericht](../research/codex-probe-report.md).
