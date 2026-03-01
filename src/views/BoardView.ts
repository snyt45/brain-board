import { ItemView, WorkspaceLeaf, Menu, TFile, setIcon } from "obsidian";
import { SessionStore } from "../services/SessionStore";
import { TaskScanner } from "../services/TaskScanner";
import { TaskUpdater } from "../services/TaskUpdater";
import { IssueManager } from "../services/IssueManager";
import { ColumnSettingsModal } from "./components/ColumnSettingsModal";
import { IssueDrawer } from "./components/IssueDrawer";
import { VaultItem, getTaskKey } from "../models/Task";
import { ColumnDef, NO_STATUS_COLUMN } from "../models/Column";
import { InboxTriageModal } from "../modals/InboxTriageModal";
import { TaskArchiver } from "../services/TaskArchiver";
import { CardRenderer } from "../services/CardRenderer";
import type BrainBoardPlugin from "../../main";
import { UI_CONSTANTS, BOARD_CONSTANTS } from "../constants";

export const BOARD_VIEW_TYPE = "brain-board-view";

export class BoardView extends ItemView {
  private store: SessionStore;
  private scanner: TaskScanner;
  private taskUpdater: TaskUpdater;
  private plugin: BrainBoardPlugin;

  // View state
  private sortState: { field: "manual" | "created" | "modified"; dir: "desc" | "asc" } = { field: "manual", dir: "desc" };
  private showMetadata = true;
  private tasks: VaultItem[] = [];
  private unsubscribe: (() => void) | null = null;

  // Drag & drop state
  private dragType: "task" | "column" | null = null;
  private dragId: string | null = null;
  private lastDroppedId: string | null = null;

  // Selection state
  private selectedKeys = new Set<string>();
  private lastClickedKey: string | null = null;
  private isSelecting = false;
  private selectionStart: { x: number; y: number } | null = null;
  private selectionRectEl: HTMLElement | null = null;

  private issueManager: IssueManager;
  private issueDrawer!: IssueDrawer;

  constructor(leaf: WorkspaceLeaf, plugin: BrainBoardPlugin, store: SessionStore) {
    super(leaf);
    this.plugin = plugin;
    this.store = store;
    this.scanner = new TaskScanner(plugin);
    this.taskUpdater = new TaskUpdater(this.app, plugin);
    this.issueManager = new IssueManager(plugin);
  }

  getViewType(): string { return BOARD_VIEW_TYPE; }
  getDisplayText(): string { return "Brain Board"; }
  getIcon(): string { return "check-square"; }

  // ═══════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════

  async onOpen(): Promise<void> {
    this.issueDrawer = new IssueDrawer(this.app, this.containerEl, this.issueManager);
    this.unsubscribe = this.store.subscribe(() => this.render());
    await this.refresh();
    document.addEventListener("keydown", this.onKeyDown);
    this.registerEvent(
      this.app.workspace.on("brain-board:refresh" as any, () => this.refresh())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
         this.refresh();
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) this.unsubscribe();
    document.removeEventListener("keydown", this.onKeyDown);
  }

  async refresh(): Promise<void> {
    const pinnedFiles = this.store.getPinnedFilePaths();
    this.tasks = await this.scanner.scanTasks(pinnedFiles);
    this.store.syncTaskAssignments(this.tasks, this.store.getColumns());
    this.selectedKeys.clear();
    this.lastClickedKey = null;
    this.render();
  }

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;

    // Preserve scroll positions
    const scrollMap = new Map<string, number>();
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column") as HTMLElement;
      if (parent?.dataset.columnId) scrollMap.set(parent.dataset.columnId, el.scrollTop);
    });

    root.empty();
    root.addClass("board-root");

    // ── Controls ──
    this.renderControls(root);

    // ── Bulk Action Bar ──
    if (this.selectedKeys.size > 0) this.renderBulkActionBar(root);

    // ── Board ──
    const content = root.createDiv({ cls: "board-content" });
    this.renderBoard(content);

    // Restore scroll positions
    root.querySelectorAll(".kanban-cards").forEach((el) => {
      const parent = el.closest(".kanban-column") as HTMLElement;
      if (parent?.dataset.columnId && scrollMap.has(parent.dataset.columnId)) {
        el.scrollTop = scrollMap.get(parent.dataset.columnId)!;
      }
    });
  }

  private renderControls(root: HTMLElement): void {
    const controls = root.createDiv({ cls: "board-controls" });
    const state = this.sortState;

    const toggleSort = (field: "created" | "modified") => {
      if (state.field === field) {
        if (state.dir === "asc") state.dir = "desc";
        else { state.field = "manual"; state.dir = "desc"; }
      } else {
        state.field = field;
        state.dir = "asc";
      }
      this.render();
    };

    // Sort Controls
    const sortGroup = controls.createDiv({ cls: "board-sort-group" });
    const mkSortBtn = (field: "created" | "modified", iconName: string, tooltip: string) => {
      const btn = sortGroup.createEl("button", { cls: "board-control-icon-btn sort-btn" });
      if (state.field === field) btn.addClass("sort-active");
      
      const iconSpan = btn.createSpan({ cls: "sort-icon" });
      setIcon(iconSpan, iconName);
      
      if (state.field === field) {
        btn.createSpan({ text: state.dir === "desc" ? "↓" : "↑", cls: "sort-arrow" });
      }
      
      btn.setAttribute("aria-label", tooltip);
      btn.addEventListener("click", () => toggleSort(field));
    };
    
    mkSortBtn("created", "calendar", `Sort by Created Time`);
    mkSortBtn("modified", "clock", `Sort by Modified Time`);

    // View Options (Metadata toggle)
    const viewBtn = controls.createEl("button", { cls: "board-control-icon-btn" });
    setIcon(viewBtn, this.showMetadata ? "eye" : "eye-off");
    viewBtn.setAttribute("aria-label", this.showMetadata ? "Hide Metadata (Tags/Path)" : "Show Metadata (Tags/Path)");
    viewBtn.addEventListener("click", () => { this.showMetadata = !this.showMetadata; this.render(); });

    controls.createDiv({ cls: "board-control-spacer" });

    // Primary Action (Triage)
    const triageBtn = controls.createEl("button", {
      text: UI_CONSTANTS.BUTTON_TRIAGE,
      cls: "board-control-btn triage-trigger-btn"
    });
    const triageIcon = triageBtn.createSpan({ cls: "triage-btn-icon" });
    setIcon(triageIcon, "zap"); // Lucide icon

    triageBtn.addEventListener("click", () => {
      const inboxTasks = this.tasks.filter(t => {
          const key = getTaskKey(t);
          const col = this.store.getTaskColumn(key);
          return col === NO_STATUS_COLUMN.id || !col;
      });
      new InboxTriageModal(this.app, this.plugin, inboxTasks).open();
    });
  }

  // ═══════════════════════════════════════════════════════
  // Board
  // ═══════════════════════════════════════════════════════

  private renderBoard(container: HTMLElement): void {
    const board = container.createDiv({ cls: "kanban-board" });
    const columns = this.store.getColumns();
    const columnTasks = this.assignTasksToColumns(columns);

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      let orderedTasks = this.getOrderedTasks(columnTasks.get(col.id) || [], col.id);
      this.renderColumn(board, col, i, orderedTasks);
    }
    this.renderAddColumnBtn(board);
  }

  private getOrderedTasks(tasks: VaultItem[], colId: string): VaultItem[] {
    const order = this.store.getCardOrder(colId);
    let ordered = tasks;
    if (order) {
      const indexed = new Map(tasks.map(t => [getTaskKey(t), t]));
      ordered = [];
      for (const id of order) {
        const t = indexed.get(id);
        if (t) { ordered.push(t); indexed.delete(id); }
      }
      for (const t of indexed.values()) ordered.push(t);
    }

    const s = this.sortState;
    if (s.field === "created") ordered.sort((a, b) => s.dir === "desc" ? b.ctime - a.ctime : a.ctime - b.ctime);
    else if (s.field === "modified") ordered.sort((a, b) => s.dir === "desc" ? b.mtime - a.mtime : a.mtime - b.mtime);
    return ordered;
  }

  private assignTasksToColumns(columns: ColumnDef[]): Map<string, VaultItem[]> {
    const result = new Map<string, VaultItem[]>();
    for (const col of columns) result.set(col.id, []);

    const scanPeriod = this.plugin.settings.taskScanPeriod;
    const threshold = scanPeriod ? Date.now() - scanPeriod * 86400000 : 0;

    for (const task of this.tasks) {
      if (threshold > 0 && task.ctime <= threshold) continue;
      const key = getTaskKey(task);
      const assignedCol = this.store.getTaskColumn(key) || NO_STATUS_COLUMN.id;
      const bucket = result.get(assignedCol) || result.get(NO_STATUS_COLUMN.id)!;
      bucket.push(task);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════
  // Column
  // ═══════════════════════════════════════════════════════

  private renderColumn(board: HTMLElement, col: ColumnDef, index: number, tasks: VaultItem[]): void {
    const column = board.createDiv({ cls: "kanban-column" });
    column.dataset.columnId = col.id;
    column.dataset.columnIndex = String(index);
    const isSystemCol = col.id === NO_STATUS_COLUMN.id || col.id === BOARD_CONSTANTS.ARCHIVED_STATUS;

    // ── Header ──
    const header = column.createDiv({ cls: "kanban-column-header" });
    if (!isSystemCol) header.draggable = true;

    const headerMain = header.createDiv({ cls: "kanban-column-header-main" });
    const titleWrap = headerMain.createDiv({ cls: "kanban-column-title-wrap" });
    const dot = titleWrap.createEl("span", { cls: "kanban-color-dot" });
    dot.style.backgroundColor = col.color;
    titleWrap.createEl("span", { text: col.label, cls: "kanban-column-title" });

    const rightWrap = headerMain.createDiv({ cls: "kanban-column-right" });
    rightWrap.createEl("span", { text: String(tasks.length), cls: "kanban-column-count" });

    if (!isSystemCol) {
      const menuBtn = rightWrap.createEl("button", { text: "⋯", cls: "column-menu-btn" });
      menuBtn.addEventListener("click", (e) => { e.stopPropagation(); this.showColumnMenu(e, col); });

      header.addEventListener("dragstart", (e) => {
        this.dragType = "column"; this.dragId = col.id;
        header.addClass("column-dragging");
        e.dataTransfer?.setData("text/plain", col.id);
      });
      header.addEventListener("dragend", () => { this.resetDrag(); header.removeClass("column-dragging"); });
    }

    if (col.description) header.createDiv({ text: col.description, cls: "kanban-column-desc" });

    // ── Column D&D ──
    column.addEventListener("dragover", (e) => {
      if (this.dragType === "column" && this.dragId !== col.id && !isSystemCol) {
        e.preventDefault();
        this.clearColumnIndicators(board);
        const rect = column.getBoundingClientRect();
        column.addClass(e.clientX < rect.left + rect.width / 2 ? "column-drop-left" : "column-drop-right");
      }
    });
    column.addEventListener("dragleave", () => {
      column.removeClass("column-drop-left"); column.removeClass("column-drop-right");
    });
    column.addEventListener("drop", (e) => {
      if (this.dragType === "column" && this.dragId) {
        e.preventDefault(); e.stopPropagation();
        if (isSystemCol) { this.resetDrag(); return; }
        const cols = this.store.getColumns();
        const dragIdx = cols.findIndex(c => c.id === this.dragId);
        let targetIdx = index;
        const rect = column.getBoundingClientRect();
        if (e.clientX >= rect.left + rect.width / 2) targetIdx++;
        if (dragIdx < targetIdx) targetIdx--;
        if (dragIdx !== targetIdx && targetIdx >= 1) this.store.moveColumn(this.dragId, targetIdx);
        this.resetDrag();
      }
    });

    // ── Cards ──
    const cards = column.createDiv({ cls: "kanban-cards" });
    if (tasks.length === 0) {
      cards.createDiv({ cls: "kanban-empty-state", text: "Drop tasks here" });
    }
    this.setupCardDropZone(cards, col);
    this.setupLassoSelect(cards);
    for (const t of tasks) this.renderTaskCard(cards, t);
  }

  private renderAddColumnBtn(board: HTMLElement): void {
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
          this.store.addColumn({ id, label, description: "", color: "#868e96" });
        } else {
          this.render();
        }
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = ""; input.blur(); }
      });
      input.addEventListener("blur", commit);
    });
  }

  // ═══════════════════════════════════════════════════════
  // Cards
  // ═══════════════════════════════════════════════════════

  private formatDate = (ts: number): string => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "今日";
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  }

  private formatAge = (ms: number): string => {
    const d = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (d === 0) return "今日";
    return `${d}日前`;
  }

  private renderTaskCard(container: HTMLElement, task: VaultItem): void {
    const key = getTaskKey(task);
    const age = this.store.getTaskAge(key);
    
    const assignedCol = this.store.getTaskColumn(key);
    const colDef = this.store.getColumns().find(c => c.id === assignedCol);
    const isCompleted = colDef?.completesTask ?? false;
    
    const archiver = new TaskArchiver(this.app, this.plugin);
    const renderer = new CardRenderer(
        this.app, 
        this.plugin, 
        archiver, 
        this.lastDroppedId, 
        this.showMetadata, 
        this.formatDate, 
        this.formatAge
    );
    
    const card = renderer.render(container, task, age, isCompleted);
    
    card.addEventListener("click", (e) => this.handleCardClick(e, key));
    card.addEventListener("dragstart", (e) => { 
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        return;
      }
      this.dragType = "task"; 
      this.dragId = key; 
      card.addClass("card-dragging"); 
    });
    card.addEventListener("dragend", () => { this.resetDrag(); card.removeClass("card-dragging"); });
  }

  // ═══════════════════════════════════════════════════════
  // Selection
  // ═══════════════════════════════════════════════════════

  private handleCardClick(e: MouseEvent, key: string): void {
    if (e.shiftKey && this.lastClickedKey) {
      this.selectRange(this.lastClickedKey, key);
    } else if (e.metaKey || e.ctrlKey) {
      if (this.selectedKeys.has(key)) this.selectedKeys.delete(key);
      else this.selectedKeys.add(key);
    } else {
      if (this.selectedKeys.size > 0) { this.selectedKeys.clear(); }
      else { this.openDrawerForKey(key); return; }
    }
    this.lastClickedKey = key;
    this.updateSelectionVisuals();
  }

  private selectRange(fromKey: string, toKey: string): void {
    const allCards = Array.from(this.containerEl.querySelectorAll<HTMLElement>(".kanban-card[data-card-id]"));
    const keys = allCards.map(c => c.dataset.cardId!);
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    for (let i = start; i <= end; i++) this.selectedKeys.add(keys[i]);
  }

  private openDrawerForKey(key: string): void {
    const task = this.tasks.find(t => getTaskKey(t) === key);
    if (task) {
      this.issueDrawer.open({ 
        key, 
        title: task.text, 
        filePath: task.filePath, 
        line: task.line ?? 0 
      });
    }
  }

  private updateSelectionVisuals(): void {
    this.containerEl.querySelectorAll(".kanban-card").forEach((card) => {
      const el = card as HTMLElement;
      const id = el.dataset.cardId;
      if (id && this.selectedKeys.has(id)) el.addClass("card-selected");
      else el.removeClass("card-selected");
    });
    
    // Manage Bulk Action Bar visibility without full re-render
    const root = this.containerEl.children[1] as HTMLElement;
    const existingBar = root.querySelector(".bulk-action-bar");
    const controls = root.querySelector(".board-controls") as HTMLElement;
    
    if (this.selectedKeys.size > 0) {
        if (!existingBar) {
            const tempDiv = document.createElement("div");
            this.renderBulkActionBar(tempDiv);
            root.insertBefore(tempDiv.firstElementChild!, controls ? controls.nextSibling : root.firstChild);
        } else {
            const info = existingBar.querySelector(".bulk-info");
            if (info) info.textContent = `${this.selectedKeys.size} selected`;
        }
    } else {
        if (existingBar) existingBar.remove();
    }
  }

  private renderBulkActionBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "bulk-action-bar" });

    const info = bar.createDiv({ cls: "bulk-info" });
    info.textContent = `${this.selectedKeys.size} selected`;

    const cols = this.store.getColumns();
    const actions = bar.createDiv({ cls: "bulk-actions" });

    for (const col of cols) {
      const btn = actions.createEl("button", { text: `→ ${col.label}`, cls: "bulk-action-btn" });
      btn.addEventListener("click", async () => {
        for (const key of this.selectedKeys) {
          this.store.setTaskColumn(key, col.id);
          const task = this.tasks.find(t => getTaskKey(t) === key);
          if (task) await this.taskUpdater.updateTaskCompletion(task, col);
        }
        this.tasks = await this.scanner.scanTasks(this.store.getPinnedFilePaths());
        this.selectedKeys.clear();
        this.render();
      });
    }

    const closeBtn = bar.createEl("button", { text: "✕", cls: "bulk-close-btn" });
    closeBtn.addEventListener("click", () => { this.selectedKeys.clear(); this.render(); });
  }

  // ═══════════════════════════════════════════════════════
  // Lasso Selection
  // ═══════════════════════════════════════════════════════

  private setupLassoSelect(container: HTMLElement): void {
    container.addEventListener("mousedown", (e) => {
      // Allow marquee selection if started on background OR if Cmd/Ctrl is held
      if (e.target !== container && !e.metaKey && !e.ctrlKey) return;
      if (e.button !== 0) return;
      this.isSelecting = true;
      this.selectionStart = { x: e.clientX, y: e.clientY };
      this.selectedKeys.clear();

      const rect = document.createElement("div");
      rect.className = "selection-rect";
      document.body.appendChild(rect);
      this.selectionRectEl = rect;

      const onMouseMove = (me: MouseEvent) => {
        this.updateSelectionRect(me.clientX, me.clientY);
        this.selectCardsInRect();
      };
      const onMouseUp = () => {
        this.isSelecting = false;
        this.selectionRectEl?.remove();
        this.selectionRectEl = null;
        this.selectionStart = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (this.selectedKeys.size > 0) this.updateSelectionVisuals();
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  private updateSelectionRect(cx: number, cy: number): void {
    if (!this.selectionRectEl || !this.selectionStart) return;
    const s = this.selectionStart;
    Object.assign(this.selectionRectEl.style, {
      left: `${Math.min(s.x, cx)}px`, top: `${Math.min(s.y, cy)}px`,
      width: `${Math.abs(cx - s.x)}px`, height: `${Math.abs(cy - s.y)}px`,
    });
  }

  private selectCardsInRect(): void {
    if (!this.selectionRectEl) return;
    const sRect = this.selectionRectEl.getBoundingClientRect();
    this.selectedKeys.clear();
    this.containerEl.querySelectorAll<HTMLElement>(".kanban-card[data-card-id]").forEach((card) => {
      const r = card.getBoundingClientRect();
      if (r.right > sRect.left && r.left < sRect.right && r.bottom > sRect.top && r.top < sRect.bottom) {
        this.selectedKeys.add(card.dataset.cardId!);
        card.addClass("card-selected");
      } else {
        card.removeClass("card-selected");
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // Drop Zone
  // ═══════════════════════════════════════════════════════

  private setupCardDropZone(container: HTMLElement, col: ColumnDef): void {
    container.addEventListener("dragover", (e) => {
      if (this.dragType !== "task") return;
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

      if (this.dragType === "task" && this.dragId) {
        const dragIds = this.selectedKeys.has(this.dragId)
          ? Array.from(this.selectedKeys)
          : [this.dragId];
        const primaryDragId = this.dragId;

        this.lastDroppedId = primaryDragId;

        for (const key of dragIds) {
          this.store.setTaskColumn(key, col.id);
          const task = this.tasks.find(t => getTaskKey(t) === key);
          if (task) await this.taskUpdater.updateTaskCompletion(task, col);
        }

        let currentOrder = this.store.getCardOrder(col.id) || [];
        currentOrder = currentOrder.filter(id => !dragIds.includes(id));
        currentOrder.splice(insertIdx, 0, ...dragIds);
        this.store.setCardOrder(col.id, currentOrder);

        this.tasks = await this.scanner.scanTasks(this.store.getPinnedFilePaths());
        this.selectedKeys.clear();
        this.updateSelectionVisuals();
        this.sortState.field = "manual";
        this.render();

        setTimeout(() => {
          this.containerEl.querySelectorAll(".card-highlight").forEach(el => el.removeClass("card-highlight"));
          if (this.lastDroppedId === primaryDragId) this.lastDroppedId = null;
        }, 1500);
      }
    });
  }

  private getInsertIndex(container: HTMLElement, clientY: number): number {
    const cards = Array.from(container.querySelectorAll<HTMLElement>(".kanban-card"));
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  private getCardIdsInColumn(container: HTMLElement, insertedId: string, insertIdx: number): string[] {
    const existing = Array.from(container.querySelectorAll<HTMLElement>(".kanban-card"))
      .map(c => c.dataset.cardId!).filter(id => id !== insertedId);
    existing.splice(insertIdx, 0, insertedId);
    return existing;
  }

  private showInsertIndicator(container: HTMLElement, clientY: number): void {
    this.clearInsertIndicator(container);
    const indicator = document.createElement("div");
    indicator.className = "insert-indicator";
    const cards = Array.from(container.querySelectorAll<HTMLElement>(".kanban-card"));
    let inserted = false;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) { container.insertBefore(indicator, card); inserted = true; break; }
    }
    if (!inserted) container.appendChild(indicator);
  }

  private clearInsertIndicator(container: HTMLElement): void {
    container.querySelectorAll(".insert-indicator").forEach(el => el.remove());
  }

  private clearColumnIndicators(board: HTMLElement): void {
    board.querySelectorAll(".column-drop-left, .column-drop-right").forEach(el => {
      el.removeClass("column-drop-left"); el.removeClass("column-drop-right");
    });
  }

  private resetDrag(): void {
    this.dragType = null; this.dragId = null;
    this.containerEl.querySelectorAll(".insert-indicator").forEach(el => el.remove());
    this.containerEl.querySelectorAll(".drop-active").forEach(el => el.removeClass("drop-active"));
    this.containerEl.querySelectorAll(".column-drop-left, .column-drop-right").forEach(el => {
      el.removeClass("column-drop-left"); el.removeClass("column-drop-right");
    });
  }

  // ═══════════════════════════════════════════════════════
  // Keyboard
  // ═══════════════════════════════════════════════════════

  public onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.selectedKeys.size > 0) {
      this.selectedKeys.clear();
      this.updateSelectionVisuals();
    }
  };

  // ═══════════════════════════════════════════════════════
  // Menu
  // ═══════════════════════════════════════════════════════

  private showColumnMenu(e: Event, col: ColumnDef): void {
    const menu = new Menu();
    menu.addItem(item =>
      item.setTitle("Edit column").setIcon("pencil").onClick(() => {
        const completedCols = this.store.getColumns().filter(c => c.completesTask);
        const hideCompletesTask = col.completesTask && completedCols.length <= 1;
        new ColumnSettingsModal(this.app, col, !!hideCompletesTask, (updates) =>
          this.store.updateColumn(col.id, updates)
        ).open();
      })
    );
    menu.addSeparator();
    menu.addItem(item => {
      item.setTitle("Delete column").setIcon("trash");
      const doneCols = this.store.getColumns().filter(c => c.completesTask);
      if (col.completesTask && doneCols.length <= 1) {
        item.setDisabled(true);
      } else {
        item.onClick(() => this.store.removeColumn(col.id));
      }
    });
    if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
  }
}
