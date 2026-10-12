# SaveTokensPro

Control de consumo de Claude Code para planes con límites (ventana de 5 horas y tope semanal): ve cuánto te queda, aprovecha cada ventana y reparte el trabajo pesado entre varias sesiones.

## Qué trae

| Pieza | Qué hace |
|---|---|
| **Status line** (`scripts/statusline.js`) | Muestra en Claude Code el % de la ventana de 5 h con su hora de reinicio, el % semanal contra el ritmo esperado (semáforo verde/amarillo/rojo) y un aviso **⚡ lanza relleno** cuando falta poco para el reinicio y todavía queda cuota que se perdería. |
| **Ping automático** (`scripts/ping.js`, launchd) | Cada 5 min revisa si la ventana venció dentro de tu horario y manda un mensaje mínimo (Haiku) para abrir la siguiente a tiempo. Así las ventanas no se corren y puedes planear tu descanso. |
| **Skill `/consumo`** | Estado, recomendación, registro en el tablero, relleno con tu backlog, horario, pausa del ping y **control multiagente**. |
| **Control multiagente** (`scripts/delegar.js`) | Manda un encargo a otra sesión (otra cuenta de Claude Code, Codex CLI) en segundo plano y lleva el estado de cada uno: corriendo, terminó o **cortado por límite / sin sesión**. |
| **Tablero compartido** (`tablero/tablero.html`) | Página para publicar como artifact de claude.ai: ventana, semana contra el ritmo, consumo por persona y por categoría contra el reparto acordado, y bitácora. |

## Requisitos

- Claude Code con plan Pro o Max (la status line recibe `rate_limits` sólo con suscripción).
- Node.js en el PATH.
- macOS para el ping con launchd (en Linux, una línea de cron; el instalador te la da).
- Opcional: otra cuenta de Claude Code o Codex CLI para delegar.

## Instalación

```sh
git clone https://github.com/TadeoBC/SaveTokensPro.git
cd SaveTokensPro
./install.sh
```

Luego edita `config.json` (tu nombre, horario y perfiles) y abre Claude Code. Opciones: `--sin-ping`, `--sin-statusline`. Para otro perfil de Claude Code: `CLAUDE_CONFIG_DIR=~/.claude-otra ./install.sh`. Para quitarlo: `./uninstall.sh` (tus datos se quedan).

## Uso

```
/consumo                      estado y recomendación
/consumo relleno              ¿conviene gastar lo que queda antes del reinicio?
/consumo registrar marketing "posts de la semana"
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

### Tablero compartido

Pídele a Claude: *"publica `tablero/tablero.html` como artifact con las capacidades `db` y `user`"*, pon la URL en `config.json` → `tablero` y compártelo desde el menú Share. `/consumo registrar` escribe ahí; desde Claude Desktop o la web se registra a mano en la misma página.

## Límites conocidos

- El tope semanal del modelo premium no viene en la status line; sólo se ve con `/usage`.
- El ping consume un poco de cuota (un mensaje corto con Haiku por ventana).
