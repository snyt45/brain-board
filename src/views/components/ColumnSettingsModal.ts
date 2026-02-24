import { App, Modal, Setting } from "obsidian";
import { ColumnDef } from "../../models/Column";

const PRESET_COLORS = [
  "#868e96", "#e5a00d", "#2da44e", "#0969da",
  "#8250df", "#cf222e", "#d4a72c", "#57606a",
];

export class ColumnSettingsModal extends Modal {
  private col: ColumnDef;
  private onSave: (updates: Partial<ColumnDef>) => void;
  private label: string;
  private description: string;
  private color: string;
  private completesTask: boolean;
  private hideCompletesTask: boolean;

  constructor(app: App, col: ColumnDef, hideCompletesTask: boolean, onSave: (updates: Partial<ColumnDef>) => void) {
    super(app);
    this.col = col;
    this.onSave = onSave;
    this.label = col.label;
    this.description = col.description;
    this.color = col.color;
    this.completesTask = col.completesTask || false;
    this.hideCompletesTask = hideCompletesTask;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("column-settings-modal");

    contentEl.createEl("h3", { text: "Edit column" });

    new Setting(contentEl).setName("Label").addText((text) => {
      text.setValue(this.label).onChange((v) => { this.label = v; });
    });

    new Setting(contentEl).setName("Description").addText((text) => {
      text.setValue(this.description).setPlaceholder("Optional").onChange((v) => { this.description = v; });
    });

    // Color picker
    const colorSetting = new Setting(contentEl).setName("Color");
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

    // Done column toggle
    if (!this.hideCompletesTask) {
      new Setting(contentEl).setName("Done Column")
        .setDesc("Tasks dropped here will be marked as complete")
        .addToggle((toggle) => {
          toggle.setValue(this.completesTask).onChange((v) => { this.completesTask = v; });
        });
    }

    // Save button
    const footer = contentEl.createDiv({ cls: "modal-footer" });
    const saveBtn = footer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      this.onSave({
        label: this.label, description: this.description,
        color: this.color, completesTask: this.completesTask,
      });
      this.close();
    });
  }

  onClose(): void { this.contentEl.empty(); }
}
