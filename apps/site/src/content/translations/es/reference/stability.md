---
title: Estabilidad
description: Lo que emet promete no romper y lo que se reserva el derecho de cambiar.
seoTitle: Estabilidad de emet
sourceHash: 5a596d218f43a27d
---

Lo que emet promete no romper y lo que se reserva el derecho de cambiar. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## Superficies estables

Un cambio en una superficie estable que rompa a un consumidor existente es un cambio incompatible. Espera a una versión mayor y se anuncia en [CHANGELOG.md](../../CHANGELOG.md).

- **Banderas de la CLI.** Los subcomandos y las banderas que figuran en la [referencia de la CLI](cli.md). Una bandera no se elimina ni cambia de significado; se pueden añadir banderas nuevas.
- **Códigos de salida.** `0` limpio, `1` hallazgos que atender, `2` error de configuración o de uso, `3` error interno. Los prompts y los scripts dependen de estos números. Consulta los [códigos de salida](cli.md#códigos-de-salida).
- **El esquema de configuración.** `emet.config.json` tal como lo describen [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) y la [referencia de configuración](configuration.md). Una clave no se elimina ni se renombra sin subir el `version` del esquema; se pueden añadir claves opcionales nuevas.
- **El sobre `--json`.** La forma de nivel superior del JSON que un comando imprime con `--json`. Los campos no se eliminan ni cambian de tipo; se pueden añadir campos nuevos, así que los analizadores deben ignorar los campos que no conozcan.

## Superficies internas

Pueden cambiar en cualquier versión, sin más entrada en el changelog que una nota normal. No dependas de ellas.

- Los módulos bajo `emet/src/` y sus funciones y tipos exportados.
- La redacción de los prompts en `emet/reference/`, `commands/` y `agents/`, que solo cambia en un ticket que nombre los párrafos ([ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- La forma y la ubicación de los archivos de estado, los libros de registro y los registros bajo `.emet/`, y del pool de slots de todo el host.
- Los archivos de Codex generados bajo `codex/` y `.codex-plugin/`.
- Todo lo que esté bajo `tools/`, `apps/` y `docs/research/`.
- El texto legible de los mensajes, los informes y la salida de `--help`.

## Deprecaciones

Una superficie estable se depreca durante al menos una versión menor antes de eliminarse en una mayor. La deprecación se anuncia en el changelog y, cuando la CLI puede detectarla, con una advertencia en stderr.

## Decisiones

Los registros de decisiones en [docs/adr](../adr/README.md) explican por qué las superficies se trazan así. Si no estás seguro de a qué lado cae algo, pregunta en un issue antes de depender de ello.
