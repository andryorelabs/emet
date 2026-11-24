---
title: Memoria
description: Qué recuerda emet entre ejecuciones y dónde lo guarda.
seoTitle: Memoria en emet
sourceHash: 9053ca5dd53acba7
---

Qué recuerda emet entre ejecuciones y dónde lo guarda. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## Lecciones

Una ejecución es desatendida, así que lo que aprende desaparecería con la sesión. Al final de una ejecución, el coordinador guarda de 1 a 5 viñetas cortas sobre lo que ayudó o perjudicó, llamadas **Lecciones**, junto con el resultado de la ejecución: landed, chained, hold, stop o blocked. Cada viñeta es una sola línea corta.

Las lecciones se guardan por spec, en una nota por repositorio, de modo que una ejecución posterior en el mismo repositorio pueda leer lo que aprendieron las anteriores. Una nota que crece demasiado descarta primero sus secciones más antiguas.

## Dónde se guardan

Las lecciones viven en [Engram](https://github.com/Gentleman-Programming/engram), un almacén de memoria local aparte, no en tu repositorio ni en el tracker. emet lo usa solo cuando el binario `engram` está en el PATH y responde a su handshake.

Si Engram falta, está roto o está desactivado, `emet memory` informa que la memoria no está disponible y termina con éxito. La memoria nunca bloquea una ejecución.

## Cómo se usan

Al inicio de una ejecución, antes de la primera ronda de entrevista, el coordinador busca en la memoria lecciones que coincidan con la funcionalidad. Las relevantes pasan al plan bajo un encabezado "Prior lessons", de modo que la entrevista y el plan parten de lo que encontraron las ejecuciones anteriores. Cuando no se encuentra nada o la memoria no está disponible, la ejecución lo anota en una línea y continúa.

## Uso manual

`emet memory search` y `emet memory save` son comandos ordinarios de la CLI, así que puedes buscar o añadir una lección tú mismo. Para desactivar la memoria en un repositorio, establece `memory.enabled` en `off`.

Para los comandos, consulta [`emet memory`](../reference/cli.md#runs-workers-and-slots). Para la clave, consulta [`memory`](../reference/configuration.md#memory). El lugar de una ejecución en el flujo general está en [Ejecuciones, oleadas y specs](runs-waves-specs.md).
