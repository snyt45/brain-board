import { App, TFile } from "obsidian";
import { VaultTask } from "../models/Task";
import { ColumnDef } from "../models/Column";

export class TaskUpdater {
  constructor(private app: App) {}

  /**
   * Updates a task's completion status in its markdown file based on the target column's completesTask flag.
   */
  async updateTaskCompletion(task: VaultTask, targetCol: ColumnDef): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return;

    const shouldComplete = targetCol.completesTask === true;
    const shouldUncomplete = !targetCol.completesTask && task.completed;

    if (!shouldComplete && !shouldUncomplete) return;

    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      const idx = task.line - 1;
      
      if (idx < 0 || idx >= lines.length) return content;
      
      if (shouldComplete && lines[idx].includes("- [ ]")) {
        lines[idx] = lines[idx].replace("- [ ]", "- [x]");
      } else if (shouldUncomplete && lines[idx].includes("- [x]")) {
        lines[idx] = lines[idx].replace("- [x]", "- [ ]");
      }
      
      return lines.join("\n");
    });
  }
}
