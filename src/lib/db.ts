import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import * as schema from './schema.ts';

const DB_PATH = join(process.cwd(), 'devpilot.db');

// 单例 sqlite 连接（better-sqlite3 是同步 API）
const sqlite = new Database(DB_PATH);

// WAL 模式提升并发读性能
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// 启动时同步建表（不用 drizzle-kit migrate，简单直接）
export function initDb(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      branch TEXT,
      last_active INTEGER
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      stage TEXT,
      nickname TEXT,
      avatar TEXT,
      status_text TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      source TEXT,
      started_at INTEGER,
      summary TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      tools_used TEXT,
      track_id TEXT REFERENCES tracks(id),
      git_branch TEXT,
      cwd TEXT
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT REFERENCES projects(id),
      track_id TEXT REFERENCES tracks(id),
      session_id TEXT REFERENCES sessions(id),
      title TEXT NOT NULL,
      reason TEXT,
      status TEXT,
      created_at INTEGER
    );

    -- P9 — Code Authorship Attribution: per-line AI/human 归因存储
    CREATE TABLE IF NOT EXISTS code_authorship (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT REFERENCES projects(id),
      file TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      session_id TEXT REFERENCES sessions(id),
      commit_sha TEXT,
      author TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 索引：支撑「打开文件页」「点击行显示来源」「lazy-refresh 新鲜度」三类查询
    CREATE INDEX IF NOT EXISTS idx_authorship_project_file ON code_authorship(project_id, file);
    CREATE INDEX IF NOT EXISTS idx_authorship_session ON code_authorship(session_id);
    CREATE INDEX IF NOT EXISTS idx_authorship_created ON code_authorship(created_at);
  `);

  const runMigrations = sqlite.transaction(() => {
    const trackCols = sqlite
      .prepare('PRAGMA table_info(tracks)')
      .all() as Array<{ name: string }>;
    const trackNames = new Set(trackCols.map((c) => c.name));
    const trackMigrations: Array<[string, string]> = [
      ['nickname', 'ALTER TABLE tracks ADD COLUMN nickname TEXT'],
      ['avatar', 'ALTER TABLE tracks ADD COLUMN avatar TEXT'],
      ['status_text', 'ALTER TABLE tracks ADD COLUMN status_text TEXT'],
    ];
    for (const [col, sql] of trackMigrations) {
      if (!trackNames.has(col)) sqlite.exec(sql);
    }

    const sessionCols = sqlite
      .prepare('PRAGMA table_info(sessions)')
      .all() as Array<{ name: string }>;
    const sessionNames = new Set(sessionCols.map((c) => c.name));
    const sessionMigrations: Array<[string, string]> = [
      ['now_doing', 'ALTER TABLE sessions ADD COLUMN now_doing TEXT'],
      ['duration', 'ALTER TABLE sessions ADD COLUMN duration INTEGER'],
      // P8 — Cost Attribution
      ['tokens_cache_read', 'ALTER TABLE sessions ADD COLUMN tokens_cache_read INTEGER'],
      ['tokens_cache_create', 'ALTER TABLE sessions ADD COLUMN tokens_cache_create INTEGER'],
      ['model', 'ALTER TABLE sessions ADD COLUMN model TEXT'],
      ['cost_usd', 'ALTER TABLE sessions ADD COLUMN cost_usd REAL'],
    ];
    for (const [col, sql] of sessionMigrations) {
      if (!sessionNames.has(col)) sqlite.exec(sql);
    }

    const projectCols = sqlite
      .prepare('PRAGMA table_info(projects)')
      .all() as Array<{ name: string }>;
    const projectNames = new Set(projectCols.map((c) => c.name));
    if (!projectNames.has('stage')) {
      sqlite.exec('ALTER TABLE projects ADD COLUMN stage TEXT');
    }
  });

  runMigrations();
}

// 模块加载时自动初始化
initDb();
