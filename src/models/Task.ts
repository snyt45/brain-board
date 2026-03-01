export interface VaultItem {
  type: "task" | "file";
  text: string;
  completed: boolean;
  filePath: string;
  line?: number;
  tags: string[];
  ctime: number;
  mtime: number;
}

// Stable key for a task (file path + text, not line number which shifts)
export function getTaskKey(t: VaultItem): string {
  if (t.type === "file") return t.filePath;
  return `${t.filePath}::${t.text}`;
}
