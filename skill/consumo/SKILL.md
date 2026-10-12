---
name: consumo
description: Controla el consumo de la cuota de Claude (ventana de 5 h, semana y modelo premium) y coordina encargos multiagente en otras sesiones (otra cuenta de Claude Code, Codex). Usar cuando el usuario escriba /consumo, pregunte cuánto le queda, cuándo se reinicia, si conviene rellenar la ventana, quiera registrar su consumo, o quiera delegar trabajo a otra sesión para no gastar la suya.
---

# /consumo

Todo vive en `__HOME_SAVETOKENS__`:

- `estado.json`: última lectura de la status line (`five_hour` y `seven_day`: `used_percentage`, `resets_at` en segundos epoch; `actualizado` en ms).
- `config.json`: persona, horario de pings, reglas de relleno, URL del `tablero` y perfiles de `delegar`.
- `historial.jsonl`: una línea por cada cambio de porcentaje.
- `backlog-relleno.md`: tareas para gastar la cuota que se perdería.
- `ping.log`: lo que hizo el ping automático (launchd `com.savetokens.ping`, cada 5 min).
- `encargos/`: un `.json` y un `.log` por cada encargo delegado.

Responde en el idioma del usuario, corto y con números.

## Subcomandos (según los argumentos)

**(vacío) o `estado`**: lee `estado.json` y `config.json` y reporta:
- Ventana de 5 h: % usado, hora local de reinicio y cuánto falta.
- Semana: % usado contra el ritmo esperado (`(ahora - (resets_at - 7d)) / 7d`), con semáforo: verde ≤ ritmo, amarillo ≤ ritmo + `semaforo.amarilloHasta`, rojo arriba.
- Si `actualizado` tiene más de 10 min, avisa que la lectura puede estar vieja.
- El límite semanal del modelo premium NO viene en la status line: si importa, pide verlo con `/usage`.
- Cierra con una recomendación de una línea (seguir, bajar de modelo, rellenar, delegar o parar).

**`sync [categoría]`** (corre también, sin que lo pidan, al final de `estado` y antes de `registrar` cuando `tablero` y `compartir.otraPersona` están configurados):
1. Corre `node __HOME_SAVETOKENS__/scripts/registro.js sync <categoría>`. Reparte lo consumido desde la última sincronización: lo que subió mientras esta persona trabajaba es suyo; lo que subió en un hueco de más de `compartir.huecoMin` minutos sin actividad suya es de `compartir.otraPersona` (que usa la misma cuenta desde otro lado, p. ej. Claude Desktop).
2. Si trae `registros`, súbelos todos en UNA llamada `ArtifactData` `batch` al `tablero`: una entrada `{op: "set", collection: "registros", doc_id, file_path: archivo}` por registro (documentos nuevos, sin `if_version`).
3. Sólo si el batch salió bien, corre `node __HOME_SAVETOKENS__/scripts/registro.js confirmar`. Si falló, no confirmes: la próxima vez se reintenta lo mismo.
4. Resume en una línea: cuánto % fue de cada persona.
Es una aproximación: si las dos personas usan la cuenta al mismo tiempo, ese tramo se le cuenta a esta.

**`registrar [categoría] [nota]`** (categorías sugeridas: programación, integraciones, ideas, marketing, personal):
1. Corre `node __HOME_SAVETOKENS__/scripts/registro.js <categoría> <nota>`.
2. Con la salida, escribe con `ArtifactData`: acción `set`, `url` = `tablero`, `collection` = `registros`, `doc_id` = el `doc_id` de la salida, `file_path` = el `archivo` de la salida (documento nuevo, sin `if_version`).
3. Confirma en una línea con el % semanal registrado.
Si `tablero` está vacío o `ArtifactData` no está disponible, da los números para registrarlos a mano.

**`relleno`**: decide si conviene gastar lo que queda de la ventana.
- Conviene si faltan ≤ `relleno.minutosAntes` min para el reinicio, queda ≥ `relleno.minRestantePct` % (proporcional al tiempo que falta) y la semana NO va en rojo.
- Si conviene, propone 1 o 2 tareas sin marcar de `backlog-relleno.md` que quepan en el tiempo restante. Lánzalas sólo si el usuario dice que sí, y marca `[x]` las que se usen.
- Si no conviene, di por qué en una línea.

**`plan`**: resume el reparto acordado (doc `ajustes/plan` del tablero con `ArtifactData` `get`) y cómo va cada persona y categoría esta semana (`list` de `registros`; el delta de `sem` entre registros consecutivos se atribuye al registro nuevo).

**`horario HH:MM HH:MM`**: cambia `horario.inicio` y `horario.fin` en `config.json`. El último ping sale a `fin − 5 h`, para que ninguna ventana se meta en el descanso.

**`pausa` / `reanuda`**: pone `ping.activo` en false/true en `config.json`.

**`log`**: muestra las últimas 15 líneas de `ping.log`.

## Control multiagente

**`delegar <perfil> "<tarea>"`**: manda trabajo pesado a otra sesión para no gastar la actual.
1. Escribe un encargo AUTOCONTENIDO en `__HOME_SAVETOKENS__/encargos/<nombre>.md`: contexto del repo, reglas del proyecto que apliquen (resume su CLAUDE.md), qué hacer, qué NO tocar, verificación obligatoria con comandos exactos y "no hagas commits". Si otro agente ya tocó esos archivos, dilo y pide revisar `git diff` antes de editar.
2. Lánzalo: `node __HOME_SAVETOKENS__/scripts/delegar.js lanzar <perfil> <archivo.md> --nombre <nombre> --cwd <repo>`.
3. Deja un vigilante en segundo plano que espere a que termine (Bash con `run_in_background`, un bucle `until` sobre `delegar.js estado <nombre>` que salga cuando ya no diga `corriendo`).
4. Al terminar: `delegar.js estado <nombre>`. Si dice `cortado: límite de uso` o `cortado: sin sesión iniciada`, el trabajo quedó a medias: revisa `git diff`, y relánzalo en otro perfil con un aviso de lo ya hecho.
5. **Nunca des por bueno lo que reporta el otro agente**: corre tú la verificación (typecheck, tests) antes de decirle al usuario que quedó.

**`encargos`**: `node __HOME_SAVETOKENS__/scripts/delegar.js estado` y resume en una tabla: nombre, perfil, estado, hace cuánto.

**`detener <nombre>`**: `delegar.js detener <nombre>`, y avisa que pudo dejar archivos a medias.

**Perfiles**: viven en `config.json` → `delegar.perfiles`. `tipo: "claude"` usa `claude -p` (otro binario o `CLAUDE_CONFIG_DIR` = otra cuenta); `tipo: "codex"` usa `codex exec` con `sandbox` `read-only` (análisis y planes) o `workspace-write` (implementación). Reparte por tipo de trabajo: lectura y planes a un perfil de sólo lectura; implementación a uno con escritura; dos agentes que escriben nunca sobre los mismos archivos a la vez.

## Reglas de consumo
- El modelo premium sólo para arquitectura, debugging difícil o planes grandes. Lo demás con un modelo mediano; textos con uno ligero; subagentes mecánicos con el más barato.
- `/clear` al cambiar de tarea.
- La semana es el tope que importa; la ventana de 5 h es la que se pierde si no se usa.
- Antes de afirmar que algo pasó una verificación, revisa que el comando sí corrió (en macOS no existe `timeout`: un `timeout 300 cmd | grep -c error` imprime 0 sin haber corrido nada).
