import { Plugin, TFile } from "obsidian";
import { VaultItem } from "../models/Task";
import type BrainBoardPlugin from "../../main";
import { BOARD_CONSTANTS, MARKDOWN_CONSTANTS } from "../constants";

export class TaskScanner {
  constructor(private plugin: Plugin) {}

  async scanTasks(pinnedFiles?: string[]): Promise<VaultItem[]> {
    const tasks: VaultItem[] = [];
    const settings = (this.plugin as any).settings;
    
    // Parse the 3-layer paths
    const excludePaths = (settings?.excludePaths || "").split(',').map((s: string) => s.trim()).filter(Boolean);
    const autoInboxPaths = (settings?.autoInboxPaths || "").split(',').map((s: string) => s.trim()).filter(Boolean);
    const taskSearchPaths = (settings?.taskSearchPaths || "").split(',').map((s: string) => s.trim()).filter(Boolean);
    
    // Status prop fallback
    const statusProperty = settings?.statusProperty || BOARD_CONSTANTS.STATUS_PROPERTY;
    const scanPeriod = settings?.taskScanPeriod; // number or undefined

    const files = this.plugin.app.vault.getMarkdownFiles();
    const thresholdTime = scanPeriod ? Date.now() - scanPeriod * 24 * 60 * 60 * 1000 : 0;
    
    for (const file of files) {
      // 0. Time Filter
      if (thresholdTime > 0 && file.stat.ctime <= thresholdTime) {
         if (!pinnedFiles || !pinnedFiles.includes(file.path)) {
            continue;
         }
      }

      // 1. Global Excludes
      const isExcluded = excludePaths.some((ex: string) => file.path.startsWith(ex));
      if (isExcluded) continue;

      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      
      let isFileCard = false;

      // 2. Auto-Inbox Path Check
      if (autoInboxPaths.length > 0 && autoInboxPaths.some((p: string) => file.path.startsWith(p))) {
        isFileCard = true;
      }

      // 3. Property Tracker Check
      if (!isFileCard && cache.frontmatter && cache.frontmatter[statusProperty] !== undefined) {
        if (cache.frontmatter[statusProperty] !== BOARD_CONSTANTS.ARCHIVED_STATUS) {
           isFileCard = true;
        }
      }

      // Push File Card if matched
      if (isFileCard) {
        const fallbackTags = this.extractTags(file.basename);
        tasks.push({
          type: "file",
          text: file.basename,
          completed: false,
          filePath: file.path,
          line: undefined,
          tags: cache.frontmatter?.tags ? (Array.isArray(cache.frontmatter.tags) ? cache.frontmatter.tags : [cache.frontmatter.tags]) : fallbackTags,
          ctime: file.stat.ctime,
          mtime: file.stat.mtime
        });
      }

      // 4. Task Search Path Check
      let isTaskSearchable = taskSearchPaths.length === 0; // Empty means scan entire vault
      if (!isTaskSearchable) {
         isTaskSearchable = taskSearchPaths.some((p: string) => file.path.startsWith(p));
      }

      if (isTaskSearchable && cache.listItems) {
        const taskItems = cache.listItems.filter((item) => item.task !== undefined);
        if (taskItems.length > 0) {
          const content = await this.plugin.app.vault.cachedRead(file);
          const lines = content.split("\n");

          for (const item of taskItems) {
            const lineIdx = item.position.start.line;
            if (lineIdx >= 0 && lineIdx < lines.length) {
               const lineText = lines[lineIdx];
               const taskMatch = lineText.match(MARKDOWN_CONSTANTS.TASK_REGEX);
               
               if (taskMatch) {
                  const completed = taskMatch[2].toLowerCase() === "x";
                  const text = taskMatch[3].trim();
                  const tags = this.extractTags(text);

                  tasks.push({
                    type: "task",
                    text,
                    completed,
                    filePath: file.path,
                    line: lineIdx + 1,
                    tags,
                    ctime: file.stat.ctime,
                    mtime: file.stat.mtime,
                  });
               }
            }
          }
        }
      }
    }

    return tasks;
  }

  private extractTags(text: string): string[] {
    const matches = text.match(/#[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g);
    return matches || [];
  }
}
