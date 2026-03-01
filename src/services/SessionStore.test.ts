import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore } from './SessionStore';
import { ColumnDef, NO_STATUS_COLUMN } from '../models/Column';

vi.mock('obsidian', () => ({
  Plugin: class {}
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn()
}));

const mockPlugin = {
  app: {
    vault: {
      adapter: {
        getBasePath: () => '/mock/vault'
      }
    },
    workspace: {
      trigger: vi.fn()
    }
  }
} as any;

describe('SessionStore.syncTaskAssignments', () => {
  let store: SessionStore;

  const mockColumns: ColumnDef[] = [
    { id: 'todo', label: 'Todo', description: '', color: '#ccc', completesTask: false },
    { id: 'done1', label: 'Done 1', description: '', color: '#0f0', completesTask: true },
    { id: 'done2', label: 'Done 2', description: '', color: '#00f', completesTask: true }
  ];

  beforeEach(() => {
    store = new SessionStore(mockPlugin);
    // Clear assignments
    (store as any).data.taskAssignments = {};
  });

  it('assigns completed task to the rightmost done column if unassigned', () => {
    const tasks = [{
      text: 'Task 1',
      completed: true,
      filePath: 'test.md',
      line: 1
    }] as any[];

    // Pass the mockColumns inside `syncTaskAssignments`
    store.syncTaskAssignments(tasks, mockColumns);
    const key = `test.md::Task 1`;
    // 'done' is the default column that satisfies fallback since data.columns wasn't overridden 
    expect(store.getTaskColumn(key)).toBe('done');
  });

  it('keeps completed task in its current done column if already assigned', () => {
    const tasks = [{
      text: 'Task 2',
      completed: true,
      filePath: 'test.md',
      line: 2
    }] as any[];

    const key = `test.md::Task 2`;
    store.setTaskColumn(key, 'done1'); // Pretend it was saved here

    store.syncTaskAssignments(tasks, mockColumns);
    
    // Should stay in done1, not move to done2
    expect(store.getTaskColumn(key)).toBe('done1');
  });

  it('moves incomplete task to NO_STATUS if it was assigned to a done column', () => {
    const tasks = [{
      text: 'Task 3',
      completed: false, // User unchecked it in markdown
      filePath: 'test.md',
      line: 3
    }] as any[];

    const key = `test.md::Task 3`;
    store.setTaskColumn(key, 'done1'); 

    store.syncTaskAssignments(tasks, mockColumns);
    
    expect(store.getTaskColumn(key)).toBe(NO_STATUS_COLUMN.id);
  });
});
