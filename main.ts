import { Plugin } from "obsidian";
import { ClaudeReader } from "./src/services/ClaudeReader";
import { SessionStore } from "./src/services/SessionStore";
import { BoardView, BOARD_VIEW_TYPE } from "./src/views/BoardView";
import { BrainBoardSettingTab } from "./src/settings";

export interface BrainBoardSettings {
  claudePath: string;
  taskDir: string;
  storageDir: string;
  taskScanPeriod?: number;
}

const DEFAULT_SETTINGS: BrainBoardSettings = {
  claudePath: "~/.claude",
  taskDir: "10_Journal",
  storageDir: ".brain-board",
  taskScanPeriod: 7,
};

export default class BrainBoardPlugin extends Plugin {
  public settings!: BrainBoardSettings;
  public claudeReader!: ClaudeReader;
  public sessionStore!: SessionStore;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.claudeReader = new ClaudeReader(this.settings.claudePath);
    this.sessionStore = new SessionStore(this, this.settings.storageDir);

    this.addSettingTab(new BrainBoardSettingTab(this.app, this));

    this.registerView(
      BOARD_VIEW_TYPE,
      (leaf) => new BoardView(leaf, this, this.sessionStore)
    );

    // Update icon to check-square
    this.addRibbonIcon("check-square", "Open Brain Board", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-board",
      name: "Open Brain Board",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "sync-sessions",
      name: "Sync Claude Sessions",
      callback: () => this.syncSessions(),
    });

    this.registerEvent(
      this.app.workspace.on("brain-board:sync" as any, () => {
        this.syncSessions();
      })
    );

    this.syncSessions();
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(BOARD_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Re-initialize reader if path changed
    this.claudeReader = new ClaudeReader(this.settings.claudePath);
  }

  private syncSessions(): void {
    const allSessions = this.claudeReader.getAllSessions();
    this.sessionStore.syncFromClaude(allSessions);
  }

  private async activateView(): Promise<void> {
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
}
