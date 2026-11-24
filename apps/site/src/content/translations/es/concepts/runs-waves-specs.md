---
title: Ejecuciones, oleadas y specs
description: Cómo se relacionan una ejecución, una oleada y una spec, y qué contiene cada una.
seoTitle: Ejecuciones, oleadas y specs en emet
sourceHash: e43250ad3faa9a31
---

Cómo se relacionan una ejecución, una oleada y una spec. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## La spec es la unidad de trabajo

Una **Spec** es el documento de requisitos de una funcionalidad, con requisitos numerados `S1..Sn`. Se escribe y se aprueba antes de que exista cualquier ticket, y todo lo que viene después se mide contra ella: cada ticket nombra los requisitos que cubre en una línea `Covers:`, y cada requisito necesita al menos un ticket y un escenario de aceptación. `emet validate` verifica ambas cosas antes de la aprobación única. Consulta [`emet validate`](../reference/cli.md#gates-and-records).

Cuando una spec aterriza, actualiza las [specs vivas](living-specs.md) que describen el comportamiento actual.

## Tickets y oleadas

Un **Ticket** es una unidad de trabajo derivada de la spec, con interfaces, superficies de edición permitidas y un presupuesto de contexto. Los tickets dependen unos de otros, así que no pueden empezar todos a la vez.

Una **Oleada** es una capa de dependencias: los tickets cuyos bloqueadores están todos terminados, despachados juntos. El conjunto de tickets listos para despachar en cada momento es la **Frontera**. Dentro de una oleada las superficies de edición son disjuntas, de modo que los workers nunca tocan el mismo archivo, y cada worker recibe su propio worktree y su propia rama local.

Una oleada es también la unidad de revisión: cada oleada tiene su propia revisión y compuerta, sea cual sea la [unidad de aterrizaje](landing.md).

## Una ejecución es una corrida

Una **Ejecución** es una corrida de `/emet:run` para una spec. Su id de ejecución une las reclamaciones, los slots de workers, los bloqueos y los resultados que crea la ejecución, y sus registros viven en `.emet/runs/<run-id>/` en el checkout principal.

Dentro de una ejecución, una sesión, el **Coordinador**, ejecuta las fases, despacha a los workers, fusiona sus ramas y es el único que escribe en el tracker. Los workers informan mediante una nota de handoff y un archivo de resultados local, nunca al tracker. Consulta el [ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

Una **Ejecución rápida** es el caso pequeño: una spec con exactamente un ticket, una ronda de entrevista y una oleada que aterriza por sí sola, sea cual sea la unidad de aterrizaje del repositorio. Consulta el [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Cómo encajan

1. La ejecución te entrevista y escribe la spec, luego deriva los tickets y los agrupa en oleadas.
2. Apruebas una sola vez. La aprobación registra hashes de la spec y de la lista de tickets, y el despacho se rechaza si alguno cambia después.
3. En cada oleada, los workers implementan sus tickets en worktrees paralelos. El coordinador fusiona sus ramas en una rama de integración, y la oleada pasa por la [revisión y las compuertas](review-and-gates.md).
4. Una oleada que pasa [aterriza](landing.md), sola o junto con el resto de su spec.
5. Al final de la ejecución, el coordinador guarda lo que aprendió como [lecciones](memory.md).

Para los comandos de cada paso, consulta la [referencia de la CLI](../reference/cli.md#runs-workers-and-slots) y las [compuertas y registros](../reference/cli.md#gates-and-records) que enumera.
