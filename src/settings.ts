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
    containerEl.createEl("h2", { text: "Brain Board 設定" });

    // 1. Task Tracking Settings
    containerEl.createEl("h3", { text: "タスク取得設定 (Task Data Sources)" });

    new Setting(containerEl)
      .setName("検索対象ディレクトリ (Search Paths)")
      .setDesc("タスク抽出の対象となるディレクトリパスをカンマ区切りで指定します。未指定の場合はVault全体がスキャン対象となります。指定ディレクトリ配下の全サブディレクトリも再帰的に含まれます。（例: 10_Journal, 20_Projects）")
      .addText((text) =>
        text
          .setPlaceholder("10_Journal")
          .setValue(this.plugin.settings.taskSearchPaths)
          .onChange(async (value) => {
            this.plugin.settings.taskSearchPaths = value;
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    new Setting(containerEl)
      .setName("スキャン対象期間 (Scan Period)")
      .setDesc("スキャン対象に含めるファイルの過去更新日数を指定します。未指定の場合は全ファイルを対象とします。")
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

    // 2. Note Tracking Settings
    containerEl.createEl("h3", { text: "ノートトラッキング設定 (Note Configuration)" });

    new Setting(containerEl)
      .setName("自動トラッキングディレクトリ (Auto-Track Paths)")
      .setDesc("指定されたディレクトリ内のノートは、ステータスプロパティの有無に関わらず、自動的にボードのインボックス（未分類）へ追加されます。（例: 50_Resources）")
      .addText((text) => 
        text
          .setPlaceholder("50_Resources")
          .setValue(this.plugin.settings.autoInboxPaths || "")
          .onChange(async (value) => {
            this.plugin.settings.autoInboxPaths = value;
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    new Setting(containerEl)
      .setName("ステータス管理プロパティ (Status Property Key)")
      .setDesc("ノートのボード内ステータスを追跡・保存するために使用されるYAMLフロントマターキーです。（デフォルト: board-status）")
      .addText((text) => 
        text
          .setPlaceholder("board-status")
          .setValue(this.plugin.settings.statusProperty || "board-status")
          .onChange(async (value) => {
            this.plugin.settings.statusProperty = value;
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    // 3. Excludes Settings
    containerEl.createEl("h3", { text: "共通除外ルール (Exclusion Rules)" });

    new Setting(containerEl)
      .setName("除外ディレクトリ (Exclude Paths)")
      .setDesc("スキャン対象から完全に除外するディレクトリパスをカンマ区切りで指定します。テンプレートやアーカイブ用ディレクトリを指定することで、ボード内のノイズを防ぎます。（例: Templates, Archive）")
      .addText((text) => 
        text
          .setPlaceholder("Templates, Archive")
          .setValue(this.plugin.settings.excludePaths || "")
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value;
            await this.plugin.saveSettings();
            this.plugin.app.workspace.trigger("brain-board:refresh");
          })
      );

    // 4. System Settings
    containerEl.createEl("h3", { text: "⚙️ システム設定" });

    new Setting(containerEl)
      .setName("データ保存ディレクトリ")
      .setDesc("ボードのレイアウトデータ（sessions.json）等を保存する隠しフォルダ。")
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
        .setButtonText("リセット")
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
