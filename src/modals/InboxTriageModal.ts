import { App, Modal, Setting, TFile, MarkdownRenderer, Component } from "obsidian";
import type BrainBoardPlugin from "../../main";
import type { VaultItem } from "../models/Task";
import { getTaskKey } from "../models/Task";
import { TaskArchiver } from "../services/TaskArchiver";
import { TaskUpdater } from "../services/TaskUpdater";
import { UI_CONSTANTS } from "../constants";

export class InboxTriageModal extends Modal {
  private plugin: BrainBoardPlugin;
  private queue: VaultItem[] = [];
  private currentIndex: number = 0;
  private component: Component;

  constructor(app: App, plugin: BrainBoardPlugin, inboxTasks: VaultItem[]) {
    super(app);
    this.plugin = plugin;
    this.queue = inboxTasks;
    this.component = new Component();
  }

  onOpen() {
    this.component.load();
    this.modalEl.addClass("inbox-triage-modal");
    
    // Bind Keyboard Shortcuts
    this.scope.register([], "ArrowLeft", (e) => { e.preventDefault(); this.handleAction("archive"); });
    this.scope.register([], "ArrowRight", (e) => { e.preventDefault(); this.handleAction("keep"); });
    
    const cols = this.plugin.sessionStore.getColumns();
    cols.forEach((col, idx) => {
        if (idx < 9) {
            this.scope.register([], String(idx + 1), (e) => { e.preventDefault(); this.handleAction("move", col.id); });
        }
    });

    this.render();
  }

  onClose() {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }

  private async handleAction(action: "archive" | "keep" | "move", targetCol?: string) {
    if (this.currentIndex >= this.queue.length) return;
    const task = this.queue[this.currentIndex];

    try {
      if (action === "archive") {
        await new TaskArchiver(this.app, this.plugin).archiveTask(task);
        this.plugin.app.workspace.trigger("brain-board:refresh");
      } else if (action === "move" && targetCol) {
        const key = getTaskKey(task);
        const colDef = this.plugin.sessionStore.getColumns().find((c: any) => c.id === targetCol);
        if (colDef) {
           await new TaskUpdater(this.app, this.plugin).updateTaskCompletion(task, colDef);
        }
        this.plugin.sessionStore.setTaskColumn(key, targetCol);
        this.plugin.app.workspace.trigger("brain-board:refresh");
      }
    } catch (e) {
      console.error("Triage action failed", e);
    }

    // Remove the processed item from the queue
    this.queue.splice(this.currentIndex, 1);
    this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.currentIndex >= this.queue.length) {
      contentEl.createEl("h2", { text: UI_CONSTANTS.MODAL_ALL_CAUGHT_UP });
      contentEl.createEl("p", { text: UI_CONSTANTS.MODAL_ALL_CAUGHT_UP_DESC });
      new Setting(contentEl).addButton(btn => btn.setButtonText(UI_CONSTANTS.MODAL_CLOSE).setCta().onClick(() => this.close()));
      return;
    }

    const task = this.queue[this.currentIndex];
    // Remaining count
    const progressText = `残り: ${this.queue.length} 枚`;

    // Header
    const headerRow = contentEl.createDiv({ cls: "triage-header" });
    headerRow.createEl("h3", { text: UI_CONSTANTS.MODAL_TRIAGE_TITLE });
    headerRow.createEl("span", { text: progressText, cls: "triage-progress" });

    // Card Display
    const cardEl = contentEl.createDiv({ cls: "triage-card" });
    
    // Meta (type, path)
    const metaRow = cardEl.createDiv({ cls: "triage-meta" });
    const badgeIcon = task.type === "file" ? UI_CONSTANTS.BADGE_FILE : UI_CONSTANTS.BADGE_TASK;
    const badgeSpan = metaRow.createSpan({ cls: `triage-badge type-${task.type}` });
    badgeSpan.innerHTML = badgeIcon;
    metaRow.createEl("span", { text: task.filePath, cls: "triage-path" });

    // Title / Text
    cardEl.createEl("h2", { text: task.text, cls: "triage-title" });

    // Preview
    const previewContainer = cardEl.createDiv({ cls: "triage-preview" });
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof TFile) {
        let content = await this.app.vault.cachedRead(file);
        
        if (task.type === "task" && task.line) {
            const lines = content.split('\n');
            const start = Math.max(0, task.line - 3);
            const end = Math.min(lines.length, task.line + 3);
            content = lines.slice(start, end).join('\n');
            content = "```markdown\n" + content + "\n```"; // Show task context as code for now
        } else {
            if (content.length > 800) content = content.substring(0, 800) + "...";
        }
        
        MarkdownRenderer.render(this.app, content, previewContainer, file.path, this.component);
    }

    // Actions
    contentEl.createEl("hr", { cls: "triage-divider" });
    const colsRow = contentEl.createDiv({ cls: "triage-cols" });
    const cols = this.plugin.sessionStore.getColumns();
    cols.forEach((col, idx) => {
        if (idx < 9) {
            const btn = colsRow.createEl("button", { text: `${col.label} [${idx + 1}]`, cls: "triage-btn triage-col-btn" });
            btn.style.borderLeft = `3px solid ${col.color}`;
            btn.onclick = () => this.handleAction("move", col.id);
        }
    });

    const actionRow = contentEl.createDiv({ cls: "triage-actions" });
    const discardBtn = actionRow.createEl("button", { text: "✕ Archive [←]", cls: "triage-btn discard" });
    discardBtn.title = "Archive this item completely";
    discardBtn.onclick = () => this.handleAction("archive");

    const keepBtn = actionRow.createEl("button", { text: "Keep in Inbox [→]", cls: "triage-btn keep" });
    keepBtn.title = "Leave this item in No Status";
    keepBtn.onclick = () => this.handleAction("keep");
  }
}
