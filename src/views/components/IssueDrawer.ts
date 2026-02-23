import { App, Component, TFile, MarkdownRenderer, setIcon, Notice } from "obsidian";
import { IssueManager, IssueData } from "../../services/IssueManager";

export interface DrawerTarget {
  key: string;
  title: string;
  filePath?: string;
  line?: number;
  isClaude?: boolean;
  claudeContent?: string;
  projectId?: string;
}

export class IssueDrawer extends Component {
  private drawerEl: HTMLElement;
  private overlayEl: HTMLElement;
  private contentEl: HTMLElement;
  private currentTarget: DrawerTarget | null = null;
  private issueManager: IssueManager;
  private resizerEl: HTMLElement;

  constructor(
    private app: App,
    private containerEl: HTMLElement,
    issueManager: IssueManager
  ) {
    super();
    this.issueManager = issueManager;
    
    // Create overlay
    this.overlayEl = this.containerEl.createDiv({ cls: "issue-drawer-overlay" });
    this.overlayEl.addEventListener("click", () => this.close());
    
    // Create drawer
    this.drawerEl = this.containerEl.createDiv({ cls: "issue-drawer" });
    
    // Create resizer (left edge)
    this.resizerEl = this.drawerEl.createDiv({ cls: "issue-drawer-resizer" });
    this.setupResizer();
    
    // Header
    const header = this.drawerEl.createDiv({ cls: "issue-drawer-header" });
    const titleArea = header.createDiv({ cls: "issue-drawer-title-area" });
    titleArea.createEl("h2", { text: "Issue Detail", cls: "issue-drawer-title" });
    
    const closeBtn = header.createEl("button", { text: "✕", cls: "issue-drawer-close" });
    closeBtn.addEventListener("click", () => this.close());
    
    // Content layout
    this.contentEl = this.drawerEl.createDiv({ cls: "issue-drawer-content" });
  }

  private setupResizer() {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Mouse moves left -> drawer width increases
      const diff = startX - e.clientX;
      const newWidth = Math.max(360, Math.min(window.innerWidth * 0.9, startWidth + diff));
      this.drawerEl.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      isResizing = false;
      document.body.removeClass("is-resizing-ew");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    this.resizerEl.addEventListener("mousedown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.drawerEl.getBoundingClientRect().width;
      document.body.addClass("is-resizing-ew");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });
  }

  public open(target: DrawerTarget): void {
    this.currentTarget = target;
    this.renderInfo();
    
    this.overlayEl.addClass("is-visible");
    this.drawerEl.addClass("is-open");
  }

  public close(): void {
    this.overlayEl.removeClass("is-visible");
    this.drawerEl.removeClass("is-open");
    this.currentTarget = null;
  }

  private renderInfo(): void {
    if (!this.currentTarget) return;
    this.contentEl.empty();
    
    const { key, title, filePath, line, isClaude } = this.currentTarget;
    const issueData = this.issueManager.getIssue(key);
    
    // Meta Context Box
    const metaBox = this.contentEl.createDiv({ cls: "issue-meta-box" });
    metaBox.createEl("div", { text: title, cls: "issue-task-text" });
    
    if (filePath) {
      const fileLink = metaBox.createEl("button", { cls: "issue-task-file-link" });
      setIcon(fileLink.createSpan({ cls: "issue-link-icon" }), "link");
      fileLink.createSpan({ text: filePath.split("/").pop()! });
      
      fileLink.addEventListener("click", async () => {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file, { eState: { line: (line || 1) - 1 } });
          this.close(); // Optionally close the drawer when jumping to note
        }
      });
    } else if (isClaude) {
      // Create a nice link-like tag that attempts to open Claude if possible
      const claudeTag = metaBox.createEl("div", { cls: "issue-task-file-link claude-tag clickable" });
      setIcon(claudeTag.createSpan({ cls: "issue-link-icon" }), "external-link");
      claudeTag.createSpan({ text: "Open in Claude" });
      
      claudeTag.addEventListener("click", () => {
        // Unfortunately there is no documented deep link scheme (like claude://) 
        // to open a specific local project/session directly in the desktop app yet.
        // We can at least show a notice to the user or trigger an OS open on the folder.
        const path = require("path");
        const dir = filePath ? path.dirname(filePath) : "";
        
        // Use Electron's shell.openPath to open the project folder as a fallback
        if (dir) {
           const electron = require("electron");
           electron.shell.openPath(dir);
        } else {
           new Notice("Cannot determine Claude project folder path.");
        }
      });
    }

    // Markdown Editor Area / View
    const editorSection = this.contentEl.createDiv({ cls: "issue-editor-section" });
    const headerRow = editorSection.createDiv({ cls: "issue-editor-headerrow" });
    
    if (isClaude) {
      headerRow.createEl("h3", { text: "Session Transcript" });
      const container = editorSection.createDiv({ cls: "issue-editor-container" });
      const previewArea = container.createDiv({ cls: "issue-preview-area markdown-rendered" });
      previewArea.style.display = "block";
      
      const content = this.currentTarget.claudeContent || "No transcript available.";
      MarkdownRenderer.renderMarkdown(content, previewArea, "", this);
    } else {
      headerRow.createEl("h3", { text: "Timeline & Details" });
      const tabs = headerRow.createDiv({ cls: "issue-editor-tabs" });
      const writeBtn = tabs.createEl("button", { cls: "issue-tab-btn is-active", attr: { "aria-label": "Write" } });
      setIcon(writeBtn, "pencil");
      const previewBtn = tabs.createEl("button", { cls: "issue-tab-btn", attr: { "aria-label": "Preview" } });
      setIcon(previewBtn, "book-open");
      
      const container = editorSection.createDiv({ cls: "issue-editor-container" });
      const textarea = container.createEl("textarea", { cls: "issue-textarea" });
      const previewArea = container.createDiv({ cls: "issue-preview-area markdown-rendered", attr: { style: "display: none;" } });
      
      textarea.value = issueData.content;
      textarea.placeholder = "Write details, comments, or AI instructions here...\n(Markdown supported)";
      
      // Auto-save
      let timeout: NodeJS.Timeout;
      textarea.addEventListener("input", () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
           this.issueManager.saveIssue(key, textarea.value);
        }, 500);
      });

      // Tab switching
      writeBtn.addEventListener("click", () => {
        writeBtn.addClass("is-active");
        previewBtn.removeClass("is-active");
        textarea.style.display = "block";
        previewArea.style.display = "none";
      });

      previewBtn.addEventListener("click", async () => {
        previewBtn.addClass("is-active");
        writeBtn.removeClass("is-active");
        textarea.style.display = "none";
        previewArea.style.display = "block";
        previewArea.empty();
        if (textarea.value.trim().length === 0) {
          previewArea.createEl("span", { text: "Nothing to preview.", cls: "issue-empty-msg" });
        } else {
          await MarkdownRenderer.renderMarkdown(textarea.value, previewArea, "", this);
        }
      });
    }
  }
}
