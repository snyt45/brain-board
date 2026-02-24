export interface VaultTask {
  text: string;
  completed: boolean;
  filePath: string;
  line: number;
  tags: string[];
  ctime: number;
  mtime: number;
}

// Stable key for a task (file path + text, not line number which shifts)
export function getTaskKey(t: VaultTask): string {
  return `${t.filePath}::${t.text}`;
}
