import { App, TFile } from "obsidian";
import type { VaultItem } from "../models/Task";
import type BrainBoardPlugin from "../../main";
import { MARKDOWN_CONSTANTS, BOARD_CONSTANTS } from "../constants";

export class TaskArchiver {
  constructor(private app: App, private plugin: BrainBoardPlugin) {}

  public async archiveTask(task: VaultItem): Promise<void> {
    if (task.type === "file") {
      await this.archiveFile(task);
    } else {
      await this.archiveLine(task);
    }
    this.plugin.app.workspace.trigger("brain-board:refresh");
  }

  private async archiveFile(task: VaultItem): Promise<void> {
    const trackingProp = this.plugin.settings?.statusProperty || BOARD_CONSTANTS.STATUS_PROPERTY;
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof TFile) {
      await this.app.fileManager.processFrontMatter(file, (fm: any) => {
        fm[trackingProp] = BOARD_CONSTANTS.ARCHIVED_STATUS;
      });
    }
  }

  private async archiveLine(task: VaultItem): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      if (task.line !== undefined && task.line >= 1 && task.line <= lines.length) {
        lines[task.line - 1] = lines[task.line - 1].replace(MARKDOWN_CONSTANTS.TASK_UNCHECKED, MARKDOWN_CONSTANTS.TASK_CHECKED);
        await this.app.vault.modify(file, lines.join('\n'));
      }
    }
  }
}
