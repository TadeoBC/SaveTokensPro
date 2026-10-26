#!/bin/sh
# Quita la skill, la status line y el ping. Deja tus datos (config, historial, encargos).
set -eu
DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}

rm -rf "$CLAUDE_DIR/skills/consumo" "$CLAUDE_DIR/skills/tarea-grande" "$CLAUDE_DIR/skills/memoria"
if [ -f "$CLAUDE_DIR/settings.json" ] && command -v node >/dev/null; then
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    if (String(s.statusLine?.command || "").includes("statusline.js")) delete s.statusLine;
    if (s.hooks?.SessionStart) {
      s.hooks.SessionStart = s.hooks.SessionStart.filter((g) => !(g.hooks || []).some((h) => String(h.command || "").includes("mem.js")));
      if (!s.hooks.SessionStart.length) delete s.hooks.SessionStart;
      if (!Object.keys(s.hooks).length) delete s.hooks;
    }
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
  ' "$CLAUDE_DIR/settings.json"
fi
if [ "$(uname)" = "Darwin" ]; then
  launchctl bootout "gui/$(id -u)/com.savetokens.ping" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.savetokens.ping.plist"
fi
echo "SaveTokensPro desinstalado. Tus datos siguen en $DIR y la bóveda en ~/AI-MEMORY."
