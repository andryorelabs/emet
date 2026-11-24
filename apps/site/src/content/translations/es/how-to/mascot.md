---
title: Usar la mascota de emet (mod de Claude Code y pet de Orca)
description: Muestra la mascota de emet en Claude Code con el mod y en Orca con el pet.
seoTitle: Usar la mascota de emet en Claude Code y Orca
sourceHash: a6d2945308d1d44b
---

Muestra la **Mascot** de emet en Claude Code y en Orca. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

Hay dos piezas independientes: el plugin opcional `emet-mascot`, que dibuja la mascota en Claude Code, y el paquete de pet de Orca, que le da a Orca el mismo personaje. emet no necesita ninguna de las dos.

## Requisitos previos

- Claude Code, para el plugin.
- emet instalado, para que una ejecución escriba el archivo de fase que sigue la mascota; consulta [Instalación](../start/install.md).
- Orca, para el pet. La importación necesita la carpeta `docs/brand/pet/emet/` en la máquina donde se ejecuta la aplicación Orca.

## Instalar el plugin de la mascota

:::steps

1. Agrega el marketplace e instala el plugin:

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Reinicia Claude Code. La mascota sigue tu sesión (durmiendo, trabajando, esperando, lista, con error). Mientras hay un **Run** activo, también lee el archivo de fase y muestra una etiqueta tenue como `emet · wave 2 · review`.
3. Opcionalmente, define las opciones del plugin:
   - `position`: `pane` (el valor por defecto), `band` o `status`. `pane` acopla la mascota junto a la transcripción y requiere el diseño de pantalla completa y una terminal de al menos 144 columnas de ancho hasta que abras el panel una vez tú mismo (unas 110 después); cuando no puede acoplarse, la mascota se muestra encima del prompt. `band` siempre la dibuja encima del prompt. `status` muestra solo la etiqueta de texto como línea de estado.
   - `size`: `small` (16 x 8 celdas, el valor por defecto) o `medium` (24 x 12 celdas).
   - `showLabel`: mostrar u ocultar la etiqueta (activada por defecto).

:::

## Actualizar el plugin de la mascota

Los marketplaces que no son el de Anthropic tienen la actualización automática desactivada por defecto, así que actualiza a mano o actívala una vez.

:::steps

1. Actualiza el marketplace y el plugin:

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Reinicia Claude Code.
3. Para que se actualice por sí solo, ejecuta `/plugin`, abre la pestaña **Marketplaces**, selecciona `emet-marketplace` y elige **Enable auto-update**. Cada usuario lo hace una vez en su propia máquina. Consulta [Actualizar emet](update-emet.md) para el plugin principal.

:::

## Usar el pet en Orca

:::steps

1. Asegúrate de que `docs/brand/pet/emet/` (`pet.json` y `spritesheet.webp`) esté en la máquina donde se ejecuta Orca; copia la carpeta allí si Orca se ejecuta en un lugar distinto de este repositorio.
2. En los ajustes de Orca, elige "Import .codex-pet bundle…" y selecciona esa carpeta.
3. Tras cambiar un SVG de la mascota, regenera el paquete con `bun run brand:export` y haz commit del resultado.

:::

## Comprobar

:::steps

1. Ejecuta `claude plugin list` y confirma que `emet-mascot` esté habilitado; si falta la mascota, reinicia Claude Code.
2. Durante una ejecución, confirma que `.emet/phase.json` exista y se haya actualizado en los últimos segundos. La mascota lo consulta aproximadamente cada dos segundos e ignora un archivo más antiguo que su ventana de frescura, de modo que una ejecución que falló no deja una etiqueta obsoleta. Contiene `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` o `failed`), `wave`, `spec`, `runId`, `updatedAt` y un `outcome` opcional.
3. En Orca, confirma que el pet de emet aparezca en la lista de pets.

:::
