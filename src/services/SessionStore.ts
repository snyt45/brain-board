import { Plugin } from "obsidian";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { VaultTask, getTaskKey } from "../models/Task";
import { ColumnDef, NO_STATUS_COLUMN } from "../models/Column";

// ─── Data Model ───────────────────────────────────────
interface StoreData {
  columns: ColumnDef[];
  taskAssignments: Record<string, string>;   // taskKey → columnId
  cardOrder: Record<string, string[]>;       // columnId → cardId[]
  taskMovedAt: Record<string, number>;       // taskKey → timestamp (ms)
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "todo",  label: "Todo",  description: "", color: "#868e96", completesTask: false },
  { id: "doing", label: "Doing", description: "", color: "#e5a00d", completesTask: false },
  { id: "done",  label: "Done",  description: "", color: "#2da44e", completesTask: true  },
];

// ─── Store ────────────────────────────────────────────
export class SessionStore {
  private filePath: string;
  private data: StoreData;
  private subscriptions = new Set<() => void>();

  constructor(plugin: Plugin, customPath?: string) {
    const vaultPath = (plugin.app.vault.adapter as any).getBasePath();

    let storeDir = join(vaultPath, ".brain-board");
    if (customPath) {
      storeDir = customPath.startsWith("/") ? customPath : join(vaultPath, customPath);
    }
    if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });

    this.filePath = join(storeDir, "sessions.json");

    // Legacy migration: .claude-board → .brain-board
    const oldPath = join(vaultPath, ".claude-board", "sessions.json");
    if (existsSync(oldPath) && !existsSync(this.filePath)) {
      try {
        writeFileSync(this.filePath, readFileSync(oldPath, "utf-8"), "utf-8");
      } catch { /* migration best-effort */ }
    }

    this.data = this.load();
  }

  // ─── Event Emitter ─────────────────────────────────
  subscribe(cb: () => void): () => void {
    this.subscriptions.add(cb);
    return () => this.subscriptions.delete(cb);
  }
  private emit(): void { for (const cb of this.subscriptions) cb(); }

  // ─── Persistence ───────────────────────────────────
  private load(): StoreData {
    const defaults: StoreData = {
      columns: DEFAULT_COLUMNS, taskAssignments: {},
      cardOrder: {}, taskMovedAt: {},
    };
    if (!existsSync(this.filePath)) return defaults;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
      // Migrate from old format (obsidianColumns / claudeColumns)
      const cols = raw.columns || raw.obsidianColumns;
      return {
        columns: cols
          ? cols.map((c: any) => ({
              id: c.id, label: c.label,
              description: c.description || "",
              color: c.color || "#868e96",
              completesTask: c.completesTask || false,
            })).filter((c: ColumnDef) => c.id !== NO_STATUS_COLUMN.id)
          : DEFAULT_COLUMNS,
        taskAssignments: raw.taskAssignments || {},
        cardOrder: raw.cardOrder || {},
        taskMovedAt: raw.taskMovedAt || {},
      };
    } catch { return defaults; }
  }

  private saveSilent(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
  private save(): void { this.saveSilent(); this.emit(); }

  // ─── Reset ─────────────────────────────────────────
  reset(): void {
    this.data = { columns: DEFAULT_COLUMNS, taskAssignments: {}, cardOrder: {}, taskMovedAt: {} };
    this.save();
  }

  // ─── Card Order ────────────────────────────────────
  getCardOrder(columnId: string): string[] | undefined { return this.data.cardOrder[columnId]; }
  setCardOrder(columnId: string, order: string[]): void {
    this.data.cardOrder[columnId] = order;
    this.save();
  }

  // ─── Task Assignments ──────────────────────────────
  getTaskColumn(taskKey: string): string | undefined {
    return this.data.taskAssignments[taskKey];
  }

  setTaskColumn(taskKey: string, columnId: string): void {
    if (this.data.taskAssignments[taskKey] !== columnId) {
      this.data.taskMovedAt[taskKey] = Date.now();
    }
    this.data.taskAssignments[taskKey] = columnId;
    this.save();
  }

  syncTaskAssignments(tasks: VaultTask[], columns: ColumnDef[]): void {
    let changed = false;

    for (const task of tasks) {
      const key = getTaskKey(task);
      const assignedCol = this.data.taskAssignments[key];
      const colDef = columns.find(c => c.id === assignedCol);
      const isValid = colDef && (
        (task.completed && colDef.completesTask) ||
        (!task.completed && !colDef.completesTask)
      );

      if (!isValid) {
        let newCol = NO_STATUS_COLUMN.id;
        if (task.completed) {
          const doneCols = columns.filter(c => c.completesTask);
          if (doneCols.length > 0) newCol = doneCols[doneCols.length - 1].id;
          else {
            // Fallback: find "done" by name or use last column
            const fallback = columns.find(c => c.id.toLowerCase() === "done") || columns[columns.length - 1];
            if (fallback) newCol = fallback.id;
          }
        }
        if (this.data.taskAssignments[key] !== newCol) {
          this.data.taskAssignments[key] = newCol;
          this.data.taskMovedAt[key] = Date.now();
          changed = true;
        }
      }

      // Ensure age tracking exists for all tasks
      if (!this.data.taskMovedAt[key]) {
        this.data.taskMovedAt[key] = Date.now();
        changed = true;
      }
    }

    // Garbage-collect stale assignments
    const currentKeys = new Set(tasks.map(t => getTaskKey(t)));
    for (const key of Object.keys(this.data.taskAssignments)) {
      if (!currentKeys.has(key)) {
        delete this.data.taskAssignments[key];
        delete this.data.taskMovedAt[key];
        changed = true;
      }
    }
    for (const key of Object.keys(this.data.taskMovedAt)) {
      if (!currentKeys.has(key)) {
        delete this.data.taskMovedAt[key];
        changed = true;
      }
    }

    if (changed) this.saveSilent();
  }

  // ─── Pinned Files ──────────────────────────────────
  getPinnedFilePaths(): string[] {
    const paths = new Set<string>();
    for (const [key, colId] of Object.entries(this.data.taskAssignments)) {
      if (colId !== NO_STATUS_COLUMN.id) {
        const filePath = key.split("::")[0];
        if (filePath) paths.add(filePath);
      }
    }
    return Array.from(paths);
  }

  // ─── Task Age ──────────────────────────────────────
  getTaskAge(key: string): number {
    const movedAt = this.data.taskMovedAt[key];
    if (!movedAt) return 0;
    return Math.floor((Date.now() - movedAt) / (24 * 60 * 60 * 1000));
  }

  // ─── Columns ───────────────────────────────────────
  getColumns(): ColumnDef[] {
    return [NO_STATUS_COLUMN, ...this.data.columns];
  }

  addColumn(column: ColumnDef): void {
    if (column.id === NO_STATUS_COLUMN.id) return;
    this.data.columns.push(column);
    this.save();
  }

  removeColumn(columnId: string): void {
    if (columnId === NO_STATUS_COLUMN.id) return;
    this.data.columns = this.data.columns.filter(c => c.id !== columnId);
    this.save();
  }

  updateColumn(columnId: string, updates: Partial<ColumnDef>): void {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const col = this.data.columns.find(c => c.id === columnId);
    if (col) { Object.assign(col, updates); this.save(); }
  }

  moveColumn(columnId: string, newIndex: number): void {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const adjustedIndex = Math.max(0, newIndex - 1); // account for NO_STATUS
    const cols = this.data.columns;
    const idx = cols.findIndex(c => c.id === columnId);
    if (idx < 0 || idx === adjustedIndex) return;
    const [col] = cols.splice(idx, 1);
    cols.splice(adjustedIndex, 0, col);
    this.save();
  }
}
