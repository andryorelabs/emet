---
title: Landing
description: Wie eine Spec standardmäßig als ein Pull Request landet und wann eine Welle allein landet.
seoTitle: Landing in emet
sourceHash: 11d51c9132097b57
---

Wie eine Spec landet, standardmäßig als ein Pull Request. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

**Landing** bedeutet hier, wie fertige Arbeit den Trunk erreicht. Mit der Startseite der Website hat es nichts zu tun.

## Ein Pull Request pro Spec

Standardmäßig landet eine Spec als ein Pull Request. Jede Welle bekommt weiterhin ihr eigenes Review, Gate und ihren eigenen Selbsttest, aber eine Welle, die besteht, wird nicht gelandet. Der Koordinator führt ihren Integrations-Branch mit `--no-ff` in einen lokalen **Spec-Branch** `spec/<id>` zusammen, und die Tickets der Welle werden **Integrated**. Die nächste Welle zweigt von der Spitze dieses Branches ab, sodass spätere Wellen auf früheren aufbauen, ohne auf die CI eines Pull Requests zu warten.

Nach der letzten Welle holt der Koordinator den Trunk per Merge, nie per Rebase, in den Spec-Branch und landet ihn einmal: ein Pull Request oder ein lokaler Merge, wenn der Landing-Modus `merge` ist, der nie pusht. Jede Welle bleibt ein eigener Merge-Commit in der Historie des Trunks, sodass sich eine Welle weiterhin zurücknehmen lässt.

Ein **Integrated**-Ticket zählt als geschlossener Blocker für die **Frontier**, bleibt aber offen, bis das abschließende Landing es schließt. **Landed** behält seine einfache Bedeutung: auf dem Trunk.

## Eine Welle landet nur auf Wunsch allein

Mit `landing.unit: wave` landet jede Welle für sich: ein Pull Request und ein CI-Warten pro Welle, und die nächste Welle startet erst, nachdem dieser Pull Request gemergt wurde. Eine Spec mit drei Wellen kostet dann drei Pull Requests. So war das Verhalten vor [ADR-0037](../adr/0037-landing-per-spec.md), und es bleibt verfügbar.

Ein **Quick-Lauf** landet immer pro Welle, weil er genau eine Welle hat. Siehe [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull Request oder lokaler Merge

Unabhängig von der Einheit bestimmt `landing.mode`, wie Arbeit den Trunk erreicht. `pr` öffnet einen Pull Request und braucht `gh`. `merge` führt lokal mit `emet land` oder `emet spec-branch land` zusammen und pusht nie; der Selbsttest-Befehl des Repositories ersetzt dabei die CI. Siehe [ADR-0010](../adr/0010-local-merge-landing.md).

## Was zu erwarten ist

- Ein Fehler, den nur die CI findet, zeigt sich erst beim abschließenden Landing, nachdem spätere Wellen darauf aufgebaut haben.
- Ein Konflikt mit dem Trunk zeigt sich beim Sync, wo der Koordinator anhält und die Pfade auflistet.
- Der Checkout ist jeweils an eine Spec gebunden; eine zweite Spec parallel braucht ein weiteres Worktree.
- `spec/<id>` wird standardmäßig nach jeder integrierten Welle gepusht, ohne einen Pull Request zu öffnen, sodass ein verlorener Datenträger höchstens eine Welle kostet.
- Wird der Spec-Pull-Request mit einem Merge-Commit gemergt, bleibt das Zurücknehmen pro Welle erhalten. Ein Trunk, der nur Squash-Merges erlaubt, landet die Spec als einen Commit und verliert dieses Zurücknehmen.

Die Schlüssel stehen unter [`landing`](../reference/configuration.md#landing). Die Befehle stehen unter [`emet spec-branch` und `emet land`](../reference/cli.md#planning-review-and-landing). Die Entscheidung steht in [ADR-0037](../adr/0037-landing-per-spec.md).
