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
    const files = this.plugin.app.vault.getFiles();
    const targetFiles = folder 
      ? files.filter((f) => f.path.startsWith(folder) && f.extension === "md")
      : files.filter((f) => f.extension === "md");

    // Only scan recent files (last 7 days)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentFiles = targetFiles.filter((f) => f.stat.mtime > weekAgo);

    for (const file of recentFiles) {
      const content = await this.plugin.app.vault.cachedRead(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
        if (taskMatch) {
          const completed = taskMatch[2] === "x";
          const text = taskMatch[3].trim();
          const tags = this.extractTags(text);

          tasks.push({
            text,
            completed,
            filePath: file.path,
            line: i + 1,
            tags,
          });
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
