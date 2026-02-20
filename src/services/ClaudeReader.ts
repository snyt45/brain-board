import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface ClaudeSession {
  sessionId: string;
  summary: string;
  created: string;
  modified: string;
  messageCount: number;
  gitBranch: string;
  projectPath: string;
  fullPath: string;
}

export interface SessionsIndex {
  version: number;
  entries: ClaudeSession[];
}

export class ClaudeReader {
  private claudeDir: string;

  constructor(claudePath?: string) {
    if (claudePath) {
      this.claudeDir = claudePath.startsWith("~/") 
        ? join(homedir(), claudePath.slice(2))
        : claudePath;
    } else {
      this.claudeDir = join(homedir(), ".claude");
    }
  }

  getProjectDirs(): string[] {
    const projectsDir = join(this.claudeDir, "projects");
    if (!existsSync(projectsDir)) return [];

    return readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "." && d.name !== "..")
      .map((d) => d.name);
  }

  getProjectDisplayName(dirName: string): string {
    // "-Users-snyt45-work-toypo-api" → "toypo-api"
    const parts = dirName.replace(/^-/, "").split("-");
    // Take last meaningful segment(s)
    const workIdx = parts.lastIndexOf("work");
    if (workIdx >= 0 && workIdx < parts.length - 1) {
      return parts.slice(workIdx + 1).join("-");
    }
    return parts[parts.length - 1] || dirName;
  }

  readSessionsIndex(projectDir: string): ClaudeSession[] {
    const indexPath = join(
      this.claudeDir,
      "projects",
      projectDir,
      "sessions-index.json"
    );
    if (!existsSync(indexPath)) return [];

    try {
      const raw = readFileSync(indexPath, "utf-8");
      const data: SessionsIndex = JSON.parse(raw);
      return data.entries || [];
    } catch {
      return [];
    }
  }

  getAllSessions(): { project: string; sessions: ClaudeSession[] }[] {
    const projects = this.getProjectDirs();
    return projects
      .map((dir) => ({
        project: this.getProjectDisplayName(dir),
        sessions: this.readSessionsIndex(dir),
      }))
      .filter((p) => p.sessions.length > 0);
  }
}
