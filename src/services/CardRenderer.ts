import { App } from "obsidian";
import type { VaultItem } from "../models/Task";
import { getTaskKey } from "../models/Task";
import { TaskArchiver } from "./TaskArchiver";
import type BrainBoardPlugin from "../../main";
import { ColumnDef } from "../models/Column";

export class CardRenderer {
  constructor(
    private app: App, 
    private plugin: BrainBoardPlugin, 
    private taskArchiver: TaskArchiver,
    private lastDroppedId: string | null = null,
    private showMetadata: boolean = true,
    private formatDate: (ts: number) => string,
    private formatAge: (ms: number) => string
  ) {}

  public render(container: HTMLElement, task: VaultItem, age: number, isCompleted: boolean): HTMLElement {
    const key = getTaskKey(task);
    let ageClass = "age-fresh";
    
    // Only apply aging if the task is NOT completed
    if (!isCompleted) {
      if (age >= 5) ageClass = "age-old";
      else if (age >= 3) ageClass = "age-stale";
      else if (age >= 1) ageClass = "age-warm";
    }

    const typeClass = task.type === "file" ? "card-type-file" : "card-type-task";
    const highlightClass = key === this.lastDroppedId ? " card-highlight" : "";
    const completedClass = isCompleted ? " card-completed" : "";

    const cls = `kanban-card ${ageClass} ${typeClass}${completedClass}${highlightClass}`;
    const card = container.createDiv({ cls });
    card.draggable = true;
    card.dataset.cardId = key;

    card.createEl("div", { text: task.text, cls: "card-title" });

    if (this.showMetadata) {
      this.renderMetadata(card, task);
    }

    return card;
  }

  private renderMetadata(card: HTMLElement, task: VaultItem): void {
    const meta = card.createDiv({ cls: "card-meta" });
    
    const iconWrap = meta.createSpan({ cls: "card-type-badge" });
    if (task.type === "file") {
        iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    } else {
        iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
    }

    const parts = task.filePath.split("/");
    meta.createEl("span", { text: parts[parts.length - 1].replace(".md", ""), cls: "card-tag" });

    const info = card.createDiv({ cls: "card-info" });
    info.createEl("span", { text: this.formatDate(task.ctime), cls: "card-date" });
    info.createEl("span", { text: this.formatAge(Date.now() - task.ctime), cls: "card-date card-age" });
  }
}
