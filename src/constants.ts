export const MARKDOWN_CONSTANTS = {
  TASK_UNCHECKED: "- [ ]",
  TASK_CHECKED: "- [x]",
  TASK_REGEX: /^(\s*)- \[([ x])\] (.+)$/i,
};

export const BOARD_CONSTANTS = {
  STATUS_PROPERTY: "board-status",
  ARCHIVED_STATUS: "archived",
};

export const UI_CONSTANTS = {
  SORT_CREATED: "Created",
  SORT_MODIFIED: "Updated",
  BUTTON_TRIAGE: "Focus Triage",
  BUTTON_HIDE_META: "Hide Metadata",
  BUTTON_SHOW_META: "Show Metadata",
  MODAL_TRIAGE_TITLE: "Focus Triage",
  MODAL_ALL_CAUGHT_UP: "Inbox Cleared",
  MODAL_ALL_CAUGHT_UP_DESC: "すべてのインボックスアイテムの処理が完了しました。",
  MODAL_CLOSE: "閉じる",
  BADGE_FILE: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  BADGE_TASK: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
};
