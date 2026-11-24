---
title: Läufe, Wellen und Specs
description: Wie ein Lauf, eine Welle und eine Spec zusammenhängen und warum die Spec die Arbeitseinheit ist.
seoTitle: Läufe, Wellen und Specs in emet
sourceHash: e43250ad3faa9a31
---

Wie ein Lauf, eine Welle und eine Spec zueinander stehen. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Die Spec ist die Arbeitseinheit

Eine **Spec** ist das Anforderungsdokument für ein Feature, mit nummerierten Anforderungen `S1..Sn`. Sie wird geschrieben und freigegeben, bevor es ein Ticket gibt, und alles danach wird an ihr gemessen: Jedes Ticket nennt die Anforderungen, die es abdeckt, in einer Zeile `Covers:`, und jede Anforderung braucht mindestens ein Ticket und ein Abnahmeszenario. `emet validate` erzwingt beides vor der einen Freigabe. Siehe [`emet validate`](../reference/cli.md#gates-and-records).

Wenn eine Spec landet, aktualisiert sie die [lebenden Specs](living-specs.md), die das aktuelle Verhalten beschreiben.

## Tickets und Wellen

Ein **Ticket** ist eine aus der Spec abgeleitete Arbeitseinheit mit Schnittstellen, erlaubten Bearbeitungsflächen und einem Kontextbudget. Tickets hängen voneinander ab, deshalb können nicht alle gleichzeitig starten.

Eine **Welle** ist eine Abhängigkeitsebene: die Tickets, deren Blocker alle erledigt sind, gemeinsam losgeschickt. Die Menge der Tickets, die in einem Moment startbereit sind, ist die **Frontier**. Innerhalb einer Welle sind die Bearbeitungsflächen disjunkt, sodass Worker nie dieselbe Datei anfassen, und jeder Worker bekommt ein eigenes Worktree und einen eigenen lokalen Branch.

Eine Welle ist außerdem die Review-Einheit: Jede Welle bekommt ihr eigenes Review und ihr eigenes Gate, egal welche [Landing-Einheit](landing.md) gilt.

## Ein Lauf ist eine Ausführung

Ein **Lauf** ist eine Ausführung von `/emet:run` für eine Spec. Seine Lauf-ID verbindet die Claims, Worker-Slots, Sperren und Ergebnisse, die der Lauf erzeugt, und seine Aufzeichnungen liegen unter `.emet/runs/<run-id>/` im Haupt-Checkout.

Innerhalb eines Laufs führt eine Sitzung, der **Koordinator**, die Phasen aus, schickt Worker los, führt deren Branches zusammen und ist der einzige Schreiber des Trackers. Worker berichten über eine Handoff-Notiz und eine lokale Ergebnisdatei, nie an den Tracker. Siehe [ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

Ein **Quick-Lauf** ist der kleine Fall: eine Spec mit genau einem Ticket, eine Interviewrunde und eine Welle, die für sich landet, egal welche Landing-Einheit das Repository hat. Siehe [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Wie sie zusammenspielen

1. Der Lauf interviewt dich und schreibt die Spec, leitet dann Tickets ab und gruppiert sie in Wellen.
2. Du gibst einmal frei. Die Freigabe hält Hashes der Spec und der Ticketliste fest, und der Dispatch verweigert sich, wenn sich eines davon danach ändert.
3. Für jede Welle setzen Worker ihre Tickets parallel in Worktrees um. Der Koordinator führt ihre Branches in einen Integrations-Branch zusammen, und die Welle durchläuft [Review und Gates](review-and-gates.md).
4. Eine Welle, die besteht, wird [gelandet](landing.md), entweder allein oder zusammen mit dem Rest ihrer Spec.
5. Am Ende des Laufs speichert der Koordinator, was er gelernt hat, als [Lessons](memory.md).

Die Befehle hinter jedem Schritt stehen in der [CLI-Referenz](../reference/cli.md#runs-workers-and-slots) und in den dort aufgeführten [Gates und Aufzeichnungen](../reference/cli.md#gates-and-records).
