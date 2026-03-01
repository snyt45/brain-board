import { App, TFile } from "obsidian";
import { VaultItem } from "../models/Task";
import { ColumnDef } from "../models/Column";
import { MARKDOWN_CONSTANTS, BOARD_CONSTANTS } from "../constants";

export class TaskUpdater {
  constructor(private app: App, private plugin: any) {}

  /**
   * Updates a task's completion status in its markdown file based on the target column's completesTask flag.
   */
  async updateTaskCompletion(task: VaultItem, targetCol: ColumnDef): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return;

    if (task.type === "file") {
        const trackingProp = this.plugin.settings?.trackingProperty || BOARD_CONSTANTS.STATUS_PROPERTY;
        await this.app.fileManager.processFrontMatter(file, (frontmatter: any) => {
            frontmatter[trackingProp] = targetCol.id;
        });
        return;
    }

    const shouldComplete = targetCol.completesTask === true;
    const shouldUncomplete = !targetCol.completesTask && task.completed;

    if (!shouldComplete && !shouldUncomplete) return;

    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      const idx = (task.line as number) - 1;
      
      if (idx < 0 || idx >= lines.length) return content;
      
      if (shouldComplete && lines[idx].includes(MARKDOWN_CONSTANTS.TASK_UNCHECKED)) {
        lines[idx] = lines[idx].replace(MARKDOWN_CONSTANTS.TASK_UNCHECKED, MARKDOWN_CONSTANTS.TASK_CHECKED);
      } else if (shouldUncomplete && lines[idx].includes(MARKDOWN_CONSTANTS.TASK_CHECKED)) {
        lines[idx] = lines[idx].replace(MARKDOWN_CONSTANTS.TASK_CHECKED, MARKDOWN_CONSTANTS.TASK_UNCHECKED);
      }
      
      return lines.join("\n");
    });
  }
}
