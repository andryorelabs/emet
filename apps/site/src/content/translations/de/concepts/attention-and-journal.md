---
title: Aufmerksamkeit und Journal
description: Wie emet seine Ereignisse in einem globalen Journal aufzeichnet und meldet, wenn eine Sitzung auf dich wartet.
seoTitle: Aufmerksamkeit und Journal in emet
sourceHash: 378e84638489f44f
---

emet zeichnet seine eigenen Ereignisse in einem globalen Journal auf. Eine Art von Ereignis sagt dir, wann eine Sitzung auf dich wartet. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md); die Entscheidungen stehen in [ADR-0030](../adr/0030-global-event-journal.md) und [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## Das Journal

Das Journal ist eine einzelne, nur anhängbare Datei aus JSON-Zeilen, ein Ereignis pro Zeile, im hostweiten Zustandsverzeichnis, in dem auch der Worker-Slot-Pool liegt. Weil es global ist, kann eine spätere Analyse einen Lauf, den `emet launch` oder `emet chain` gestartet hat, von einem unterscheiden, den eine Person von Hand getippt hat: Jedes Ereignis trägt sein Repo, seinen Host und einen Ursprung `human` oder `auto`.

Bestehende Befehle schreiben die Ereignisse: den Start eines Laufs, eine Gate-Entscheidung, einen menschlichen Eingriff in eine unbeaufsichtigte Welle, ein Launch-Ergebnis, ein geschlossenes Ticket, ein Cleanup, eine Baseline-Markierung sowie das Integrieren, Landen oder Verwerfen eines Spec-Branches.

### Was es nie aufzeichnet

Prompts, Assistententext, Hook-Eingaben, Umgebungsvariablen, argv, Tokens, Diffs und Issue-Texte. Ein Ereignis enthält nur IDs, Codes, Zähler, Dauern und eine kurze Begründung. Ein Ereignis, das über 2 KiB wachsen würde, verliert seine Daten und wird als gekürzt markiert.

### Fehler und Rotation

Ein Journal, das nicht geschrieben werden kann, ändert nie die Ausgabe oder den Exit-Code eines Befehls. Wenn die Datei etwa 10 MiB überschreitet, verschiebt der nächste Anhängevorgang sie in ein nummeriertes Segment und behält die fünf neuesten. Auf einem Netzwerkdateisystem können sich gleichzeitige Schreibvorgänge überlagern, deshalb warnt `emet doctor`, ohne zu scheitern, wenn das Zustandsverzeichnis auf einem liegt.

### Lesen

`emet insights` liest jedes Segment und berichtet Läufe nach Ursprung, Gate-Entscheidungen, Eingriffe, Launch-Ergebnisse, Spec-Ereignisse und geschlossene Tickets. Standardmäßig deckt es die Ereignisse seit der letzten Baseline ab; `--mark-baseline` beginnt ab jetzt zu zählen. Es überspringt Zeilen, die es nicht parsen kann, und zählt sie, und es gibt einen Nullbericht aus, wenn das Journal leer ist. Weil die Datei aus einfachen JSON-Zeilen besteht, funktioniert auch `jq` darauf. Siehe die [CLI-Referenz](../reference/cli.md#runs-workers-and-slots).

## Aufmerksamkeit

Ein Lauf kann auf eine Berechtigungsabfrage oder eine Frage blockiert sein, während niemand hinsieht. Aufmerksamkeit ist die Antwort auf „braucht mich eine Sitzung?“.

Jede Sitzung eines emet-eigenen Laufs befindet sich in einem von vier Zuständen:

- **working**: Der Agent handelt.
- **needs-decision**: Der Agent wartet auf eine Person, zum Beispiel auf eine Berechtigungsabfrage oder eine Frage. „Blockiert“ ist ein anderes Wort dafür.
- **idle**: Der Agent hat angehalten und wartet auf den nächsten Prompt.
- **ended**: Die Sitzung ist vorbei.

Der Hook `emet guard`, auf dem Host bereits installiert, bemerkt die Übergänge und hängt nur dann ein Ereignis `session.attention` an das Journal an, wenn sich der Zustand ändert, es gibt also keinen zweiten Speicher. Eine Sitzung gilt als emet-eigen, wenn sie in einem emet-Worker-Worktree läuft oder in einem Repo mit emet-Konfiguration und einem unfertigen Lauf. Unter Codex gibt es keine Benachrichtigungsereignisse, daher ist ein Stopp idle, es sei denn, der Lauf hat ein blockiertes Ergebnis, dann ist er needs-decision.

Das Ereignis enthält die Sitzungs-ID, den alten und den neuen Zustand, den Auslöser und die Lauf-ID. Es enthält nie den Benachrichtigungstext, den Tool-Namen oder die Tool-Eingabe. Das Aufzeichnen blockiert nie: Ein Fehler wird verschluckt, und der Berechtigungsdialog bleibt unverändert.

### Der Alarm

Der Wechsel in needs-decision löst einen Alarm aus: eine ungelesen-Markierung von Orca auf dem Worktree, wenn die Orca-Laufzeit erreichbar ist, andernfalls eine Desktop-Benachrichtigung, sofern verfügbar. emet löscht ihn nie, und `attention.alert` schaltet ihn aus.

### Wo du es siehst

`emet status` listet die Sitzungen und ihren Zustand auf, und eine blockierte Sitzung hebt den Gesamtzustand auf needs-decision, auch wenn keine Welle läuft. `emet fleet status` zeigt dasselbe über alle Repos hinweg.

## Siehe auch

- [Läufe, Wellen und Specs](runs-waves-specs.md)
- [Sicherheit](security.md)
- [Konfigurationsreferenz](../reference/configuration.md) für `attention.alert`
