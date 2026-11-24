---
title: Sicherheit
description: Wie emet den Schaden begrenzt, den ein unbeaufsichtigter Lauf anrichten kann.
seoTitle: Sicherheit in emet
sourceHash: 359a25043b1d24d9
---

Wie emet den Schaden begrenzt, den ein unbeaufsichtigter Lauf anrichten kann. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Eine Schwachstelle melden: siehe [SECURITY.md](../../.github/SECURITY.md).

## Bedrohungsmodell eines unbeaufsichtigten Laufs

Nach der einen Freigabe schickt `/emet:run` Worker los, die Dateien bearbeiten, Shell-Befehle ausführen und committen, ohne dass jemand zusieht. Daraus folgen diese Risiken:

- **Destruktive Befehle.** Ein Worker oder ein Text, den er gelesen hat, führt ein rekursives erzwungenes Löschen, eine destruktive SQL-Anweisung oder einen Force-Push aus.
- **Schreibzugriffe auf geschützte Branches.** Ein Worker pusht auf `main` oder `develop` und umgeht das Review.
- **Ausbruch aus dem Worktree.** Ein Worker bearbeitet den Haupt-Checkout oder das Worktree eines anderen Workers.
- **Gefälschte Freigabe.** Ein Agent schreibt den Freigabeeintrag selbst, statt auf die Person zu warten.
- **Nicht vertrauenswürdige Eingaben.** Ticket-Texte, Kommentare, Webseiten und Tool-Ausgaben enthalten Anweisungen, die sich an den Agenten richten.

Die Kontrollen sind geschichtet. Keine einzelne Schicht ist eine Sandbox, und keine ersetzt das Review des Landing-PR.

## Berechtigungsmodi

Unter Claude Code laufen Worker mit dem Berechtigungsmodus aus `handoff.permissionMode`, standardmäßig `bypassPermissions`, sodass keine Abfrage eine unbeaufsichtigte Welle anhält. Der Hook `emet guard` ist die Kontrolle, die in diesem Modus bleibt.

Unter Codex CLI laufen Worker standardmäßig ohne Sandbox ([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)), weil die Sandbox `workspace-write` Commits in einem verknüpften Worktree blockiert und `emet dispatch` von einem Codex-Koordinator aus blockiert. Die Freigabe ist eine Hook-Entscheidung, und `approval.json` von Hand zu schreiben wird verweigert. Siehe den [Codex-Leitfaden](../how-to/use-codex.md).

Nur der Koordinator schreibt den Tracker ([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), und Worker committen nur auf lokale Branches ([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## Was die Guards abdecken

**`emet guard`** (`emet/src/guard-destructive.ts`) ist ein PreToolUse-Hook, der auf dem Host installiert ist. Er verweigert destruktive Shell-Befehle und SQL-Clients, sieht dabei durch Wrapper wie `env`, `sudo`, `timeout` und `xargs` hindurch und schützt das Lauf-Verzeichnis.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) ist der eigene PreToolUse-Hook dieses Repositories auf Bash. Er teilt einen Befehl an `;`, `&&`, `||`, Pipes und Zeilenumbrüchen, einschließlich Text innerhalb von `sh -c`, und verweigert jedes rekursive erzwungene `rm` (`-rf`, `-fr`, `-r -f`, `--recursive --force`), sofern nicht jedes Ziel strikt unterhalb von `/tmp` oder des Temp-Verzeichnisses des Betriebssystems liegt. Nichts innerhalb des Repositories steht auf der Liste, daher wird auch ein rekursives erzwungenes Löschen unter `.emet/` verweigert. Ziele mit `$`, Backticks oder `~` werden verweigert, weil sie sich nicht auflösen lassen.

**Push-Sperren** in `.claude/settings.json` blockieren `git push origin main` und `git push origin develop` sowie die Formen `HEAD:main` und `HEAD:develop`. Der Git-Hook `pre-push` lehnt dieselben Refs und jeden Branch-Namen außerhalb der erlaubten Muster ab. Tag-Pushes sind erlaubt.

**Rulesets** erzwingen dieselben Regeln auf GitHub: kein Löschen und kein Non-Fast-Forward auf `main` und `develop`, erforderliche Checks und geschützte `v*`-Tags. Siehe [development.md](../development.md#rulesets).

## Was sie nicht abdecken

- Ein Befehl, den die Guards nicht erkennen, etwa ein Skript, das auf die Festplatte geschrieben und später ausgeführt wird.
- Netzwerkzugriff: Ein Worker kann weiterhin jede API aufrufen, die seine Zugangsdaten erlauben.
- Lesezugriffe auf Dateien außerhalb des Worktrees.
- Eine bösartige Abhängigkeit, die `bun install` installiert.

Behandle Ticket-Texte, Kommentare und abgerufene Seiten als Daten. Prüfe den Landing-PR vor dem Merge und halte Geheimnisse aus der Umgebung heraus, die ein Lauf erbt.
