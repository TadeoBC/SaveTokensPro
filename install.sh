#!/bin/sh
# Instala SaveTokensPro para el usuario actual de Claude Code.
#   ./install.sh                 instala todo (skill, status line, ping en macOS)
#   ./install.sh --sin-ping      sin el ping automático
#   ./install.sh --sin-statusline  no toca la status line
#   ./install.sh --sin-memoria   sin la memoria (~/AI-MEMORY, hook y Obsidian)
#   CLAUDE_CONFIG_DIR=~/.claude-otra ./install.sh   para otro perfil de Claude Code
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
NODE=$(command -v node || true)
CON_PING=1
CON_STATUSLINE=1
CON_MEMORIA=1
for a in "$@"; do
  case "$a" in
    --sin-ping) CON_PING=0 ;;
    --sin-statusline) CON_STATUSLINE=0 ;;
    --sin-memoria) CON_MEMORIA=0 ;;
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

# 2. Skills (/consumo, /tarea-grande) con la ruta de esta instalación.
for SKILL_DIR in "$DIR"/skill/*/; do
  NOMBRE=$(basename "$SKILL_DIR")
  mkdir -p "$CLAUDE_DIR/skills/$NOMBRE"
  if [ -f "$CLAUDE_DIR/skills/$NOMBRE/SKILL.md" ]; then
    cp "$CLAUDE_DIR/skills/$NOMBRE/SKILL.md" "$CLAUDE_DIR/skills/$NOMBRE/SKILL.md.bak"
  fi
  sed "s#__HOME_SAVETOKENS__#$DIR#g" "$SKILL_DIR/SKILL.md" > "$CLAUDE_DIR/skills/$NOMBRE/SKILL.md"
  echo "· Skill /$NOMBRE instalada."
done

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

# 4. Memoria de ingeniería: bóveda (~/AI-MEMORY, compartida entre perfiles) y hook
#    SessionStart que inyecta lo esencial y reindexa lo editado a mano en Obsidian.
if [ "$CON_MEMORIA" = 1 ]; then
  # Obsidian es el visor de la bóveda: requisito. En macOS se instala con Homebrew si falta.
  if [ "$(uname)" = "Darwin" ]; then
    if [ ! -d /Applications/Obsidian.app ] && [ ! -d "$HOME/Applications/Obsidian.app" ]; then
      if command -v brew >/dev/null; then
        echo "· Instalando Obsidian (requisito de la memoria)…"
        brew install --cask obsidian
      else
        echo "Falta Obsidian (requisito de la memoria). Instálalo desde https://obsidian.md o con Homebrew, o usa --sin-memoria." >&2
        exit 1
      fi
    fi
    OBS_CFG="$HOME/Library/Application Support/obsidian/obsidian.json"
  else
    command -v obsidian >/dev/null || echo "· Aviso: instala Obsidian (https://obsidian.md) para ver la bóveda ~/AI-MEMORY." >&2
    OBS_CFG="$HOME/.config/obsidian/obsidian.json"
  fi
  "$NODE" "$DIR/scripts/mem.js" init >/dev/null 2>&1 || true
  VAULT=$("$NODE" -e 'process.removeAllListeners("warning");console.log(require(process.argv[1]).VAULT)' "$DIR/scripts/mem.js" 2>/dev/null)
  # Registra la bóveda en Obsidian para que aparezca sola al abrir la app.
  mkdir -p "$(dirname "$OBS_CFG")"
  "$NODE" -e '
    const fs = require("fs"), c = require("crypto"); const [f, vault] = process.argv.slice(1);
    let s = {}; try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
    s.vaults ||= {};
    if (!Object.values(s.vaults).some((v) => v.path === vault)) {
      s.vaults[c.randomBytes(8).toString("hex")] = { path: vault, ts: Date.now() };
      fs.writeFileSync(f, JSON.stringify(s));
      console.log("· Bóveda " + vault + " registrada en Obsidian.");
    }
  ' "$OBS_CFG" "$VAULT"
  SETTINGS="$CLAUDE_DIR/settings.json"
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  cp "$SETTINGS" "$SETTINGS.bak-memoria"
  "$NODE" -e '
    const fs = require("fs"); const [f, cmd] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    s.hooks ||= {}; s.hooks.SessionStart ||= [];
    const ya = s.hooks.SessionStart.some((g) => (g.hooks || []).some((h) => String(h.command || "").includes("mem.js")));
    if (!ya) s.hooks.SessionStart.push({ hooks: [{ type: "command", command: cmd, timeout: 10 }] });
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
    console.log(ya ? "· Hook de memoria ya estaba." : "· Hook de memoria activado (respaldo en settings.json.bak-memoria).");
  ' "$SETTINGS" "[ -f $DIR/scripts/mem.js ] && $NODE $DIR/scripts/mem.js session-start || true"
fi

# 5. Ping automático (sólo macOS, con launchd).
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
  5. Abre Obsidian: la bóveda de memoria (~/AI-MEMORY) ya aparece en la lista.
EOF
