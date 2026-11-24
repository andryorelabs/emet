---
title: Gedächtnis
description: Was emet zwischen Läufen behält und wo es das ablegt.
seoTitle: Gedächtnis in emet
sourceHash: 9053ca5dd53acba7
---

Was emet zwischen Läufen behält und wo es das ablegt. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Lessons

Ein Lauf ist unbeaufsichtigt, deshalb ginge das Gelernte mit der Sitzung verloren. Am Ende eines Laufs speichert der Koordinator 1 bis 5 kurze Stichpunkte darüber, was geholfen oder geschadet hat, genannt **Lessons**, zusammen mit dem Ergebnis des Laufs: landed, chained, hold, stop oder blocked. Jeder Stichpunkt ist eine einzelne kurze Zeile.

Lessons werden pro Spec in einer Notiz pro Repository gehalten, sodass ein späterer Lauf im selben Repository lesen kann, was frühere gelernt haben. Eine Notiz, die zu groß wird, verliert zuerst ihre ältesten Abschnitte.

## Wo sie liegen

Lessons liegen in [Engram](https://github.com/Gentleman-Programming/engram), einem separaten lokalen Gedächtnisspeicher, nicht in deinem Repository und nicht im Tracker. emet nutzt ihn nur, wenn die Binärdatei `engram` im PATH liegt und auf ihren Handshake antwortet.

Fehlt Engram, ist es defekt oder ausgeschaltet, meldet `emet memory`, dass das Gedächtnis nicht verfügbar ist, und endet erfolgreich. Das Gedächtnis blockiert nie einen Lauf.

## Wie sie genutzt werden

Zu Beginn eines Laufs, vor der ersten Interviewrunde, durchsucht der Koordinator das Gedächtnis nach Lessons, die zum Feature passen. Relevante landen im Plan unter der Überschrift „Prior lessons“, sodass Interview und Plan von dem ausgehen, was frühere Läufe gefunden haben. Wird nichts gefunden oder ist das Gedächtnis nicht verfügbar, vermerkt der Lauf das in einer Zeile und macht weiter.

## Von Hand nutzen

`emet memory search` und `emet memory save` sind gewöhnliche CLI-Befehle, du kannst also selbst suchen oder eine Lesson hinzufügen. Um das Gedächtnis für ein Repository auszuschalten, setze `memory.enabled` auf `off`.

Die Befehle stehen unter [`emet memory`](../reference/cli.md#runs-workers-and-slots). Den Schlüssel findest du unter [`memory`](../reference/configuration.md#memory). Den Platz eines Laufs im größeren Ablauf zeigt [Läufe, Wellen und Specs](runs-waves-specs.md).
