---
title: Das emet-Maskottchen verwenden (Claude-Code-Mod und Orca-Pet)
description: Das emet-Maskottchen in Claude Code mit dem Mod und in Orca mit dem Pet anzeigen.
seoTitle: emet-Maskottchen in Claude Code und Orca
sourceHash: a6d2945308d1d44b
---

Das emet-**Maskottchen** in Claude Code und in Orca anzeigen. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

Es gibt zwei unabhängige Teile: das optionale Plugin `emet-mascot`, das das Maskottchen in Claude Code zeichnet, und das Orca-Pet-Bundle, das Orca denselben Charakter gibt. emet braucht keines von beiden.

## Voraussetzungen

- Claude Code, für das Plugin.
- emet ist installiert, damit ein Lauf die Phasendatei schreibt, der das Maskottchen folgt; siehe [Installation](../start/install.md).
- Orca, für das Pet. Der Import benötigt den Ordner `docs/brand/pet/emet/` auf dem Rechner, auf dem die Orca-App läuft.

## Das Maskottchen-Plugin installieren

:::steps

1. Füge den Marketplace hinzu und installiere das Plugin:

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Starte Claude Code neu. Das Maskottchen folgt deiner Sitzung (schlafend, arbeitend, wartend, fertig, Fehler). Solange ein **Run** aktiv ist, liest es außerdem die Phasendatei und zeigt ein gedämpftes Label wie `emet · wave 2 · review`.
3. Setze optional die Plugin-Optionen:
   - `position`: `pane` (Standard), `band` oder `status`. `pane` dockt das Maskottchen neben dem Transkript an, was das Vollbild-Layout und ein Terminal von mindestens 144 Spalten Breite erfordert, bis du das Panel einmal selbst öffnest (danach etwa 110); wenn es nicht andocken kann, erscheint das Maskottchen über dem Prompt. `band` zeichnet es immer über dem Prompt. `status` zeigt nur das Textlabel als Statuszeile.
   - `size`: `small` (16 x 8 Zellen, Standard) oder `medium` (24 x 12 Zellen).
   - `showLabel`: das Label ein- oder ausblenden (Standard an).

:::

## Das Maskottchen-Plugin aktualisieren

Bei anderen Marketplaces als dem von Anthropic ist die automatische Aktualisierung standardmäßig aus; aktualisiere also von Hand oder schalte sie einmal ein.

:::steps

1. Aktualisiere den Marketplace und das Plugin:

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Starte Claude Code neu.
3. Für die automatische Aktualisierung führe `/plugin` aus, öffne den Tab **Marketplaces**, wähle `emet-marketplace` und wähle **Enable auto-update**. Das macht jede Person einmal auf dem eigenen Rechner. Siehe [emet aktualisieren](update-emet.md) für das Hauptplugin.

:::

## Das Pet in Orca verwenden

:::steps

1. Stelle sicher, dass `docs/brand/pet/emet/` (`pet.json` und `spritesheet.webp`) auf dem Rechner liegt, auf dem Orca läuft; kopiere den Ordner dorthin, wenn Orca anderswo als in diesem Repo läuft.
2. Wähle in den Orca-Einstellungen „Import .codex-pet bundle…“ und wähle diesen Ordner.
3. Erzeuge das Bundle nach einer Änderung an einem Maskottchen-SVG mit `bun run brand:export` neu und committe das Ergebnis.

:::

## Prüfen

:::steps

1. Führe `claude plugin list` aus und prüfe, dass `emet-mascot` aktiviert ist; fehlt das Maskottchen, starte Claude Code neu.
2. Prüfe während eines Laufs, dass `.emet/phase.json` existiert und in den letzten Sekunden aktualisiert wurde. Das Maskottchen fragt sie etwa alle zwei Sekunden ab und ignoriert eine Datei, die älter als ihr Aktualitätsfenster ist, sodass ein abgestürzter Lauf kein veraltetes Label hinterlässt. Sie enthält `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` oder `failed`), `wave`, `spec`, `runId`, `updatedAt` und ein optionales `outcome`.
3. Prüfe in Orca, dass das emet-Pet in der Pet-Liste erscheint.

:::
