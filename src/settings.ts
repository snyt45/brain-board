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
      .setName("Claude Directory Path")
      .setDesc("The absolute path to your Claude Code directory. Use ~/ for home directory.")
      .addText((text) =>
        text
          .setPlaceholder("~/.claude")
          .setValue(this.plugin.settings.claudePath)
          .onChange(async (value) => {
            this.plugin.settings.claudePath = value;
            await this.plugin.saveSettings();
          })
      );

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
          })
      );

    new Setting(containerEl)
      .setName("Storage Directory")
      .setDesc("The vault directory to store boards data (.obsidian/plugins/brain-board/data/ etc). Requires reload.")
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
      .setDesc("全てのボードデータ（sessions.json）を初期化します。操作は取り消せません。")
      .addButton((btn) => btn
        .setButtonText("Reset")
        .setWarning()
        .onClick(() => {
          if (window.confirm("本当に全てのボードデータ（レーン設定やタスクの配置など）をリセットしますか？\n※この操作は取り消せません。")) {
            this.plugin.sessionStore.reset();
            // Refresh view
            this.plugin.app.workspace.trigger("brain-board:sync");
          }
        })
      );
  }
}
