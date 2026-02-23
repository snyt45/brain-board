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
  firstPrompt?: string;
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
      
      const entries = data.entries || [];
      for (const entry of entries) {
        if (!entry.summary || entry.summary.toLowerCase() === "untitled") {
          entry.summary = this.extractFallbackSummary(entry);
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  private parseFileForPrompt(jsonlPath: string): string | null {
    if (!existsSync(jsonlPath)) return null;
    try {
      const content = readFileSync(jsonlPath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "user" && parsed.message?.role === "user") {
            const contents = parsed.message.content;
            if (Array.isArray(contents)) {
              // Extract all text content
              const texts = contents
                .filter((c: any) => c.type === "text" && c.text)
                .map((c: any) => c.text.trim());
              return texts.join(" ");
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private cleanTextAndExtract(rawText: string | null | undefined): string {
    if (!rawText) return "Untitled";

    // Try to get pure user text by removing ide tags and interruptions
    let cleaned = rawText.replace(/<ide_[^>]+>[\s\S]*?<\/ide_[^>]+>/g, "");
    cleaned = cleaned.replace(/\[Request interrupted by user\]/g, "");
    cleaned = cleaned.trim();

    if (cleaned) {
      // Format it nicely
      const singleLine = cleaned.replace(/\s+/g, " ");
      return singleLine.length > 40 ? singleLine.slice(0, 40) + "..." : singleLine;
    }

    return "Untitled";
  }

  private extractFallbackSummary(entry: ClaudeSession): string {
    let rawText = this.parseFileForPrompt(entry.fullPath);
    
    // If we couldn't get it from the file, use the firstPrompt in the index
    if (!rawText && entry.firstPrompt) {
      rawText = entry.firstPrompt;
    }

    return this.cleanTextAndExtract(rawText);
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

  readSessionLogAsMarkdown(jsonlPath: string): string {
    if (!existsSync(jsonlPath)) return "Session log not found.";
    try {
      const content = readFileSync(jsonlPath, "utf-8");
      const lines = content.split("\n");
      let md = "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          
          let role = "";
          let contents: any = null;

          if (parsed.message && parsed.message.role) {
             role = parsed.message.role;
             contents = parsed.message.content;
          } else if (parsed.type === "user" || parsed.type === "assistant" || parsed.type === "system") {
             role = parsed.type;
             contents = parsed.message?.content || parsed.content;
          } else {
             continue; // ignore queue-operation, etc
          }

          let texts: string[] = [];

          if (typeof contents === "string") {
            texts.push(contents);
          } else if (Array.isArray(contents)) {
            texts = contents
              .filter((c: any) => c.type === "text" && c.text)
              .map((c: any) => c.text);
          }

          if (texts.length > 0) {
            const joined = texts.join("\n");
            // Just raw output with a simple divider to make it vaguely readable as markdown
            const roleName = role.toUpperCase();
            md += `\n---\n**${roleName}**\n\n${joined}\n`;
          }
        } catch {
          continue;
        }
      }
      return md.trim() || "No messages found in this session.";
    } catch {
      return "Failed to read session log.";
    }
  }
}
