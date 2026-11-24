---
title: Überblick
description: Was emet ist, was ein Lauf tut und wohin es danach weitergeht.
seoTitle: Überblick über emet
sourceHash: 8627801ad3b7d807
---

Was emet ist, was ein Lauf tut und wohin es danach weitergeht. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

emet bringt ein Feature von der Idee bis zur zusammengeführten Änderung, innerhalb von Claude Code oder der Codex-CLI, in jedem Git-Repo, mit Linear, GitHub Issues oder lokalen Tickets. Du beschreibst das Feature einmal und genehmigst Spec und Tickets einmal; der Rest läuft unbeaufsichtigt.

## Was ein Lauf tut

1. `/emet:run` (`$emet:run` unter Codex) interviewt dich und schreibt eine Spec.
2. Es teilt die Spec in Tickets auf und bittet um eine einzige Freigabe.
3. Parallele Worker implementieren jedes Ticket in einem eigenen Git-Worktree.
4. Ein Review prüft jede Welle, und CI muss grün sein; alles, was markiert wird, stoppt das Zusammenführen.
5. Die Spec landet standardmäßig als ein Pull Request oder als lokaler Merge, und die nächste Welle kann sich anschließen.

## Wohin es weitergeht

1. [Installation](install.md): die eigenständige Installation, Aktualisierung, automatische Aktualisierung und Deinstallation.
2. [Erster Lauf](first-run.md): die Installation prüfen und emet in einem Repo ausführen.
3. [Läufe, Wellen und Specs](../concepts/runs-waves-specs.md): das Vokabular eines Laufs.
4. [Tracker und Landing](../how-to/configure-tracker.md): GitHub, Linear oder lokale Tickets und wie eine Spec landet.
