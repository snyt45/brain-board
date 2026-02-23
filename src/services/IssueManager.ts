import { Plugin, TFile } from "obsidian";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as md5Import from "md5";
// require fallback for commonjs if default import fails
const md5 = (md5Import as any).default || md5Import;

export interface IssueData {
  id: string;      // MD5 hash of taskKey or assignment ID
  taskKey: string; // The original filePath + text
  content: string; // The markdown content
}

export class IssueManager {
  private issueDir: string;

  constructor(private plugin: Plugin) {
    const vaultPath = (plugin.app.vault.adapter as any).getBasePath();
    const settings = (plugin as any).settings;
    const storeDir = settings?.storageDir || ".brain-board";
    
    let basePath = join(vaultPath, ".brain-board");
    if (storeDir) {
      if (storeDir.startsWith("/")) basePath = storeDir;
      else basePath = join(vaultPath, storeDir);
    }
    
    this.issueDir = join(basePath, "issues");
    if (!existsSync(this.issueDir)) {
      mkdirSync(this.issueDir, { recursive: true });
    }
  }

  // Generate a consistent ID based on the task key (filePath::text)
  public generateIssueId(taskKey: string): string {
    return md5(taskKey);
  }

  private getIssuePath(id: string): string {
    return join(this.issueDir, `${id}.md`);
  }

  public getIssue(taskKey: string): IssueData {
    const id = this.generateIssueId(taskKey);
    const path = this.getIssuePath(id);

    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return { id, taskKey, content };
    }

    return { id, taskKey, content: "" };
  }

  public saveIssue(taskKey: string, content: string): void {
    const id = this.generateIssueId(taskKey);
    const path = this.getIssuePath(id);
    writeFileSync(path, content, "utf-8");
  }

  public hasIssue(taskKey: string): boolean {
    return existsSync(this.getIssuePath(this.generateIssueId(taskKey)));
  }
}
