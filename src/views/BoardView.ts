import { ItemView, WorkspaceLeaf, Menu, TFile } from "obsidian";
import { SessionStore } from "../services/SessionStore";
import { TaskScanner } from "../services/TaskScanner";
import { TaskUpdater } from "../services/TaskUpdater";
import { ColumnSettingsModal } from "./components/ColumnSettingsModal";
import { StoredSession } from "../models/Session";
import { VaultTask, getTaskKey } from "../models/Task";
import { ColumnDef, NO_STATUS_COLUMN } from "../models/Column";
import type BrainBoardPlugin from "../../main";

export const BOARD_VIEW_TYPE = "brain-board-view";
type TabId = "claude" | "tasks";

export class BoardView extends ItemView {
  private store: SessionStore;
  private scanner: TaskScanner;
  private taskUpdater: TaskUpdater;
  private plugin: BrainBoardPlugin;
  private activeTab: TabId = "tasks";
  private tasks: VaultTask[] = [];
  private unsubscribe: (() => void) | null = null;

  // D&D state
  private dragType: "session" | "task" | "column" | "tab" | null = null;
  private dragId: string | null = null;
  private dragBoardType: "claude" | "task" | null = null;
  private lastDroppedId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: BrainBoardPlugin, store: SessionStore) {
    super(leaf);
    this.plugin = plugin;
    this.store = store;
    this.scanner = new TaskScanner(plugin);
    this.taskUpdater = new TaskUpdater(this.app);
  }

  getViewType(): string { return BOARD_VIEW_TYPE; }
  getDisplayText(): string { return "AI Kanban Board"; }
  getIcon(): string { return "check-square"; }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.store.subscribe(() => this.render());
    await this.refresh();

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        // Only refresh task board if a relevant file changes (to avoid aggressive reloading on Claude)
        // Check if file is inside the configured taskDir, or if taskDir is empty (meaning entire vault)
        const targetDir = this.plugin.settings.taskDir;
        if (!targetDir || file.path.startsWith(targetDir)) {
          if (this.activeTab === "tasks") {
            this.refresh();
          }
        }
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) this.unsubscribe();
  }

  async refresh(): Promise<void> {
    if (this.activeTab === "tasks") {
      this.tasks = await this.scanner.scanTasks();
      this.store.syncTaskAssignments(this.tasks, this.store.getColumns("task"));
    }
    this.render();
  }

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    
    // Save scroll positions before tear down
    const scrollMap = new Map<string, number>();
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column") as HTMLElement;
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

    // Restore scroll positions
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column") as HTMLElement;
      if (parent && parent.dataset.columnId && scrollMap.has(parent.dataset.columnId)) {
         el.scrollTop = scrollMap.get(parent.dataset.columnId)!;
      }
    });
  }

  private renderTab(container: HTMLElement, id: TabId, label: string): void {
    const active = this.activeTab === id;
    const tab = container.createEl("button", {
      text: label,
      cls: `board-tab${active ? " board-tab-active" : ""}`,
    });
    tab.addEventListener("click", async () => {
      if (this.activeTab !== id) { this.activeTab = id; await this.refresh(); }
    });

    tab.draggable = true;
    tab.dataset.tabId = id;

    tab.addEventListener("dragstart", (e) => {
      this.dragType = "tab";
      this.dragId = id;
      tab.addClass("tab-dragging");
      e.dataTransfer?.setData("text/plain", id);
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
        container.querySelectorAll(".tab-drop-left, .tab-drop-right").forEach(el => {
          el.removeClass("tab-drop-left"); el.removeClass("tab-drop-right");
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
          this.render(); // immediately reflect visual change
        }
        this.resetDrag();
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // Claude Board
  // ═══════════════════════════════════════════════════════

  private renderClaudeBoard(container: HTMLElement): void {
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

  private renderTaskBoard(container: HTMLElement): void {
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
          if (t) { orderedTasks.push(t); indexed.delete(id); }
        }
        for (const t of indexed.values()) orderedTasks.push(t); // append unassigned to bottom
      }
      this.renderColumn(board, col, i, "task", orderedTasks.length, (cards) => {
        for (const t of orderedTasks) this.renderTaskCard(cards, t);
      });
    }
    this.renderAddColumnBtn(board, "task");
  }

  private assignTasksToColumns(columns: ColumnDef[]): Map<string, VaultTask[]> {
    const result = new Map<string, VaultTask[]>();
    for (const col of columns) result.set(col.id, []);

    for (const task of this.tasks) {
      const key = getTaskKey(task);
      const assignedCol = this.store.getTaskColumn(key) || NO_STATUS_COLUMN.id;
      
      if (result.has(assignedCol)) {
        result.get(assignedCol)!.push(task);
      } else {
        result.get(NO_STATUS_COLUMN.id)!.push(task);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════
  // Column (shared)
  // ═══════════════════════════════════════════════════════

  private renderColumn(
    board: HTMLElement, col: ColumnDef, index: number,
    boardType: "claude" | "task", count: number,
    renderCards: (cardsEl: HTMLElement) => void
  ): void {
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
      const menuBtn = rightWrap.createEl("button", { text: "⋯", cls: "column-menu-btn" });
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showColumnMenu(e, boardType, col);
      });

      header.addEventListener("dragstart", (e) => {
        this.dragType = "column"; this.dragId = col.id; this.dragBoardType = boardType;
        header.addClass("column-dragging");
        e.dataTransfer?.setData("text/plain", col.id);
      });
      header.addEventListener("dragend", () => {
        this.resetDrag(); header.removeClass("column-dragging");
      });
    }

    if (col.description) {
      header.createDiv({ text: col.description, cls: "kanban-column-desc" });
    }

    // Drop on column header/body (reordering columns)
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
      column.removeClass("column-drop-left"); column.removeClass("column-drop-right");
    });

    column.addEventListener("drop", (e) => {
      if (this.dragType === "column" && this.dragId && this.dragBoardType === boardType) {
        e.preventDefault(); e.stopPropagation();
        if (isSystemCol) { this.resetDrag(); return; }

        const rect = column.getBoundingClientRect();
        const cols = this.store.getColumns(boardType);
        const dragIdx = cols.findIndex((c) => c.id === this.dragId);
        let targetIdx = index;
        if (e.clientX >= rect.left + rect.width / 2) targetIdx++;
        if (dragIdx < targetIdx) targetIdx--;
        if (dragIdx !== targetIdx && targetIdx >= 1) { // 1 to preserve NO_STATUS at 0
          this.store.moveColumn(boardType, this.dragId, targetIdx);
        }
        this.resetDrag();
      }
    });

    const cards = column.createDiv({ cls: "kanban-cards" });
    this.setupCardDropZone(cards, col, boardType);
    renderCards(cards);
  }

  private renderAddColumnBtn(board: HTMLElement, type: "claude" | "task"): void {
    const addCol = board.createDiv({ cls: "kanban-add-column" });
    const addBtn = addCol.createEl("button", { text: "+ Column", cls: "add-column-btn" });
    addBtn.addEventListener("click", () => {
      addCol.empty();
      const input = addCol.createEl("input", { cls: "column-name-input" });
      input.type = "text"; input.placeholder = "Column name"; input.focus();

      const commit = () => {
        const label = input.value.trim();
        if (label) {
          const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36);
          this.store.addColumn(type, { id, label, description: "", color: "#868e96" });
        } else {
          this.render(); // Redraw button
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur(); // Trigger commit via blur
        }
        if (e.key === "Escape") {
          input.value = ""; // Clear so it doesn't commit
          input.blur();
        }
      });
      input.addEventListener("blur", commit);
    });
  }

  // ═══════════════════════════════════════════════════════
  // Cards
  // ═══════════════════════════════════════════════════════

  private renderSessionCard(container: HTMLElement, session: StoredSession): void {
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
      cls: "card-date",
    });
    info.createEl("span", { text: `${session.messageCount} msgs`, cls: "card-date" });

    card.addEventListener("dragstart", (e) => {
      this.dragType = "session"; this.dragId = session.id; card.addClass("card-dragging");
    });
    card.addEventListener("dragend", () => { this.resetDrag(); card.removeClass("card-dragging"); });
  }

  private renderTaskCard(container: HTMLElement, task: VaultTask): void {
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
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { eState: { line: task.line - 1 } });
      }
    });

    card.addEventListener("dragstart", (e) => {
      this.dragType = "task"; this.dragId = key; this.dragBoardType = "task";
      card.addClass("card-dragging");
    });
    card.addEventListener("dragend", () => { this.resetDrag(); card.removeClass("card-dragging"); });
  }

  // ═══════════════════════════════════════════════════════
  // Drop Zone (with insert indicator)
  // ═══════════════════════════════════════════════════════

  private setupCardDropZone(container: HTMLElement, col: ColumnDef, boardType: "claude" | "task"): void {
    container.addEventListener("dragover", (e) => {
      const isCard = this.dragType === "session" || this.dragType === "task";
      if (!isCard) return;
      e.preventDefault();
      container.addClass("drop-active");
      this.showInsertIndicator(container, e.clientY);
    });

    container.addEventListener("dragleave", (e) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related && container.contains(related)) return;
      container.removeClass("drop-active");
      this.clearInsertIndicator(container);
    });

    container.addEventListener("drop", async (e) => {
      e.preventDefault(); e.stopPropagation();
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
          this.containerEl.querySelectorAll(".card-highlight").forEach(el => el.removeClass("card-highlight"));
          if (this.lastDroppedId === dragId) this.lastDroppedId = null;
        }, 1500);
      } else if (this.dragType === "task" && this.dragId) {
        const dragId = this.dragId; // capture logic before reset
        this.resetDrag(); // immediately reset ui
        this.lastDroppedId = dragId;

        this.store.setTaskColumn(dragId, col.id);
        const newOrder = this.getCardIdsInColumn(container, dragId, insertIdx);
        this.store.setCardOrder(col.id, newOrder);

        const task = this.tasks.find((t) => getTaskKey(t) === dragId);
        if (task) {
          await this.taskUpdater.updateTaskCompletion(task, col);
          // Wait briefly, then re-scan purely to get new text states if needed
          this.tasks = await this.scanner.scanTasks();
          this.render(); // View relies on tasks array state, redraw

          // Remove highlight after 1.5s
          setTimeout(() => {
            this.containerEl.querySelectorAll(".card-highlight").forEach(el => el.removeClass("card-highlight"));
            if (this.lastDroppedId === dragId) this.lastDroppedId = null;
          }, 1500);
        }
      }
    });
  }

  private getInsertIndex(container: HTMLElement, clientY: number): number {
    const cards = Array.from(container.querySelectorAll(".kanban-card")) as HTMLElement[];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  private getCardIdsInColumn(container: HTMLElement, insertedId: string, insertIdx: number): string[] {
    const existing = Array.from(container.querySelectorAll(".kanban-card"))
      .map((el) => (el as HTMLElement).dataset.cardId!)
      .filter((id) => id !== insertedId);
    existing.splice(insertIdx, 0, insertedId);
    return existing;
  }

  private showInsertIndicator(container: HTMLElement, clientY: number): void {
    this.clearInsertIndicator(container);
    const cards = Array.from(container.querySelectorAll(".kanban-card")) as HTMLElement[];
    const indicator = document.createElement("div");
    indicator.className = "insert-indicator";

    let insertBefore: HTMLElement | null = null;
    for (const card of cards) {
      if (clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2) {
        insertBefore = card; break;
      }
    }
    if (insertBefore) container.insertBefore(indicator, insertBefore);
    else container.appendChild(indicator);
  }

  private clearInsertIndicator(container: HTMLElement): void {
    container.querySelectorAll(".insert-indicator").forEach((el) => el.remove());
  }

  private clearColumnIndicators(board: HTMLElement): void {
    board.querySelectorAll(".column-drop-left, .column-drop-right").forEach((el) => {
      el.removeClass("column-drop-left"); el.removeClass("column-drop-right");
    });
  }

  private resetDrag(): void {
    this.dragType = null; this.dragId = null; this.dragBoardType = null;
    this.containerEl.querySelectorAll(".insert-indicator").forEach((el) => el.remove());
    this.containerEl.querySelectorAll(".drop-active").forEach((el) => el.removeClass("drop-active"));
    this.containerEl.querySelectorAll(".column-drop-left, .column-drop-right").forEach((el) => {
      el.removeClass("column-drop-left"); el.removeClass("column-drop-right");
    });
    this.containerEl.querySelectorAll(".tab-drop-left, .tab-drop-right").forEach((el) => {
      el.removeClass("tab-drop-left"); el.removeClass("tab-drop-right");
    });
  }

  // ═══════════════════════════════════════════════════════
  // Menu
  // ═══════════════════════════════════════════════════════

  private showColumnMenu(e: Event, type: "claude" | "task", col: ColumnDef): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("Edit column").setIcon("pencil").onClick(() => {
        // Enforce at least 1 done column if this is the ONLY done column currently
        let hideCompletesTask = false;
        if (type === "task" && col.completesTask) {
          const doneCols = this.store.getColumns("task").filter(c => c.completesTask);
          if (doneCols.length <= 1) hideCompletesTask = true; 
        }

        new ColumnSettingsModal(
          this.app, col, type, hideCompletesTask,
          (updates) => this.store.updateColumn(type, col.id, updates)
        ).open();
      })
    );
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Delete column").setIcon("trash");
      // Prevent deleting the only done column
      let disabled = false;
      if (type === "task" && col.completesTask) {
        const doneCols = this.store.getColumns("task").filter(c => c.completesTask);
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
}
