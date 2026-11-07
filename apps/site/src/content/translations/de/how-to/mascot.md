---
title: Das emet-Maskottchen verwenden (Claude-Code-Mod und Orca-Pet)
description: Das emet-Maskottchen in Claude Code mit dem Mod und in Orca mit dem Pet anzeigen.
seoTitle: emet-Maskottchen in Claude Code und Orca
sourceHash: caca9eb66e693e32
---

So wird das emet-**Maskottchen** in Claude Code und in Orca angezeigt. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

Es gibt zwei unabhängige Teile: das optionale Plugin `emet-mascot`, das das Maskottchen in Claude Code zeichnet, und das Orca-Pet-Bundle, das Orca denselben Charakter gibt.

## Das Maskottchen-Plugin installieren

Das Plugin wird im selben Marketplace wie emet ausgeliefert und ist optional. emet braucht es nicht.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

Das Maskottchen folgt deiner Sitzung (schlafend, arbeitend, wartend, fertig, Fehler). Solange ein **Run** aktiv ist, liest es außerdem die **Phase file** und zeigt ein gedämpftes Label wie `emet · wave 2 · review`.

Plugin-Optionen:

- `position`: `pane` (Standard), `band` oder `status`. `pane` dockt das Maskottchen neben dem Transkript an, was das Vollbild-Layout und ein Terminal von mindestens 144 Spalten Breite erfordert, bis du das Panel einmal selbst öffnest (danach etwa 110); wenn es nicht andocken kann oder das Terminal später schmaler wird, erscheint das Maskottchen stattdessen über dem Prompt. `band` zeichnet es immer über dem Prompt. `status` zeigt nur das Textlabel als Statuszeile des Plugins, ohne Maskottchen-Grafik.
- `size`: `small` (16 x 8 Zellen, Standard) oder `medium` (24 x 12 Zellen).
- `showLabel`: das Label neben dem Maskottchen ein- oder ausblenden (Standard an).

## Das Maskottchen-Plugin aktualisieren

Bei anderen Marketplaces als dem von Anthropic ist die automatische Aktualisierung standardmäßig aus, und ein Marketplace kann sie für seine Nutzer nicht einschalten. Von Hand aktualisieren:

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Anschließend Claude Code neu starten. Für die automatische Aktualisierung `/plugin` ausführen, den Tab **Marketplaces** öffnen, `emet-marketplace` auswählen und **Enable auto-update** wählen. Das macht jede Person einmal auf dem eigenen Rechner. Siehe [emet aktualisieren](update-emet.md) auch für das Hauptplugin.

## Die Phase file

Die emet-CLI schreibt `.emet/phase.json` im Repo, während ein Lauf voranschreitet, und das Maskottchen fragt sie etwa alle zwei Sekunden ab. Eine Datei, die älter als das Aktualitätsfenster ist, wird ignoriert, sodass ein abgestürzter Lauf kein veraltetes Label hinterlässt.

Die Datei enthält `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` oder `failed`), `wave`, `spec`, `runId`, `updatedAt` und ein optionales `outcome`. Ein fehlgeschlagener Schreibvorgang lässt den Unterbefehl, der die Phase gemeldet hat, nie scheitern.

## Das Pet in Orca verwenden

Das Pet-Bundle liegt in `docs/brand/pet/emet/`: `pet.json` und `spritesheet.webp`. In den Orca-Einstellungen „Import .codex-pet bundle…“ verwenden und diesen Ordner auswählen. Der Import benötigt `docs/brand/pet/emet/` auf dem Rechner, auf dem die Orca-App läuft; den Ordner dorthin kopieren, wenn Orca anderswo als in diesem Repo läuft. Nach einer Änderung an einem Maskottchen-SVG mit `bun run brand:export` neu erzeugen und das Ergebnis committen.

## Fehlerbehebung

- Kein Maskottchen: `claude plugin list` ausführen, prüfen, ob `emet-mascot` aktiviert ist, und dann Claude Code neu starten.
- Kein Label: prüfen, ob `.emet/phase.json` existiert und kürzlich aktualisiert wurde.
