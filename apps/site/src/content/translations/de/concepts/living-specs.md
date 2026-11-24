---
title: Lebende Specs
description: Wie eine lebende Spec das aktuelle Verhalten pro Bereich festhält und wie eine Spec sie aktualisiert.
seoTitle: Lebende Specs in emet
sourceHash: d2468b14b371c04b
---

Eine Spec im Tracker ist ein Plan: ihre Anforderungen, ihre Tickets und ihre Wellen. Sobald die Tickets geschlossen sind, sagt der Tracker nicht mehr, was das System tut. Eine lebende Spec füllt diese Lücke: eine Datei pro Bereich unter `docs/specs/`, die das aktuelle Verhalten beschreibt und von demselben Pull Request aktuell gehalten wird, der es ändert. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md); die Entscheidung steht in [ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## Was eine lebende Spec enthält

Jeder Bereich hat eine Datei. Sie ist eine Liste von Anforderungen, und jede Anforderung hat einen beschreibenden Namen, eine Zeile `Source: #<spec> S<n>`, die auf den Spec-Punkt verweist, der sie eingeführt hat, und ein oder mehrere Szenarien in der Form WHEN und THEN. Die Quellzeile ist wichtig, weil S-Nummern nur innerhalb einer Spec gelten, der Name selbst also nie eine enthält.

Eine lebende Spec beschreibt Verhalten, nicht Arbeit: Nichts darin sagt, was geplant ist oder wer es tut. Das bleibt im Tracker.

## Wie eine Spec sie aktualisiert

Lebende Specs sind optional, über `specs.enabled`. Ist es eingeschaltet, geschieht die Aktualisierung einmal pro Spec, in der letzten Welle der Spec:

1. Der Koordinator liest die aktuelle lebende Spec jedes betroffenen Bereichs.
2. Für jede Anforderung, die die Spec berührt, entscheidet er, ob sie hinzugefügt, geändert oder entfernt wird, und schreibt das Ergebnis als Spec-Delta in ein Verzeichnis, das alle Worktrees des Repositories teilen.
3. `emet spec-merge` führt die Deltas in die Dateien unter `docs/specs/` zusammen. Es führt nie git aus; der Koordinator committet das Ergebnis.
4. Der Commit ist Teil der letzten Welle, sodass Review und Gates die Änderung an der lebenden Spec wie jede andere Änderung sehen.

Ein Merge, der Konflikte hat oder ein bestehendes Szenario verlieren würde, schreibt nichts und endet mit einem Fehler. Der Koordinator korrigiert das Delta einmal; schlägt es erneut fehl, landet die Welle ohne die Aktualisierung, und der Bericht sagt das.

## Warum der Koordinator entscheidet

Zu welchem Bereich eine Anforderung gehört und ob sie neu ist oder eine bestehende ändert, ist ein Urteil, das die aktuelle Datei und die Absicht der Spec braucht. Ein Werkzeug, das Deltas mechanisch erzeugte, könnte beides nicht wissen, deshalb bleibt das Urteil beim Koordinator und der Merge mechanisch.

## Wo sie landet

Beim Standard-Landing reist der Commit der lebenden Spec im Spec-Branch mit und kommt mit dem einen Pull Request im Trunk an. Siehe [Landing](landing.md). Mit einer Welle als Landing-Einheit ist er Teil des Pull Requests der letzten Welle.

## Siehe auch

- [Läufe, Wellen und Specs](runs-waves-specs.md)
- [Review und Gates](review-and-gates.md)
- [Konfigurationsreferenz](../reference/configuration.md) für `specs.enabled` und `specs.dir`
