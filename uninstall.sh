#!/bin/sh
# Quita la skill, la status line y el ping. Deja tus datos (config, historial, encargos).
set -eu
DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}

rm -rf "$CLAUDE_DIR/skills/consumo"
if [ -f "$CLAUDE_DIR/settings.json" ] && command -v node >/dev/null; then
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    if (String(s.statusLine?.command || "").includes("statusline.js")) delete s.statusLine;
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
  ' "$CLAUDE_DIR/settings.json"
fi
if [ "$(uname)" = "Darwin" ]; then
  launchctl bootout "gui/$(id -u)/com.savetokens.ping" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.savetokens.ping.plist"
fi
echo "SaveTokensPro desinstalado. Tus datos siguen en $DIR."
