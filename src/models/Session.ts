export type SessionStatus = string;

export interface StoredSession {
  id: string;
  project: string;
  summary: string;
  created: string;
  modified: string;
  messageCount: number;
  gitBranch: string;
  status: SessionStatus;
  fullPath?: string;
}
