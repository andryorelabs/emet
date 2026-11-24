---
title: Revisión y compuertas
description: Cómo la revisión dual y las compuertas deciden si el trabajo puede aterrizar.
seoTitle: Revisión y compuertas en emet
sourceHash: 6efa20526c00a453
---

Cómo la revisión dual y las compuertas deciden si el trabajo puede aterrizar. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## Un revisor comprueba la oleada contra la spec

Después de fusionar las ramas de una oleada en la rama de integración, un **Revisor** lee el resultado en un contexto limpio y lo comprueba contra la spec. El revisor es un agente aparte, nunca el worker que escribió el código.

La cantidad de revisión que recibe una oleada depende de su riesgo. `emet assess` clasifica el diff de forma determinista en uno de tres niveles:

- `passive`: un diff solo de documentación. No se ejecuta ningún revisor.
- `medium`: un cambio de código ordinario. Se ejecuta un revisor.
- `high`: el diff toca terreno de riesgo como autenticación, pagos, CI, migraciones o sumideros peligrosos. Estas oleadas reciben la **Revisión dual**.

## Revisión dual en el nivel high

Una oleada `high` la leen dos revisores en paralelo sobre el mismo paquete: el revisor de Claude y un revisor de Codex. Un solo modelo comparte sus propios puntos ciegos, así que el objetivo es una segunda lectura independiente.

Después el coordinador fusiona los dos conjuntos de hallazgos. Un hallazgo que plantean ambos revisores sigue abierto como acordado. Un hallazgo que plantea solo un revisor lo clasifica el coordinador, que lo conserva o lo descarta con una regla registrada. Un hallazgo que contradice un requisito que elegiste explícitamente nunca se descarta.

La Revisión dual se ejecuta solo cuando el nivel es `high`, el host es Claude Code, el binario `codex` está en el PATH y `review.dual` no es `off`. En caso contrario se ejecuta un solo revisor. Las oleadas medium y passive cuestan lo mismo en ambos casos, y los tokens de revisión se duplican aproximadamente solo en las oleadas high. Consulta el [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## Los hallazgos se comprueban, no se aceptan sin más

La CLI verifica lo que afirma el revisor:

- **Veredictos de cobertura.** Para cada requisito el revisor dice met, partial o unmet. Un `met` debe nombrar una prueba. Un `met` cuyo archivo de prueba o nombre de prueba falta, o un requisito sin veredicto, se convierte en un hallazgo `verification-gap` abierto. La CLI no ejecuta pruebas por sí misma; lo hace la suite completa en la rama de integración.
- **Hallazgos preexistentes.** Un hallazgo sobre una línea que la oleada no añadió ni cambió se informa, pero nunca bloquea la compuerta.
- **Opciones del usuario.** Un requisito que elegiste explícitamente se marca como opción del usuario. Un hallazgo en su contra bloquea en todos los niveles y severidades, incluso sobre una línea sin tocar, y da lugar a una ronda de corrección, no a una detención por sí solo.

## La compuerta decide

Las fases nunca deciden por sí solas que el trabajo pueda continuar. `emet gate` lee el registro de verificación, los hallazgos abiertos, el nivel de riesgo, la CI, la suite de integración y los presupuestos, e imprime una decisión:

- `merge` o `chain`: el trabajo puede continuar.
- `hold`: falta algo que emet puede resolver por sí mismo, como hallazgos que puede corregir o una comprobación aún en curso.
- `stop`: una persona debe resolver antes de que la ejecución continúe.
- `defer`: el ticket falló demasiados intentos; se aparta y el resto de la oleada continúa.

## Rondas de corrección

Cuando hay hallazgos bloqueantes abiertos, la compuerta retiene y pide una **Ronda de corrección**: el coordinador corrige los hallazgos abiertos y un revisor vuelve a comprobar solo esos, no todo el diff. Las rondas de corrección tienen su propio presupuesto, separado del de las rondas de revisión.

La compuerta se detiene cuando un hallazgo muestra que la propia spec estaba equivocada, cuando las rondas de corrección se agotan con hallazgos aún abiertos, o cuando la suite de integración falla por segunda vez después de volver a ejecutar sus specs fallidas. Una CI que nunca se ejecutó por la máquina o el proveedor se reintenta sin cargar un intento de corrección, y se informa como un problema de infraestructura la segunda vez seguida.

Para las claves, consulta [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) y [`budgets`](../reference/configuration.md#budgets). Para los comandos, consulta [`emet assess`, `emet review` y `emet gate`](../reference/cli.md#gates-and-records). Para elegir los modelos de los revisores, consulta [Modelos y esfuerzo](../how-to/choose-models.md).
