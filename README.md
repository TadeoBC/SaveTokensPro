# SaveTokensPro

Control de consumo de Claude Code para planes con límites (ventana de 5 horas y tope semanal): ve cuánto te queda, aprovecha cada ventana y reparte el trabajo pesado entre varias sesiones.

## Qué trae

| Pieza | Qué hace |
|---|---|
| **Status line** (`scripts/statusline.js`) | Muestra en Claude Code el % de la ventana de 5 h con su hora de reinicio, el % semanal contra el ritmo esperado (semáforo verde/amarillo/rojo) y un aviso **⚡ lanza relleno** cuando falta poco para el reinicio y todavía queda cuota que se perdería. |
| **Ping automático** (`scripts/ping.js`, launchd) | Cada 5 min revisa si la ventana venció dentro de tu horario y manda un mensaje mínimo (Haiku) para abrir la siguiente a tiempo. Así las ventanas no se corren y puedes planear tu descanso. |
| **Skill `/consumo`** | Estado, recomendación, registro en el tablero, relleno con tu backlog, horario, pausa del ping y **control multiagente**. |
| **Control multiagente** (`scripts/delegar.js`) | Manda un encargo a otra sesión (otra cuenta de Claude Code, Codex CLI) en segundo plano y lleva el estado de cada uno: corriendo, terminó o **cortado por límite / sin sesión**. |
| **Skill `/tarea-grande`** (`scripts/tareas.js`) | Ejecuta una tarea grande con un equipo multiagente que se arma según la dificultad (niveles del 1 al 5): haiku busca, sonnet implementa y Fable entra sólo en lo crítico. Lo ajusta según tu cuota y registra cómo le fue a cada modelo. |
| **Memoria de ingeniería** (`scripts/mem.js`, skill `memoria`) | Bóveda Markdown en `~/AI-MEMORY`, que se abre en Obsidian, más un índice SQLite FTS5. Guarda decisiones, bugs, convenciones y contratos por proyecto. La comparten todos los perfiles y agentes, y recupera solo lo relevante con un presupuesto de tokens. |
| **Tablero compartido** (`tablero/tablero.html`) | Página para publicar como artifact de claude.ai: ventana, semana contra el ritmo, consumo por persona y por categoría contra el reparto acordado, y bitácora. |

## Requisitos

- Claude Code con plan Pro o Max (la status line recibe `rate_limits` sólo con suscripción).
- Node.js 22.5 o más nuevo en el PATH (la memoria usa `node:sqlite`).
- **Obsidian** para ver y editar la memoria. En macOS el instalador lo instala con Homebrew si falta. Se puede omitir con `--sin-memoria`.
- macOS para el ping con launchd (en Linux, una línea de cron; el instalador te la da).
- Opcional: otra cuenta de Claude Code o Codex CLI para delegar.

## Instalación

```sh
git clone https://github.com/TadeoBC/SaveTokensPro.git
cd SaveTokensPro
./install.sh
```

Luego edita `config.json` (tu nombre, horario y perfiles) y abre Claude Code. Opciones: `--sin-ping`, `--sin-statusline`, `--sin-memoria`. Para otro perfil de Claude Code: `CLAUDE_CONFIG_DIR=~/.claude-otra ./install.sh`. Para quitarlo: `./uninstall.sh` (tus datos se quedan).

## Uso

```
/consumo                      estado y recomendación
/consumo relleno              ¿conviene gastar lo que queda antes del reinicio?
/consumo registrar marketing "posts de la semana"
/consumo sync                 reparte el consumo entre tú y quien use la cuenta desde Desktop
/consumo plan                 reparto por persona y categoría (tablero)
/consumo horario 06:00 21:00  cambia las horas del ping
/consumo pausa | reanuda | log

/consumo delegar codex-lectura "mapear de dónde sale cada indicador"
/consumo encargos             qué corre, qué terminó, qué se cortó
/consumo detener <nombre>
```

### El horario y el ping

La ventana de 5 h empieza con el primer mensaje después del reinicio. Con `inicio: 05:00` y `fin: 20:00` el ping abre 05–10, 10–15 y 15–20; el último sale a `fin − 5 h` para no meterse en tu descanso. Si la Mac está dormida a la hora del ping, sale al despertar.

### Delegar sin ahogar tu sesión

Los perfiles viven en `config.json` → `delegar.perfiles`:

- `tipo: "claude"`: corre `claude -p` con otro binario o perfil (`CLAUDE_CONFIG_DIR`), es decir, con otra cuenta.
- `tipo: "codex"`: corre `codex exec`; `sandbox: "read-only"` para análisis y planes, `"workspace-write"` para implementar.

Reglas que aprendimos a la mala:

1. El encargo debe ser **autocontenido**: reglas del proyecto, qué no tocar, verificación con comandos exactos, sin commits.
2. Un CLI que se queda sin cuota o sin sesión **sale como si nada**; `delegar.js estado` lee el log y te dice `cortado: límite de uso` o `cortado: sin sesión iniciada`.
3. Si un agente se cortó, el siguiente debe saber qué quedó a medias (`git diff`).
4. Nunca des por bueno el reporte del otro agente: verifica tú.
5. Dos agentes que escriben nunca sobre los mismos archivos a la vez.

### Una cuenta, dos lugares (CLI + Desktop)

Si alguien más usa la misma cuenta desde Claude Desktop o la web, no necesita instalar nada. Pon su nombre en `config.json` → `compartir.otraPersona`. Tu status line anota cuándo trabajas tú (por el costo de tus sesiones), y `/consumo sync` reparte cada subida del % semanal:

- **Te toca a ti:** lo que subió mientras estabas activo.
- **Le toca a la otra persona:** lo que subió en un hueco de más de `compartir.huecoMin` minutos (15 por defecto) sin actividad tuya.

Los registros se suben solos al tablero. La otra persona sólo abre el tablero cuando quiera ver cómo van o anotar en qué categoría gastó. Si los dos usan la cuenta al mismo tiempo, ese tramo se te cuenta a ti: es una aproximación.

### Tablero compartido

Pídele a Claude: *"publica `tablero/tablero.html` como artifact con las capacidades `db` y `user`"*, pon la URL en `config.json` → `tablero` y compártelo desde el menú Share. `/consumo registrar` escribe ahí; desde Claude Desktop o la web se registra a mano en la misma página.

### /tarea-grande

```
/tarea-grande implementa clientes con crédito y abonos
```

1. Lee el CLAUDE.md y `tareas.js presupuesto` (normal, ahorro o mínimo según la ventana de 5 h y el semáforo semanal).
2. Clasifica la tarea del 1 al 5 sin gastar un agente en eso. Niveles 1 y 2: la sesión principal la hace sola. Nivel 3: implementadores sonnet en paralelo, sobre archivos distintos. Nivel 4: un revisor con otro modelo. Nivel 5 (dinero, permisos, migraciones, concurrencia, producción): Fable diseña o revisa el núcleo.
3. Topes: 3 subagentes a la vez y 2 modelos distintos además del principal. Opus sólo como segunda opinión con una razón técnica concreta.
4. Primero verifica con herramientas deterministas (typecheck, tests) y después, si el riesgo lo amerita, con revisión de IA.
5. Registra el resultado en `tareas.jsonl`. `node scripts/tareas.js resumen` muestra los fallos, reintentos y correcciones por categoría y modelo, para ajustar el enrutamiento con datos propios.

### Memoria de ingeniería

```
node scripts/mem.js context "agregar descuentos por volumen"   # contexto compacto para una tarea
node scripts/mem.js search "redondeo pagos" --type decision
node scripts/mem.js write --title "..." --type bug --files src/x.ts --cuerpo - <<'EOF' ... EOF
node scripts/mem.js validate <id> --marcar                      # draft → verified, si sus referencias siguen vigentes
node scripts/mem.js link <nueva> <vieja> --rel reemplaza        # la vieja queda superseded, nunca se borra
node scripts/mem.js health
```

- **Fuente de verdad:** los `.md` (abre `~/AI-MEMORY` en Obsidian y edita lo que quieras). El índice `.index/memoria.db` se reconstruye solo, también cuando está dañado.
- **Niveles:** L0 lo inyecta el hook `SessionStart` (3 líneas). L1 (overview, architecture, convention, contract) y L2 (decisiones, bugs, etc.) se recuperan con `context` o `search`. L3 (`sessions/`, con `mem log`) no se indexa.
- **Vigencia:** cada memoria guarda `related_files` y `source_commit`. `context` y `validate` avisan si sus archivos ya no existen o si hubo commits que los tocaron después.
- **Seguridad:** rechaza llaves, tokens, contraseñas, URLs con credenciales y referencias a `.env`. Todo lo que escribe una IA nace como `draft`.
- **Concurrencia:** candado entre procesos, escritura atómica y `--version` para detectar conflictos. Antes de cambiar el contenido, la versión anterior se archiva en `04-ARCHIVE/versiones`.
- **Configuración:** `config.json` → `memoria` acepta `vault`, `budget` (tokens), `maxResultados` y `maxFragmento`; también la variable de entorno `MEM_VAULT`.
- **Pruebas:** `node --test scripts/mem.test.js` (14 casos).

Sin MCP ni base vectorial a propósito: un CLI hace las mismas operaciones, cualquier agente con Bash lo usa, y la búsqueda por palabras con FTS5 basta mientras la bóveda tenga cientos de notas, no cientos de miles.

## Límites conocidos

- El tope semanal del modelo premium no viene en la status line; sólo se ve con `/usage`.
- El ping consume un poco de cuota (un mensaje corto con Haiku por ventana).
