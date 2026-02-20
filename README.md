# Brain Board for Obsidian

Kanban board for summarizing and tracking Claude Code sessions as well as managing your Obsidian tasks.

## Features

- **Double Boards**: Includes a "Claude" tab for your Claude Code sessions and an "Obsidian" tab for your daily tasks.
- **Drag & Drop**: Easily move cards across lanes (e.g., Todo, Doing, Done).
- **Auto-Sync Tasks**: Moving tasks updates their checkboxes in your Markdown notes, and changing checkboxes in Markdown instantly updates the board!
- **Customizable Columns**: Add, rename, or remove lanes, matching your preferred workflow.
- **Draggable Tabs**: Reorder your board tabs just by dragging them.

## Installation

(Manual Installation)
1. Download `main.js`, `manifest.json`, and `styles.css` from the Release page.
2. Put them in your Vault's `.obsidian/plugins/brain-board/` folder.
3. Reload Obsidian and enable "Brain Board".

## Configuration
- **Claude Path**: Where your Claude Code `.claude` directory is located (default: `~/.claude`).
- **Task Search Directory**: Limit task scanning to a specific folder within your vault (e.g., `10_Journal`). Leave empty to scan the entire vault.
- **Storage Directory**: Where the plugin stores its board state `sessions.json` (default: `.brain-board`).

## License

MIT
