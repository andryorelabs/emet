---
title: emet aktualisieren
description: Ein installiertes emet auf ein neues Release bringen, die automatische Aktualisierung steuern und die Plugins aktualisieren.
seoTitle: emet aktualisieren
sourceHash: 380b07ed5a10474f
---

So wird ein installiertes emet auf ein neues Release gebracht. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Die eigenständige Installation aktualisieren

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

Das Release wird heruntergeladen, gegen `SHA256SUMS` verifiziert (und gegen die Attestierung, wenn `gh` vorhanden ist) und bereitgestellt. Der Austausch des Symlinks und der installierten Dateien erfolgt nur, wenn kein Worker-Slot belegt ist; andernfalls bleibt das Update ausstehend und wird beim nächsten Sitzungsstart angewendet. Ein Fehlschlag lässt die aktuelle Version unberührt und wird im Journal festgehalten. Die vorherige Version bleibt für ein Rollback erhalten, ältere werden entfernt. `emet doctor` warnt, wenn ein Update aussteht.

## Automatisch aktualisieren

Ein `SessionStart`-Hook führt `emet self update --auto` höchstens einmal täglich aus, losgelöst und still, wenn offline. Zum Ausschalten `EMET_AUTO_UPDATE=0` setzen oder ausführen:

```bash
emet self update --auto off
```

`emet self update --auto on` schaltet es wieder ein. Die automatische Aktualisierung tut bei Plugin-Installationen nichts.

## Optional: Plugins

emet und das optionale Plugin `emet-mascot` stammen aus demselben Marketplace, `emet-marketplace`. Claude Code aktualisiert Marketplaces von Drittanbietern standardmäßig nicht von selbst, und ein Marketplace kann diese Voreinstellung für seine Nutzer nicht ändern.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Die letzte Zeile entfällt, wenn das Maskottchen nicht installiert wurde. Anschließend Claude Code neu starten oder `/reload-plugins` ausführen. `claude plugin list` zeigt die installierten Versionen; die neueste steht in [CHANGELOG.md](../../CHANGELOG.md).

Zum automatischen Aktualisieren in Claude Code `/plugin` ausführen, den Tab **Marketplaces** öffnen, `emet-marketplace` auswählen und **Enable auto-update** wählen. Claude Code aktualisiert dann beim Start einer Sitzung den Marketplace und beide Plugins. Das wird auf jedem Rechner einzeln eingestellt.

### Codex

Die Marketplace-Momentaufnahme aktualisieren und das Plugin erneut hinzufügen. Ein zweites `codex plugin marketplace add` aktualisiert sie nicht:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` zeigt, ob `emet@emet-marketplace` installiert und aktiviert ist. Die automatische Aktualisierung ist ein Claude-Code-Feature; unter Codex manuell aktualisieren.
