var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BrainBoardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/services/ClaudeReader.ts
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");
var ClaudeReader = class {
  constructor(claudePath) {
    if (claudePath) {
      this.claudeDir = claudePath.startsWith("~/") ? (0, import_path.join)((0, import_os.homedir)(), claudePath.slice(2)) : claudePath;
    } else {
      this.claudeDir = (0, import_path.join)((0, import_os.homedir)(), ".claude");
    }
  }
  getProjectDirs() {
    const projectsDir = (0, import_path.join)(this.claudeDir, "projects");
    if (!(0, import_fs.existsSync)(projectsDir)) return [];
    return (0, import_fs.readdirSync)(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "." && d.name !== "..").map((d) => d.name);
  }
  getProjectDisplayName(dirName) {
    const parts = dirName.replace(/^-/, "").split("-");
    const workIdx = parts.lastIndexOf("work");
    if (workIdx >= 0 && workIdx < parts.length - 1) {
      return parts.slice(workIdx + 1).join("-");
    }
    return parts[parts.length - 1] || dirName;
  }
  readSessionsIndex(projectDir) {
    const indexPath = (0, import_path.join)(
      this.claudeDir,
      "projects",
      projectDir,
      "sessions-index.json"
    );
    if (!(0, import_fs.existsSync)(indexPath)) return [];
    try {
      const raw = (0, import_fs.readFileSync)(indexPath, "utf-8");
      const data = JSON.parse(raw);
      return data.entries || [];
    } catch (e) {
      return [];
    }
  }
  getAllSessions() {
    const projects = this.getProjectDirs();
    return projects.map((dir) => ({
      project: this.getProjectDisplayName(dir),
      sessions: this.readSessionsIndex(dir)
    })).filter((p) => p.sessions.length > 0);
  }
};

// src/services/SessionStore.ts
var import_fs2 = require("fs");
var import_path2 = require("path");

// src/models/Task.ts
function getTaskKey(t) {
  return `${t.filePath}::${t.text}`;
}

// src/models/Column.ts
var NO_STATUS_COLUMN = {
  id: "no_status",
  label: "No Status",
  description: "",
  color: "#545d68",
  completesTask: false
};

// src/services/SessionStore.ts
var DEFAULT_CLAUDE_COLUMNS = [
  { id: "todo", label: "Todo", description: "", color: "#868e96" },
  { id: "doing", label: "Doing", description: "", color: "#e5a00d" },
  { id: "done", label: "Done", description: "", color: "#2da44e" }
];
var DEFAULT_TASK_COLUMNS = [
  { id: "todo", label: "Todo", description: "", color: "#868e96", completesTask: false },
  { id: "doing", label: "Doing", description: "", color: "#e5a00d", completesTask: false },
  { id: "done", label: "Done", description: "", color: "#2da44e", completesTask: true }
];
var SessionStore = class {
  constructor(plugin, customPath) {
    this.subscriptions = /* @__PURE__ */ new Set();
    const vaultPath = plugin.app.vault.adapter.getBasePath();
    const oldStoreDir = (0, import_path2.join)(vaultPath, ".claude-board");
    const oldFilePath = (0, import_path2.join)(oldStoreDir, "sessions.json");
    let storeDir = (0, import_path2.join)(vaultPath, ".brain-board");
    if (customPath) {
      if (customPath.startsWith("/")) storeDir = customPath;
      else storeDir = (0, import_path2.join)(vaultPath, customPath);
    }
    this.filePath = (0, import_path2.join)(storeDir, "sessions.json");
    if (!(0, import_fs2.existsSync)(storeDir)) (0, import_fs2.mkdirSync)(storeDir, { recursive: true });
    if ((0, import_fs2.existsSync)(oldFilePath) && !(0, import_fs2.existsSync)(this.filePath)) {
      try {
        const data = (0, import_fs2.readFileSync)(oldFilePath, "utf-8");
        (0, import_fs2.writeFileSync)(this.filePath, data, "utf-8");
        plugin.app.workspace.trigger("notice", "Brain Board: Migrated old data successfully.");
      } catch (e) {
        console.error("Brain Board Migration Failed:", e);
      }
    }
    this.data = this.load();
  }
  // ─── Event Emitter ─────────────────────────────────────
  subscribe(callback) {
    this.subscriptions.add(callback);
    return () => this.subscriptions.delete(callback);
  }
  emit() {
    for (const callback of this.subscriptions) callback();
  }
  load() {
    const defaults = {
      sessions: [],
      claudeColumns: DEFAULT_CLAUDE_COLUMNS,
      obsidianColumns: DEFAULT_TASK_COLUMNS,
      taskAssignments: {},
      cardOrder: {},
      tabOrder: ["tasks", "claude"]
    };
    if (!(0, import_fs2.existsSync)(this.filePath)) return defaults;
    try {
      const raw = JSON.parse((0, import_fs2.readFileSync)(this.filePath, "utf-8"));
      const migrateCols = (cols, defs) => {
        if (!cols) return defs;
        return cols.map((c) => ({
          id: c.id,
          label: c.label,
          description: c.description || "",
          color: c.color || "#868e96",
          completesTask: c.completesTask || false
        })).filter((c) => c.id !== NO_STATUS_COLUMN.id);
      };
      return {
        sessions: raw.sessions || [],
        claudeColumns: migrateCols(raw.claudeColumns, DEFAULT_CLAUDE_COLUMNS),
        obsidianColumns: migrateCols(raw.obsidianColumns, DEFAULT_TASK_COLUMNS),
        taskAssignments: raw.taskAssignments || {},
        cardOrder: raw.cardOrder || {},
        tabOrder: raw.tabOrder || ["tasks", "claude"]
      };
    } catch (e) {
      return defaults;
    }
  }
  saveSilent() {
    (0, import_fs2.writeFileSync)(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
  save() {
    this.saveSilent();
    this.emit();
  }
  // ─── Sessions ─────────────────────────────────────────
  getSessions() {
    return this.data.sessions;
  }
  getSessionsByStatus(status) {
    return this.data.sessions.filter((s) => s.status === status);
  }
  getOrderedSessionsByStatus(status) {
    const sessions = this.getSessionsByStatus(status);
    const order = this.data.cardOrder[status];
    if (!order) return sessions;
    const indexed = new Map(sessions.map((s) => [s.id, s]));
    const ordered = [];
    for (const id of order) {
      const s = indexed.get(id);
      if (s) {
        ordered.push(s);
        indexed.delete(id);
      }
    }
    for (const s of indexed.values()) ordered.push(s);
    return ordered;
  }
  upsertSession(session, defaultStatus = NO_STATUS_COLUMN.id) {
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
  updateStatus(sessionId, newStatus) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const oldOrder = this.data.cardOrder[session.status];
    if (oldOrder) {
      this.data.cardOrder[session.status] = oldOrder.filter((id) => id !== sessionId);
    }
    session.status = newStatus;
    this.save();
  }
  reset() {
    this.data = {
      sessions: [],
      claudeColumns: DEFAULT_CLAUDE_COLUMNS,
      obsidianColumns: DEFAULT_TASK_COLUMNS,
      taskAssignments: {},
      cardOrder: {},
      tabOrder: ["tasks", "claude"]
    };
    this.save();
  }
  getCardOrder(columnId) {
    return this.data.cardOrder[columnId];
  }
  setCardOrder(columnId, order) {
    this.data.cardOrder[columnId] = order;
    this.save();
  }
  getTabOrder() {
    return this.data.tabOrder || ["tasks", "claude"];
  }
  setTabOrder(order) {
    this.data.tabOrder = order;
    this.save();
  }
  syncFromClaude(claudeSessions) {
    for (const { project, sessions } of claudeSessions) {
      for (const cs of sessions) {
        this.upsertSession({
          id: cs.sessionId,
          project,
          summary: cs.summary,
          created: cs.created,
          modified: cs.modified,
          messageCount: cs.messageCount,
          gitBranch: cs.gitBranch
        });
      }
    }
  }
  // ─── Task Assignments ─────────────────────────────────
  getTaskColumn(taskKey) {
    return this.data.taskAssignments[taskKey];
  }
  setTaskColumn(taskKey, columnId) {
    this.data.taskAssignments[taskKey] = columnId;
    this.save();
  }
  removeTaskAssignment(taskKey) {
    delete this.data.taskAssignments[taskKey];
    this.save();
  }
  syncTaskAssignments(tasks, columns) {
    let changed = false;
    for (const task of tasks) {
      const key = getTaskKey(task);
      const assignedCol = this.data.taskAssignments[key];
      const assignedColDef = columns.find((c) => c.id === assignedCol);
      const isAssignedValid = assignedColDef && (task.completed && assignedColDef.completesTask || !task.completed && !assignedColDef.completesTask);
      if (!isAssignedValid) {
        let newCol = NO_STATUS_COLUMN.id;
        if (task.completed) {
          const doneCols = columns.filter((c) => c.completesTask);
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
  getColumns(type) {
    const cols = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    return [NO_STATUS_COLUMN, ...cols];
  }
  setColumns(type, columns) {
    const filtered = columns.filter((c) => c.id !== NO_STATUS_COLUMN.id);
    if (type === "claude") this.data.claudeColumns = filtered;
    else this.data.obsidianColumns = filtered;
    this.save();
  }
  addColumn(type, column) {
    if (column.id === NO_STATUS_COLUMN.id) return;
    if (type === "claude") this.data.claudeColumns.push(column);
    else this.data.obsidianColumns.push(column);
    this.save();
  }
  removeColumn(type, columnId) {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const target = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    this.setColumns(type, target.filter((c) => c.id !== columnId));
  }
  updateColumn(type, columnId, updates) {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const target = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    const col = target.find((c) => c.id === columnId);
    if (col) {
      Object.assign(col, updates);
      this.save();
    }
  }
  moveColumn(type, columnId, newIndex) {
    if (columnId === NO_STATUS_COLUMN.id) return;
    const adjustedIndex = Math.max(0, newIndex - 1);
    const cols = type === "claude" ? this.data.claudeColumns : this.data.obsidianColumns;
    const idx = cols.findIndex((c) => c.id === columnId);
    if (idx < 0 || idx === adjustedIndex) return;
    const [col] = cols.splice(idx, 1);
    cols.splice(adjustedIndex, 0, col);
    this.setColumns(type, cols);
  }
};

// src/views/BoardView.ts
var import_obsidian3 = require("obsidian");

// src/services/TaskScanner.ts
var TaskScanner = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  async scanTasks() {
    const tasks = [];
    const settings = this.plugin.settings;
    const folder = (settings == null ? void 0 : settings.taskDir) || "";
    const files = this.plugin.app.vault.getFiles();
    const targetFiles = folder ? files.filter((f) => f.path.startsWith(folder) && f.extension === "md") : files.filter((f) => f.extension === "md");
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
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
            tags
          });
        }
      }
    }
    return tasks;
  }
  extractTags(text) {
    const matches = text.match(/#[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g);
    return matches || [];
  }
};

// src/services/TaskUpdater.ts
var import_obsidian = require("obsidian");
var TaskUpdater = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * Updates a task's completion status in its markdown file based on the target column's completesTask flag.
   */
  async updateTaskCompletion(task, targetCol) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof import_obsidian.TFile)) return;
    const shouldComplete = targetCol.completesTask === true;
    const shouldUncomplete = !targetCol.completesTask && task.completed;
    if (!shouldComplete && !shouldUncomplete) return;
    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      const idx = task.line - 1;
      if (idx < 0 || idx >= lines.length) return content;
      if (shouldComplete && lines[idx].includes("- [ ]")) {
        lines[idx] = lines[idx].replace("- [ ]", "- [x]");
      } else if (shouldUncomplete && lines[idx].includes("- [x]")) {
        lines[idx] = lines[idx].replace("- [x]", "- [ ]");
      }
      return lines.join("\n");
    });
  }
};

// src/views/components/ColumnSettingsModal.ts
var import_obsidian2 = require("obsidian");
var PRESET_COLORS = [
  "#868e96",
  "#e5a00d",
  "#2da44e",
  "#0969da",
  "#8250df",
  "#cf222e",
  "#d4a72c",
  "#57606a"
];
var ColumnSettingsModal = class extends import_obsidian2.Modal {
  constructor(app, col, type, hideCompletesTask, onSave) {
    super(app);
    this.col = col;
    this.type = type;
    this.onSave = onSave;
    this.label = col.label;
    this.description = col.description;
    this.color = col.color;
    this.completesTask = col.completesTask || false;
    this.hideCompletesTask = hideCompletesTask;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("column-settings-modal");
    contentEl.createEl("h3", { text: "Edit column" });
    new import_obsidian2.Setting(contentEl).setName("Label").addText((text) => {
      text.setValue(this.label).onChange((v) => {
        this.label = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName("Description").addText((text) => {
      text.setValue(this.description).setPlaceholder("Optional").onChange((v) => {
        this.description = v;
      });
    });
    const colorSetting = new import_obsidian2.Setting(contentEl).setName("Color");
    const colorRow = colorSetting.controlEl.createDiv({ cls: "color-picker-row" });
    for (const c of PRESET_COLORS) {
      const swatch = colorRow.createDiv({ cls: `color-swatch${c === this.color ? " color-swatch-active" : ""}` });
      swatch.style.backgroundColor = c;
      swatch.addEventListener("click", () => {
        this.color = c;
        colorRow.querySelectorAll(".color-swatch-active").forEach((el) => el.removeClass("color-swatch-active"));
        swatch.addClass("color-swatch-active");
      });
    }
    if (this.type === "task" && !this.hideCompletesTask) {
      new import_obsidian2.Setting(contentEl).setName("Done Column").setDesc("Tasks dropped here will be marked as complete").addToggle((toggle) => {
        toggle.setValue(this.completesTask).onChange((v) => {
          this.completesTask = v;
        });
      });
    }
    const footer = contentEl.createDiv({ cls: "modal-footer" });
    const saveBtn = footer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      this.onSave({
        label: this.label,
        description: this.description,
        color: this.color,
        completesTask: this.type === "task" ? this.completesTask : void 0
      });
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/BoardView.ts
var BOARD_VIEW_TYPE = "brain-board-view";
var BoardView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin, store) {
    super(leaf);
    this.activeTab = "tasks";
    this.tasks = [];
    this.unsubscribe = null;
    // D&D state
    this.dragType = null;
    this.dragId = null;
    this.dragBoardType = null;
    this.lastDroppedId = null;
    this.plugin = plugin;
    this.store = store;
    this.scanner = new TaskScanner(plugin);
    this.taskUpdater = new TaskUpdater(this.app);
  }
  getViewType() {
    return BOARD_VIEW_TYPE;
  }
  getDisplayText() {
    return "AI Kanban Board";
  }
  getIcon() {
    return "check-square";
  }
  async onOpen() {
    this.unsubscribe = this.store.subscribe(() => this.render());
    await this.refresh();
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const targetDir = this.plugin.settings.taskDir;
        if (!targetDir || file.path.startsWith(targetDir)) {
          if (this.activeTab === "tasks") {
            this.refresh();
          }
        }
      })
    );
  }
  async onClose() {
    if (this.unsubscribe) this.unsubscribe();
  }
  async refresh() {
    if (this.activeTab === "tasks") {
      this.tasks = await this.scanner.scanTasks();
      this.store.syncTaskAssignments(this.tasks, this.store.getColumns("task"));
    }
    this.render();
  }
  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════
  render() {
    const root = this.containerEl.children[1];
    const scrollMap = /* @__PURE__ */ new Map();
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column");
      if (parent && parent.dataset.columnId) {
        scrollMap.set(parent.dataset.columnId, el.scrollTop);
      }
    });
    root.empty();
    root.addClass("board-root");
    const tabs = root.createDiv({ cls: "board-tabs" });
    const tabOrder = this.store.getTabOrder();
    for (const id of tabOrder) {
      if (id === "tasks") this.renderTab(tabs, "tasks", "Obsidian");
      if (id === "claude") this.renderTab(tabs, "claude", "Claude");
    }
    const content = root.createDiv({ cls: "board-content" });
    if (this.activeTab === "claude") this.renderClaudeBoard(content);
    else this.renderTaskBoard(content);
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column");
      if (parent && parent.dataset.columnId && scrollMap.has(parent.dataset.columnId)) {
        el.scrollTop = scrollMap.get(parent.dataset.columnId);
      }
    });
  }
  renderTab(container, id, label) {
    const active = this.activeTab === id;
    const tab = container.createEl("button", {
      text: label,
      cls: `board-tab${active ? " board-tab-active" : ""}`
    });
    tab.addEventListener("click", async () => {
      if (this.activeTab !== id) {
        this.activeTab = id;
        await this.refresh();
      }
    });
    tab.draggable = true;
    tab.dataset.tabId = id;
    tab.addEventListener("dragstart", (e) => {
      var _a;
      this.dragType = "tab";
      this.dragId = id;
      tab.addClass("tab-dragging");
      (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", id);
    });
    tab.addEventListener("dragend", () => {
      this.resetDrag();
      tab.removeClass("tab-dragging");
    });
    tab.addEventListener("dragover", (e) => {
      if (this.dragType === "tab" && this.dragId !== id) {
        e.preventDefault();
        const rect = tab.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        container.querySelectorAll(".tab-drop-left, .tab-drop-right").forEach((el) => {
          el.removeClass("tab-drop-left");
          el.removeClass("tab-drop-right");
        });
        tab.addClass(e.clientX < mid ? "tab-drop-left" : "tab-drop-right");
      }
    });
    tab.addEventListener("dragleave", () => {
      tab.removeClass("tab-drop-left");
      tab.removeClass("tab-drop-right");
    });
    tab.addEventListener("drop", (e) => {
      if (this.dragType === "tab" && this.dragId) {
        e.preventDefault();
        e.stopPropagation();
        const rect = tab.getBoundingClientRect();
        const currentOrder = this.store.getTabOrder();
        const dragIdx = currentOrder.indexOf(this.dragId);
        let targetIdx = currentOrder.indexOf(id);
        if (e.clientX >= rect.left + rect.width / 2) targetIdx++;
        if (dragIdx < targetIdx) targetIdx--;
        if (dragIdx !== targetIdx && targetIdx >= 0) {
          const newOrder = [...currentOrder];
          const [removed] = newOrder.splice(dragIdx, 1);
          newOrder.splice(targetIdx, 0, removed);
          this.store.setTabOrder(newOrder);
          this.render();
        }
        this.resetDrag();
      }
    });
  }
  // ═══════════════════════════════════════════════════════
  // Claude Board
  // ═══════════════════════════════════════════════════════
  renderClaudeBoard(container) {
    const toolbar = container.createDiv({ cls: "board-toolbar" });
    const syncBtn = toolbar.createEl("button", { text: "Sync", cls: "board-action-btn" });
    syncBtn.addEventListener("click", () => {
      this.app.workspace.trigger("brain-board:sync");
      setTimeout(() => this.render(), 300);
    });
    const board = container.createDiv({ cls: "kanban-board" });
    const columns = this.store.getColumns("claude");
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const sessions = this.store.getOrderedSessionsByStatus(col.id);
      this.renderColumn(board, col, i, "claude", sessions.length, (cards) => {
        for (const s of sessions) this.renderSessionCard(cards, s);
      });
    }
    this.renderAddColumnBtn(board, "claude");
  }
  // ═══════════════════════════════════════════════════════
  // Task Board
  // ═══════════════════════════════════════════════════════
  renderTaskBoard(container) {
    const toolbar = container.createDiv({ cls: "board-toolbar" });
    const board = container.createDiv({ cls: "kanban-board" });
    const columns = this.store.getColumns("task");
    const columnTasks = this.assignTasksToColumns(columns);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const tasks = columnTasks.get(col.id) || [];
      const order = this.store.getCardOrder(col.id);
      let orderedTasks = tasks;
      if (order) {
        const indexed = new Map(tasks.map((t) => [getTaskKey(t), t]));
        orderedTasks = [];
        for (const id of order) {
          const t = indexed.get(id);
          if (t) {
            orderedTasks.push(t);
            indexed.delete(id);
          }
        }
        for (const t of indexed.values()) orderedTasks.push(t);
      }
      this.renderColumn(board, col, i, "task", orderedTasks.length, (cards) => {
        for (const t of orderedTasks) this.renderTaskCard(cards, t);
      });
    }
    this.renderAddColumnBtn(board, "task");
  }
  assignTasksToColumns(columns) {
    const result = /* @__PURE__ */ new Map();
    for (const col of columns) result.set(col.id, []);
    for (const task of this.tasks) {
      const key = getTaskKey(task);
      const assignedCol = this.store.getTaskColumn(key) || NO_STATUS_COLUMN.id;
      if (result.has(assignedCol)) {
        result.get(assignedCol).push(task);
      } else {
        result.get(NO_STATUS_COLUMN.id).push(task);
      }
    }
    return result;
  }
  // ═══════════════════════════════════════════════════════
  // Column (shared)
  // ═══════════════════════════════════════════════════════
  renderColumn(board, col, index, boardType, count, renderCards) {
    const column = board.createDiv({ cls: "kanban-column" });
    column.dataset.columnId = col.id;
    column.dataset.columnIndex = String(index);
    const isSystemCol = col.id === NO_STATUS_COLUMN.id;
    const header = column.createDiv({ cls: "kanban-column-header" });
    if (!isSystemCol) header.draggable = true;
    const headerMain = header.createDiv({ cls: "kanban-column-header-main" });
    const titleWrap = headerMain.createDiv({ cls: "kanban-column-title-wrap" });
    const dot = titleWrap.createEl("span", { cls: "kanban-color-dot" });
    dot.style.backgroundColor = col.color;
    titleWrap.createEl("span", { text: col.label, cls: "kanban-column-title" });
    const rightWrap = headerMain.createDiv({ cls: "kanban-column-right" });
    rightWrap.createEl("span", { text: String(count), cls: "kanban-column-count" });
    if (!isSystemCol) {
      const menuBtn = rightWrap.createEl("button", { text: "\u22EF", cls: "column-menu-btn" });
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showColumnMenu(e, boardType, col);
      });
      header.addEventListener("dragstart", (e) => {
        var _a;
        this.dragType = "column";
        this.dragId = col.id;
        this.dragBoardType = boardType;
        header.addClass("column-dragging");
        (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", col.id);
      });
      header.addEventListener("dragend", () => {
        this.resetDrag();
        header.removeClass("column-dragging");
      });
    }
    if (col.description) {
      header.createDiv({ text: col.description, cls: "kanban-column-desc" });
    }
    column.addEventListener("dragover", (e) => {
      if (this.dragType === "column" && this.dragBoardType === boardType && this.dragId !== col.id && !isSystemCol) {
        e.preventDefault();
        this.clearColumnIndicators(board);
        const rect = column.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        column.addClass(e.clientX < mid ? "column-drop-left" : "column-drop-right");
      }
    });
    column.addEventListener("dragleave", () => {
      column.removeClass("column-drop-left");
      column.removeClass("column-drop-right");
    });
    column.addEventListener("drop", (e) => {
      if (this.dragType === "column" && this.dragId && this.dragBoardType === boardType) {
        e.preventDefault();
        e.stopPropagation();
        if (isSystemCol) {
          this.resetDrag();
          return;
        }
        const rect = column.getBoundingClientRect();
        const cols = this.store.getColumns(boardType);
        const dragIdx = cols.findIndex((c) => c.id === this.dragId);
        let targetIdx = index;
        if (e.clientX >= rect.left + rect.width / 2) targetIdx++;
        if (dragIdx < targetIdx) targetIdx--;
        if (dragIdx !== targetIdx && targetIdx >= 1) {
          this.store.moveColumn(boardType, this.dragId, targetIdx);
        }
        this.resetDrag();
      }
    });
    const cards = column.createDiv({ cls: "kanban-cards" });
    this.setupCardDropZone(cards, col, boardType);
    renderCards(cards);
  }
  renderAddColumnBtn(board, type) {
    const addCol = board.createDiv({ cls: "kanban-add-column" });
    const addBtn = addCol.createEl("button", { text: "+ Column", cls: "add-column-btn" });
    addBtn.addEventListener("click", () => {
      addCol.empty();
      const input = addCol.createEl("input", { cls: "column-name-input" });
      input.type = "text";
      input.placeholder = "Column name";
      input.focus();
      const commit = () => {
        const label = input.value.trim();
        if (label) {
          const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36);
          this.store.addColumn(type, { id, label, description: "", color: "#868e96" });
        } else {
          this.render();
        }
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
        }
        if (e.key === "Escape") {
          input.value = "";
          input.blur();
        }
      });
      input.addEventListener("blur", commit);
    });
  }
  // ═══════════════════════════════════════════════════════
  // Cards
  // ═══════════════════════════════════════════════════════
  renderSessionCard(container, session) {
    const card = container.createDiv({ cls: "kanban-card" });
    if (session.id === this.lastDroppedId) card.addClass("card-highlight");
    card.draggable = true;
    card.dataset.cardId = session.id;
    card.createEl("div", { text: session.summary || "Untitled", cls: "card-title" });
    const meta = card.createDiv({ cls: "card-meta" });
    meta.createEl("span", { text: session.project, cls: "card-tag" });
    if (session.gitBranch) meta.createEl("span", { text: session.gitBranch, cls: "card-tag card-branch" });
    const info = card.createDiv({ cls: "card-info" });
    const d = new Date(session.modified);
    info.createEl("span", {
      text: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`,
      cls: "card-date"
    });
    info.createEl("span", { text: `${session.messageCount} msgs`, cls: "card-date" });
    card.addEventListener("dragstart", (e) => {
      this.dragType = "session";
      this.dragId = session.id;
      card.addClass("card-dragging");
    });
    card.addEventListener("dragend", () => {
      this.resetDrag();
      card.removeClass("card-dragging");
    });
  }
  renderTaskCard(container, task) {
    const key = getTaskKey(task);
    const cls = `kanban-card${task.completed ? " card-completed" : ""}${key === this.lastDroppedId ? " card-highlight" : ""}`;
    const card = container.createDiv({ cls });
    card.draggable = true;
    card.dataset.cardId = key;
    card.createEl("div", { text: task.text, cls: "card-title" });
    const meta = card.createDiv({ cls: "card-meta" });
    meta.createEl("span", { text: task.filePath.split("/").pop() || "", cls: "card-tag" });
    card.addEventListener("click", async () => {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (file instanceof import_obsidian3.TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { eState: { line: task.line - 1 } });
      }
    });
    card.addEventListener("dragstart", (e) => {
      this.dragType = "task";
      this.dragId = key;
      this.dragBoardType = "task";
      card.addClass("card-dragging");
    });
    card.addEventListener("dragend", () => {
      this.resetDrag();
      card.removeClass("card-dragging");
    });
  }
  // ═══════════════════════════════════════════════════════
  // Drop Zone (with insert indicator)
  // ═══════════════════════════════════════════════════════
  setupCardDropZone(container, col, boardType) {
    container.addEventListener("dragover", (e) => {
      const isCard = this.dragType === "session" || this.dragType === "task";
      if (!isCard) return;
      e.preventDefault();
      container.addClass("drop-active");
      this.showInsertIndicator(container, e.clientY);
    });
    container.addEventListener("dragleave", (e) => {
      const related = e.relatedTarget;
      if (related && container.contains(related)) return;
      container.removeClass("drop-active");
      this.clearInsertIndicator(container);
    });
    container.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.removeClass("drop-active");
      const insertIdx = this.getInsertIndex(container, e.clientY);
      this.clearInsertIndicator(container);
      if (this.dragType === "session" && this.dragId) {
        const dragId = this.dragId;
        this.lastDroppedId = dragId;
        this.store.updateStatus(dragId, col.id);
        const newOrder = this.getCardIdsInColumn(container, dragId, insertIdx);
        this.store.setCardOrder(col.id, newOrder);
        this.resetDrag();
        setTimeout(() => {
          this.containerEl.querySelectorAll(".card-highlight").forEach((el) => el.removeClass("card-highlight"));
          if (this.lastDroppedId === dragId) this.lastDroppedId = null;
        }, 1500);
      } else if (this.dragType === "task" && this.dragId) {
        const dragId = this.dragId;
        this.resetDrag();
        this.lastDroppedId = dragId;
        this.store.setTaskColumn(dragId, col.id);
        const newOrder = this.getCardIdsInColumn(container, dragId, insertIdx);
        this.store.setCardOrder(col.id, newOrder);
        const task = this.tasks.find((t) => getTaskKey(t) === dragId);
        if (task) {
          await this.taskUpdater.updateTaskCompletion(task, col);
          this.tasks = await this.scanner.scanTasks();
          this.render();
          setTimeout(() => {
            this.containerEl.querySelectorAll(".card-highlight").forEach((el) => el.removeClass("card-highlight"));
            if (this.lastDroppedId === dragId) this.lastDroppedId = null;
          }, 1500);
        }
      }
    });
  }
  getInsertIndex(container, clientY) {
    const cards = Array.from(container.querySelectorAll(".kanban-card"));
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }
  getCardIdsInColumn(container, insertedId, insertIdx) {
    const existing = Array.from(container.querySelectorAll(".kanban-card")).map((el) => el.dataset.cardId).filter((id) => id !== insertedId);
    existing.splice(insertIdx, 0, insertedId);
    return existing;
  }
  showInsertIndicator(container, clientY) {
    this.clearInsertIndicator(container);
    const cards = Array.from(container.querySelectorAll(".kanban-card"));
    const indicator = document.createElement("div");
    indicator.className = "insert-indicator";
    let insertBefore = null;
    for (const card of cards) {
      if (clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2) {
        insertBefore = card;
        break;
      }
    }
    if (insertBefore) container.insertBefore(indicator, insertBefore);
    else container.appendChild(indicator);
  }
  clearInsertIndicator(container) {
    container.querySelectorAll(".insert-indicator").forEach((el) => el.remove());
  }
  clearColumnIndicators(board) {
    board.querySelectorAll(".column-drop-left, .column-drop-right").forEach((el) => {
      el.removeClass("column-drop-left");
      el.removeClass("column-drop-right");
    });
  }
  resetDrag() {
    this.dragType = null;
    this.dragId = null;
    this.dragBoardType = null;
    this.containerEl.querySelectorAll(".insert-indicator").forEach((el) => el.remove());
    this.containerEl.querySelectorAll(".drop-active").forEach((el) => el.removeClass("drop-active"));
    this.containerEl.querySelectorAll(".column-drop-left, .column-drop-right").forEach((el) => {
      el.removeClass("column-drop-left");
      el.removeClass("column-drop-right");
    });
    this.containerEl.querySelectorAll(".tab-drop-left, .tab-drop-right").forEach((el) => {
      el.removeClass("tab-drop-left");
      el.removeClass("tab-drop-right");
    });
  }
  // ═══════════════════════════════════════════════════════
  // Menu
  // ═══════════════════════════════════════════════════════
  showColumnMenu(e, type, col) {
    const menu = new import_obsidian3.Menu();
    menu.addItem(
      (item) => item.setTitle("Edit column").setIcon("pencil").onClick(() => {
        let hideCompletesTask = false;
        if (type === "task" && col.completesTask) {
          const doneCols = this.store.getColumns("task").filter((c) => c.completesTask);
          if (doneCols.length <= 1) hideCompletesTask = true;
        }
        new ColumnSettingsModal(
          this.app,
          col,
          type,
          hideCompletesTask,
          (updates) => this.store.updateColumn(type, col.id, updates)
        ).open();
      })
    );
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Delete column").setIcon("trash");
      let disabled = false;
      if (type === "task" && col.completesTask) {
        const doneCols = this.store.getColumns("task").filter((c) => c.completesTask);
        if (doneCols.length <= 1) disabled = true;
      }
      if (disabled) {
        item.setDisabled(true);
      } else {
        item.onClick(() => {
          this.store.removeColumn(type, col.id);
        });
      }
    });
    if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
  }
};

// src/settings.ts
var import_obsidian4 = require("obsidian");
var BrainBoardSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Brain Board Settings" });
    new import_obsidian4.Setting(containerEl).setName("Claude Directory Path").setDesc("The absolute path to your Claude Code directory. Use ~/ for home directory.").addText(
      (text) => text.setPlaceholder("~/.claude").setValue(this.plugin.settings.claudePath).onChange(async (value) => {
        this.plugin.settings.claudePath = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Task Search Directory").setDesc("The vault directory to scan for tasks. Leave empty to scan the entire vault.").addText(
      (text) => text.setPlaceholder("10_Journal").setValue(this.plugin.settings.taskDir).onChange(async (value) => {
        this.plugin.settings.taskDir = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Storage Directory").setDesc("The vault directory to store boards data (.obsidian/plugins/brain-board/data/ etc). Requires reload.").addText(
      (text) => text.setPlaceholder(".brain-board").setValue(this.plugin.settings.storageDir).onChange(async (value) => {
        this.plugin.settings.storageDir = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Reset Data").setDesc("\u5168\u3066\u306E\u30DC\u30FC\u30C9\u30C7\u30FC\u30BF\uFF08sessions.json\uFF09\u3092\u521D\u671F\u5316\u3057\u307E\u3059\u3002\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002").addButton(
      (btn) => btn.setButtonText("Reset").setWarning().onClick(() => {
        if (window.confirm("\u672C\u5F53\u306B\u5168\u3066\u306E\u30DC\u30FC\u30C9\u30C7\u30FC\u30BF\uFF08\u30EC\u30FC\u30F3\u8A2D\u5B9A\u3084\u30BF\u30B9\u30AF\u306E\u914D\u7F6E\u306A\u3069\uFF09\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3059\u304B\uFF1F\n\u203B\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002")) {
          this.plugin.sessionStore.reset();
          this.plugin.app.workspace.trigger("brain-board:sync");
        }
      })
    );
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  claudePath: "~/.claude",
  taskDir: "10_Journal",
  storageDir: ".brain-board"
};
var BrainBoardPlugin = class extends import_obsidian5.Plugin {
  async onload() {
    await this.loadSettings();
    this.claudeReader = new ClaudeReader(this.settings.claudePath);
    this.sessionStore = new SessionStore(this, this.settings.storageDir);
    this.addSettingTab(new BrainBoardSettingTab(this.app, this));
    this.registerView(
      BOARD_VIEW_TYPE,
      (leaf) => new BoardView(leaf, this, this.sessionStore)
    );
    this.addRibbonIcon("check-square", "Open Brain Board", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-board",
      name: "Open Brain Board",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "sync-sessions",
      name: "Sync Claude Sessions",
      callback: () => this.syncSessions()
    });
    this.registerEvent(
      this.app.workspace.on("brain-board:sync", () => {
        this.syncSessions();
      })
    );
    this.syncSessions();
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(BOARD_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.claudeReader = new ClaudeReader(this.settings.claudePath);
  }
  syncSessions() {
    const allSessions = this.claudeReader.getAllSessions();
    this.sessionStore.syncFromClaude(allSessions);
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(BOARD_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await rightLeaf.setViewState({ type: BOARD_VIEW_TYPE, active: true });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
};
