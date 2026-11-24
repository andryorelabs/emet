---
title: Actualizar emet
description: Lleva un emet instalado a una versión nueva con emet self update, activa la actualización automática y actualiza los plugins.
seoTitle: Actualizar emet
sourceHash: 380b07ed5a10474f
---

Cómo llevar un emet instalado a una versión nueva. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## Actualizar la instalación independiente

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

La versión se descarga, se verifica con `SHA256SUMS` (y con la atestación cuando `gh` está presente) y se deja preparada. El cambio del enlace simbólico y de los archivos instalados ocurre solo cuando no hay ningún slot de worker retenido; de lo contrario la actualización queda pendiente y se aplica en el siguiente inicio de sesión. Un fallo deja intacta la versión actual y se registra en el journal. La versión anterior se conserva para volver atrás y las más antiguas se eliminan. `emet doctor` avisa cuando hay una actualización pendiente.

## Actualizar automáticamente

Un hook `SessionStart` ejecuta `emet self update --auto` como máximo una vez al día, desacoplado y en silencio cuando no hay conexión. Para desactivarlo, define `EMET_AUTO_UPDATE=0` o ejecuta:

```bash
emet self update --auto off
```

`emet self update --auto on` lo vuelve a activar. La actualización automática no hace nada en instalaciones como plugin.

## Opcional: plugins

emet y el plugin opcional `emet-mascot` provienen del mismo marketplace, `emet-marketplace`. Claude Code no actualiza por sí solo los marketplaces de terceros por defecto, y un marketplace no puede cambiar ese valor por defecto para sus usuarios.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Omite la última línea si no instalaste la mascota. Reinicia Claude Code después, o ejecuta `/reload-plugins`. `claude plugin list` muestra las versiones instaladas; la más reciente está en [CHANGELOG.md](../../CHANGELOG.md).

Para actualizar automáticamente, ejecuta `/plugin` en Claude Code, abre la pestaña **Marketplaces**, selecciona `emet-marketplace` y elige **Enable auto-update**. Claude Code entonces actualiza el marketplace y ambos plugins cuando empieza una sesión. Cada usuario lo configura en su propia máquina.

### Codex

Actualiza la instantánea del marketplace y vuelve a añadir el plugin. Ejecutar `codex plugin marketplace add` por segunda vez no la actualiza:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` muestra si `emet@emet-marketplace` está instalado y habilitado. La actualización automática es una función de Claude Code; en Codex, actualiza a mano.
