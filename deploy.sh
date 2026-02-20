#!/bin/bash
PLUGIN_DIR="$HOME/work/my-vault-2nd-brain/.obsidian/plugins/ai-kanban-board"
mkdir -p "$PLUGIN_DIR"
npm run build
cp main.js manifest.json styles.css "$PLUGIN_DIR/"
echo "Deployed to $PLUGIN_DIR"
