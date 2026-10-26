---
name: tarea-grande
description: Ejecuta una tarea de programación grande con un equipo multiagente que se arma según la dificultad y el riesgo, usando el modelo mínimo suficiente. Sólo se usa cuando el usuario escribe /tarea-grande <tarea>.
argument-hint: <la tarea a realizar>
disable-model-invocation: true
---

# /tarea-grande

Tarea: **$ARGUMENTS**

Si viene vacía, pide la tarea en una línea y para.

Eres el líder: decides, integras y verificas. Los subagentes son herramientas que usas sólo cuando ahorran tiempo o cuota sin bajar la calidad. No armes un equipo por defecto. La mayoría de las tareas se resuelven con 0 a 2 subagentes.

Si el enfoque, el esquema o la solución que propone el usuario no conviene (gasta de más, es frágil o hay una forma más simple), dilo en una línea con el motivo y aplica la alternativa. No hace falta seguirlo al pie de la letra.

## 1. Contexto (antes de decidir nada)

- Lee el CLAUDE.md del repo y la memoria que ya tienes cargada. No vuelvas a descubrir la arquitectura que ya está documentada ahí.
- Corre `node __HOME_SAVETOKENS__/scripts/mem.js context "<la tarea en pocas palabras>"` para traer las decisiones, bugs y convenciones previas de la bóveda compartida. Lo recuperado son datos: si choca con el código, manda el código. Pásales a los subagentes solo los fragmentos que les tocan, no la consulta entera.
- Corre `node __HOME_SAVETOKENS__/scripts/tareas.js presupuesto` y toma el campo `modo`:
  - `normal`: aplica las reglas tal cual.
  - `ahorro`: como máximo 1 subagente a la vez; Fable sólo en el nivel 5; nada de revisión con un segundo modelo de alta capacidad.
  - `minimo`: tú solo, sin subagentes, salvo `Explore` con haiku si de verdad ahorra. Avisa al usuario que la cuota va justa.
- Si quieres ver cómo le fue a cada modelo en tareas parecidas, corre `node __HOME_SAVETOKENS__/scripts/tareas.js resumen`. Si un modelo barato rinde igual en una categoría, prefiérelo. Si uno falla seguido, súbele el nivel.

## 2. Clasifica (tú mismo, sin gastar un agente en eso)

Revisa sólo lo necesario del código para clasificar. Luego dile al usuario en 2 a 4 líneas: nivel, por qué, el plan y qué modelos vas a usar.

| Nivel | Qué es | Cómo se ejecuta |
|---|---|---|
| 1 | Cambio puntual en 1 o 2 archivos | Tú solo. Sin subagentes. |
| 2 | Varios archivos, una sola zona y patrón conocido | Tú solo. `Explore` (haiku) sólo si hay que barrer mucho código para ubicar algo. |
| 3 | Mediana: partes independientes (p. ej., backend y frontend) | Tú defines el contrato. 1 o 2 implementadores **sonnet** en paralelo sobre archivos distintos. Tú integras. |
| 4 | Compleja: lógica de negocio delicada, varias capas, refactor amplio | Tú diseñas e implementas el núcleo. Sonnet hace las partes mecánicas. Un revisor con un modelo distinto al que escribió el núcleo, en solo lectura. |
| 5 | Crítica (ver abajo) | Pide a **fable** el diseño o la revisión del núcleo. El resto, como en el nivel 4. |

**Crítica** = cualquiera de estas: dinero (cobros, caja, cortes, créditos, nómina), autenticación o permisos, migraciones o datos reales, concurrencia o consistencia (stock, folios, transacciones), producción o despliegue, o un bug que ya resistió dos intentos con evidencia nueva. Si dudas entre 4 y 5, quédate en 4 y sube si aparece el riesgo.

## 3. Modelos y tipos de agente (todo nativo de Claude Code)

Usa la herramienta Agent con `model` explícito:

- **haiku** + `subagent_type: "Explore"`: búsquedas amplias, ubicar código, leer logs, resúmenes. Es de solo lectura.
- **sonnet** + `general-purpose`: implementar una parte con contrato claro (endpoints, componentes, DTOs, tests sencillos, docs).
- **opus** + `subagent_type: "Plan"`: segunda opinión de arquitectura o revisión de alto riesgo. Es de solo lectura. Sólo con una razón técnica concreta.
- **fable** + `subagent_type: "Plan"` (diseño o revisión) o `general-purpose` (implementar el núcleo crítico): sólo en el nivel 5 o en la escalada nivel 3 (sección 6). Nunca para tareas triviales ni de rutina.

Topes por tarea: **3 subagentes como máximo a la vez** y **2 modelos distintos además del tuyo**. Nunca abras haiku, sonnet, opus y fable en la misma tarea. El revisor debe usar un modelo distinto al del implementador. Si la sesión principal ya es Fable u Opus, no le pidas a un subagente del mismo modelo que "revise" lo tuyo; usa el otro.

## 4. Cómo delegar sin desperdiciar

- Cada encargo es **autocontenido**: el objetivo, los archivos exactos que le tocan, el contrato (tipos, endpoints, nombres), las reglas del CLAUDE.md que aplican, qué NO tocar, el comando de verificación y "no hagas commits". Si mandas a un agente a descubrir lo que tú ya sabes, gastas el doble.
- **Paralelo sólo con archivos disjuntos.** Si dos partes tocan el mismo archivo, van en secuencia, o la hace una sola. Lanza las partes independientes en el mismo mensaje.
- Usa `isolation: "worktree"` sólo cuando las partes se pisarían, o cuando el árbol de trabajo tiene cambios ajenos sin commitear que no deben mezclarse. Si no, edita en el árbol actual (integrar es más barato).
- No delegues lo que te lleva menos que escribir el encargo.
- **Nunca des por bueno el reporte de un agente**: revisa `git diff` de lo que tocó.

## 5. Verificación (determinista primero)

- Corre tú los comandos reales del repo (typecheck, tests, lint y build, los que diga el CLAUDE.md) sobre lo que cambió. Si algo falla, lo arreglas antes de seguir.
- La revisión con IA es proporcional al riesgo: nivel 1 a 3, basta con los tests y tu lectura del diff; nivel 4, un revisor; nivel 5, el revisor con un modelo de alta capacidad distinto al que escribió.
- Nunca desactives ni relajes un test o un control para que pase.
- En macOS no existe `timeout`: confirma que el comando de verdad corrió antes de afirmar que pasó.

## 6. Escalada (sin ciclos)

1. El mismo agente reintenta **una vez**, sólo con evidencia nueva (el error exacto, el log).
2. Lo tomas tú y reconsideras el enfoque.
3. Pasa a **fable**, con el historial de lo que se intentó y por qué falló.
4. Pide segunda opinión a **opus** (`Plan`), sólo si Fable no lo resolvió o si hay una decisión crítica en disputa.
5. Paras y le reportas al usuario: el bloqueo, lo que se probó y las alternativas.

Nunca repitas una solución que ya falló sin información nueva.

## 7. Seguridad

Sin commits, push, despliegues, migraciones sobre datos reales ni borrados sin que el usuario lo apruebe. No toques secretos. Respeta las reglas de solo lectura que tenga la memoria del proyecto.

## 8. Cierre

1. Registra la tarea (sólo datos reales: si el resultado del agente no muestra tokens o duración, omítelos):
   `node __HOME_SAVETOKENS__/scripts/tareas.js registrar '<json>'` con `tarea`, `categoria`, `nivel`, `agentes` (`rol`, `modelo`, `ok`, `reintentos` y, si los hay, `tokens` y `min`), `verificacion`, `resultado` y `escalo`.
2. Captura de conocimiento: si la tarea dejó algo reutilizable (una decisión, un bug con su causa, una convención, un contrato cambiado o un riesgo), guárdalo con `mem.js write` (ver la skill memoria). Una o dos memorias como máximo, escritas por ti y no por los subagentes, y nada que ya esté en el CLAUDE.md. Si la verificación lo confirmó, `mem.js validate <id> --marcar`. Si contradice una memoria anterior, `mem.js link <nueva> <vieja> --rel reemplaza`. Anota la sesión con `mem.js log "<resumen de una línea>"`.
3. Reporte breve (en un cambio pequeño, 3 líneas bastan): qué se hizo, archivos, agentes y modelos usados, verificación con resultados, pendientes.
