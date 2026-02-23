import { Plugin, TFile } from "obsidian";

export interface VaultTask {
  text: string;
  completed: boolean;
  filePath: string;
  line: number;
  tags: string[];
}

export class TaskScanner {
  constructor(private plugin: Plugin) {}

  async scanTasks(): Promise<VaultTask[]> {
    const tasks: VaultTask[] = [];
    const settings = (this.plugin as any).settings;
    const folder = settings?.taskDir || "";
    const scanPeriod = settings?.taskScanPeriod; // number or undefined

    const files = this.plugin.app.vault.getMarkdownFiles();
    const targetFiles = folder 
      ? files.filter((f) => f.path.startsWith(folder))
      : files;

    const thresholdTime = scanPeriod ? Date.now() - scanPeriod * 24 * 60 * 60 * 1000 : 0;
    const recentFiles = thresholdTime > 0 
      ? targetFiles.filter((f) => f.stat.mtime > thresholdTime)
      : targetFiles;

    for (const file of recentFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (!cache || !cache.listItems) continue;

      // Extract only list items that are tasks (have a checkbox)
      const taskItems = cache.listItems.filter((item) => item.task !== undefined);
      if (taskItems.length === 0) continue;

      // We still need the file content to get the actual text and exact completion status,
      // but we only read files that we KNOW have tasks.
      const content = await this.plugin.app.vault.cachedRead(file);
      const lines = content.split("\n");

      for (const item of taskItems) {
        // listItems.position.start.line is 0-indexed
        const lineIdx = item.position.start.line;
        if (lineIdx >= 0 && lineIdx < lines.length) {
           const lineText = lines[lineIdx];
           const taskMatch = lineText.match(/^(\s*)- \[([ x])\] (.+)$/i);
           
           if (taskMatch) {
              const completed = taskMatch[2].toLowerCase() === "x";
              const text = taskMatch[3].trim();
              const tags = this.extractTags(text);

              tasks.push({
                text,
                completed,
                filePath: file.path,
                line: lineIdx + 1, // 1-indexed for VaultTask
                tags,
              });
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
