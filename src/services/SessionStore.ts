import { Plugin } from "obsidian";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { SessionStatus, StoredSession } from "../models/Session";
import { VaultTask, getTaskKey } from "../models/Task";
import { ColumnDef, NO_STATUS_COLUMN } from "../models/Column";

interface StoreData {
  sessions: StoredSession[];
  claudeColumns: ColumnDef[];
  obsidianColumns: ColumnDef[];
  taskAssignments: Record<string, string>; // taskKey → columnId
  cardOrder: Record<string, string[]>;     // columnId → cardId[]
  tabOrder: string[];
}

const DEFAULT_CLAUDE_COLUMNS: ColumnDef[] = [
  { id: "todo", label: "Todo", description: "", color: "#868e96" },
  { id: "doing", label: "Doing", description: "", color: "#e5a00d" },
  { id: "done", label: "Done", description: "", color: "#2da44e" },
];

const DEFAULT_TASK_COLUMNS: ColumnDef[] = [
  { id: "todo", label: "Todo", description: "", color: "#868e96", completesTask: false },
  { id: "doing", label: "Doing", description: "", color: "#e5a00d", completesTask: false },
  { id: "done", label: "Done", description: "", color: "#2da44e", completesTask: true },
];

export class SessionStore {
  private filePath: string;
  private data: StoreData;
  private subscriptions: Set<() => void> = new Set();

  constructor(plugin: Plugin, customPath?: string) {
    const vaultPath = (plugin.app.vault.adapter as any).getBasePath();
    const oldStoreDir = join(vaultPath, ".claude-board");
    const oldFilePath = join(oldStoreDir, "sessions.json");

    let storeDir = join(vaultPath, ".brain-board");
    if (customPath) {
      if (customPath.startsWith("/")) storeDir = customPath;
      else storeDir = join(vaultPath, customPath);
    }

    this.filePath = join(storeDir, "sessions.json");

    // Migration from old directory if exists
    if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });
    
    if (existsSync(oldFilePath) && !existsSync(this.filePath)) {
      try {
        const data = readFileSync(oldFilePath, "utf-8");
        writeFileSync(this.filePath, data, "utf-8");
        plugin.app.workspace.trigger("notice", "Brain Board: Migrated old data successfully.");
      } catch (e) {
        console.error("Brain Board Migration Failed:", e);
      }
    }

    this.data = this.load();
  }

  // ─── Event Emitter ─────────────────────────────────────
  subscribe(callback: () => void): () => void {
    this.subscriptions.add(callback);
    return () => this.subscriptions.delete(callback);
  }

  private emit(): void {
    for (const callback of this.subscriptions) callback();
  }

  private load(): StoreData {
    const defaults: StoreData = {
      sessions: [], claudeColumns: DEFAULT_CLAUDE_COLUMNS,
      obsidianColumns: DEFAULT_TASK_COLUMNS, taskAssignments: {}, cardOrder: {},
      tabOrder: ["tasks", "claude"],
    };
    if (!existsSync(this.filePath)) return defaults;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
      const migrateCols = (cols: any[], defs: ColumnDef[]): ColumnDef[] => {
        if (!cols) return defs;
        return cols.map((c: any) => ({
          id: c.id, label: c.label,
          description: c.description || "",
          color: c.color || "#868e96",
          completesTask: c.completesTask || false,
        })).filter(c => c.id !== NO_STATUS_COLUMN.id); // Filter out old no_status if any
      };
      return {
        sessions: raw.sessions || [],
        claudeColumns: migrateCols(raw.claudeColumns, DEFAULT_CLAUDE_COLUMNS),
        obsidianColumns: migrateCols(raw.obsidianColumns, DEFAULT_TASK_COLUMNS),
        taskAssignments: raw.taskAssignments || {},
        cardOrder: raw.cardOrder || {},
        tabOrder: raw.tabOrder || ["tasks", "claude"],
      };
    } catch { return defaults; }
  }

  private saveSilent(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  private save(): void {
    this.saveSilent();
    this.emit();
  }

  // ─── Sessions ─────────────────────────────────────────
  getSessions(): StoredSession[] { return this.data.sessions; }

  getSessionsByStatus(status: SessionStatus): StoredSession[] {
    return this.data.sessions.filter((s) => s.status === status);
  }

  getOrderedSessionsByStatus(status: SessionStatus): StoredSession[] {
    const sessions = this.getSessionsByStatus(status);
    const order = this.data.cardOrder[status];
    if (!order) return sessions;
    const indexed = new Map(sessions.map((s) => [s.id, s]));
    const ordered: StoredSession[] = [];
    for (const id of order) {
      const s = indexed.get(id);
      if (s) { ordered.push(s); indexed.delete(id); }
    }
    for (const s of indexed.values()) ordered.push(s);
    return ordered;
  }

  upsertSession(session: Omit<StoredSession, "status">, defaultStatus: SessionStatus = NO_STATUS_COLUMN.id): void {
    const existing = this.data.sessions.find((s) => s.id === session.id);
    if (existing) {
      existing.summary = session.summary;
      existing.modified = session.modified;
      existing.messageCount = session.messageCount;
    } else {
      this.data.sessions.push({ ...session, status: defaultStatus });
    }
    this.save();
  }

  updateStatus(sessionId: string, newStatus: SessionStatus): void {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const oldOrder = this.data.cardOrder[session.status];
    if (oldOrder) {
      this.data.cardOrder[session.status] = oldOrder.filter((id) => id !== sessionId);
    }
    session.status = newStatus;
    this.save();
  }

  reset(): void {
    this.data = {
      sessions: [], 
      claudeColumns: DEFAULT_CLAUDE_COLUMNS,
      obsidianColumns: DEFAULT_TASK_COLUMNS, 
      taskAssignments: {}, 
      cardOrder: {},
      tabOrder: ["tasks", "claude"],
    };
    this.save();
  }

  getCardOrder(columnId: string): string[] | undefined {
    return this.data.cardOrder[columnId];
  }

  setCardOrder(columnId: string, order: string[]): void {
    this.data.cardOrder[columnId] = order;
    this.save();
  }

  getTabOrder(): string[] {
    return this.data.tabOrder || ["tasks", "claude"];
  }

  setTabOrder(order: string[]): void {
    this.data.tabOrder = order;
    this.save();
  }

  syncFromClaude(
    claudeSessions: { project: string; sessions: import("./ClaudeReader").ClaudeSession[] }[]
  ): void {
    for (const { project, sessions } of claudeSessions) {
      for (const cs of sessions) {
        this.upsertSession({
          id: cs.sessionId, project, summary: cs.summary,
          created: cs.created, modified: cs.modified,
          messageCount: cs.messageCount, gitBranch: cs.gitBranch,
        });
      }
    }
  }

  // ─── Task Assignments ─────────────────────────────────
  getTaskColumn(taskKey: string): string | undefined {
    return this.data.taskAssignments[taskKey];
  }

  setTaskColumn(taskKey: string, columnId: string): void {
    this.data.taskAssignments[taskKey] = columnId;
    this.save();
  }

  removeTaskAssignment(taskKey: string): void {
    delete this.data.taskAssignments[taskKey];
    this.save();
  }

  syncTaskAssignments(tasks: VaultTask[], columns: ColumnDef[]): void {
    let changed = false;
    
    for (const task of tasks) {
      const key = getTaskKey(task);
      const assignedCol = this.data.taskAssignments[key];
      
      const assignedColDef = columns.find(c => c.id === assignedCol);
      const isAssignedValid = assignedColDef && (
        (task.completed && assignedColDef.completesTask) ||
        (!task.completed && !assignedColDef.completesTask)
      );

      if (!isAssignedValid) {
        let newCol = NO_STATUS_COLUMN.id;
        if (task.completed) {
          const doneCols = columns.filter(c => c.completesTask);
          if (doneCols.length > 0) {
             newCol = doneCols[doneCols.length - 1].id;
          }
        }
        
        if (this.data.taskAssignments[key] !== newCol) {
          this.data.taskAssignments[key] = newCol;
          changed = true;
        }
      }
    }
    
    if (changed) {
      this.saveSilent();
    }
  }

  // ─── Columns ──────────────────────────────────────────
  getColumns(type: "claude" | "task"): ColumnDef[] {
    const cols = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    return [NO_STATUS_COLUMN, ...cols];
  }

  setColumns(type: "claude" | "task", columns: ColumnDef[]): void {
    const filtered = columns.filter((c) => c.id !== NO_STATUS_COLUMN.id);
    if (type === "claude") this.data.claudeColumns = filtered;
    else this.data.obsidianColumns = filtered;
    this.save();
  }

  addColumn(type: "claude" | "task", column: ColumnDef): void {
    if (column.id === NO_STATUS_COLUMN.id) return;
    if (type === "claude") this.data.claudeColumns.push(column);
    else this.data.obsidianColumns.push(column);
    this.save();
  }

  removeColumn(type: "claude" | "task", columnId: string): void {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const target = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    this.setColumns(type, target.filter((c) => c.id !== columnId));
  }

  updateColumn(type: "claude" | "task", columnId: string, updates: Partial<ColumnDef>): void {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const target = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    const col = target.find((c) => c.id === columnId);
    if (col) { Object.assign(col, updates); this.save(); }
  }

  moveColumn(type: "claude" | "task", columnId: string, newIndex: number): void {
    if (columnId === NO_STATUS_COLUMN.id) return; 
    // newIndex includes NO_STATUS_COLUMN, so subtract 1 for the internal array
    const adjustedIndex = Math.max(0, newIndex - 1);
    
    const cols = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    const idx = cols.findIndex((c) => c.id === columnId);
    if (idx < 0 || idx === adjustedIndex) return;
    const [col] = cols.splice(idx, 1);
    cols.splice(adjustedIndex, 0, col);
    this.setColumns(type, cols);
  }
}
