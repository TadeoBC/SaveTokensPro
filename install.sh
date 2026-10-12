#!/bin/sh
# Instala SaveTokensPro para el usuario actual de Claude Code.
#   ./install.sh                 instala todo (skill, status line, ping en macOS)
#   ./install.sh --sin-ping      sin el ping automático
#   ./install.sh --sin-statusline  no toca ~/.claude/settings.json
#   CLAUDE_CONFIG_DIR=~/.claude-otra ./install.sh   para otro perfil de Claude Code
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
NODE=$(command -v node || true)
CON_PING=1
CON_STATUSLINE=1
for a in "$@"; do
  case "$a" in
    --sin-ping) CON_PING=0 ;;
    --sin-statusline) CON_STATUSLINE=0 ;;
    *) echo "Opción desconocida: $a" >&2; exit 2 ;;
  esac
done

[ -n "$NODE" ] || { echo "Falta Node.js (node) en el PATH." >&2; exit 1; }

echo "SaveTokensPro en: $DIR"
echo "Perfil de Claude Code: $CLAUDE_DIR"

# 1. Configuración y backlog propios (no se suben al repo).
[ -f "$DIR/config.json" ] || { cp "$DIR/config.example.json" "$DIR/config.json"; echo "· config.json creado: edita tu nombre y horario."; }
[ -f "$DIR/backlog-relleno.md" ] || cp "$DIR/backlog-relleno.example.md" "$DIR/backlog-relleno.md"
mkdir -p "$DIR/encargos"

# 2. Skill /consumo con la ruta de esta instalación.
mkdir -p "$CLAUDE_DIR/skills/consumo"
if [ -f "$CLAUDE_DIR/skills/consumo/SKILL.md" ]; then
  cp "$CLAUDE_DIR/skills/consumo/SKILL.md" "$CLAUDE_DIR/skills/consumo/SKILL.md.bak"
fi
sed "s#__HOME_SAVETOKENS__#$DIR#g" "$DIR/skill/consumo/SKILL.md" > "$CLAUDE_DIR/skills/consumo/SKILL.md"
echo "· Skill /consumo instalada."

# 3. Status line (con respaldo de settings.json).
if [ "$CON_STATUSLINE" = 1 ]; then
  SETTINGS="$CLAUDE_DIR/settings.json"
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  cp "$SETTINGS" "$SETTINGS.bak-savetokens"
  "$NODE" -e '
    const fs = require("fs"); const [f, cmd] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    if (s.statusLine && !String(s.statusLine.command || "").includes("statusline.js")) {
      console.log("· Ya tenías otra status line; no la reemplacé. Usa: " + cmd); process.exit(0);
    }
    s.statusLine = { type: "command", command: cmd, refreshInterval: 60 };
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
    console.log("· Status line activada (respaldo en settings.json.bak-savetokens).");
  ' "$SETTINGS" "$NODE $DIR/scripts/statusline.js"
fi

# 4. Ping automático (sólo macOS, con launchd).
if [ "$CON_PING" = 1 ] && [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.savetokens.ping.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  sed -e "s#__NODE__#$NODE#g" -e "s#__HOME_SAVETOKENS__#$DIR#g" "$DIR/launchd/com.savetokens.ping.plist.template" > "$PLIST"
  launchctl bootout "gui/$(id -u)/com.savetokens.ping" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "· Ping automático activo cada 5 min (pausa con: /consumo pausa)."
elif [ "$CON_PING" = 1 ]; then
  echo "· Ping automático: en Linux agrega a cron: */5 * * * * $NODE $DIR/scripts/ping.js"
fi

cat <<EOF

Listo. Siguientes pasos:
  1. Edita $DIR/config.json (persona, horario, perfiles de delegar).
  2. Abre Claude Code y manda un mensaje: la status line empieza a mostrar tu cuota.
  3. (Opcional) Tablero compartido: pídele a Claude que publique
     $DIR/tablero/tablero.html como artifact con las capacidades db y user,
     y pon su URL en "tablero" de config.json.
  4. Escribe /consumo para ver tu estado.
EOF
