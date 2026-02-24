import { App, PluginSettingTab, Setting } from "obsidian";
import type BrainBoardPlugin from "../main";

export class BrainBoardSettingTab extends PluginSettingTab {
  private plugin: BrainBoardPlugin;

  constructor(app: App, plugin: BrainBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Brain Board Settings" });

    new Setting(containerEl)
      .setName("Task Search Directory")
      .setDesc("The vault directory to scan for tasks. Leave empty to scan the entire vault.")
      .addText((text) =>
        text
          .setPlaceholder("10_Journal")
          .setValue(this.plugin.settings.taskDir)
          .onChange(async (value) => {
            this.plugin.settings.taskDir = value;
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    new Setting(containerEl)
      .setName("Task Scan Period (days)")
      .setDesc("Number of past days to scan for tasks. Leave empty to scan all files.")
      .addText((text) =>
        text
          .setPlaceholder("7")
          .setValue(this.plugin.settings.taskScanPeriod?.toString() ?? "")
          .onChange(async (value) => {
            if (value.trim() === "") {
              this.plugin.settings.taskScanPeriod = undefined as any;
            } else {
              const parsed = parseInt(value, 10);
              if (!isNaN(parsed) && parsed > 0) {
                 this.plugin.settings.taskScanPeriod = parsed;
              }
            }
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    new Setting(containerEl)
      .setName("Storage Directory")
      .setDesc("The vault directory to store boards data. Requires reload.")
      .addText((text) =>
        text
          .setPlaceholder(".brain-board")
          .setValue(this.plugin.settings.storageDir)
          .onChange(async (value) => {
            this.plugin.settings.storageDir = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reset Data")
      .setDesc("全てのボードデータを初期化します。操作は取り消せません。")
      .addButton((btn) => btn
        .setButtonText("Reset")
        .setWarning()
        .onClick(() => {
          if (window.confirm("本当に全てのボードデータ（レーン設定やタスクの配置など）をリセットしますか？\n※この操作は取り消せません。")) {
            this.plugin.sessionStore.reset();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          }
        })
      );
  }
}
