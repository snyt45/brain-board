import { Plugin } from "obsidian";
import { SessionStore } from "./src/services/SessionStore";
import { BoardView, BOARD_VIEW_TYPE } from "./src/views/BoardView";
import { BrainBoardSettingTab } from "./src/settings";

export interface BrainBoardSettings {
  taskSearchPaths: string;
  excludePaths: string;
  autoInboxPaths: string;
  statusProperty: string;
  storageDir: string;
  taskScanPeriod?: number;
}

const DEFAULT_SETTINGS: BrainBoardSettings = {
  taskSearchPaths: "10_Journal",
  excludePaths: "Templates",
  autoInboxPaths: "",
  statusProperty: "board-status",
  storageDir: ".brain-board",
  taskScanPeriod: 7,
};

export default class BrainBoardPlugin extends Plugin {
  public settings!: BrainBoardSettings;
  public sessionStore!: SessionStore;

  async onload(): Promise<void> {
    await this.loadSettings();

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
      callback: () => this.activateView(),
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(BOARD_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
