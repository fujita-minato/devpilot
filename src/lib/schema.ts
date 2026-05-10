import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),          // hash of path
  name: text('name').notNull(),
  path: text('path').notNull(),
  branch: text('branch'),
  lastActive: integer('last_active'),   // unix timestamp ms
  stage: text('stage'),                 // think|review|build|test|done
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),          // session UUID
  projectId: text('project_id').references(() => projects.id),
  source: text('source'),               // 'claude' | 'codex'
  startedAt: integer('started_at'),     // unix timestamp ms
  summary: text('summary'),             // from summary.md, free
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  tokensCacheRead: integer('tokens_cache_read'),     // P8: Claude cache-read tokens（价格远低于 input）
  tokensCacheCreate: integer('tokens_cache_create'), // P8: Claude cache-write 或 Codex reasoning
  toolsUsed: text('tools_used'),        // JSON array string
  trackId: text('track_id').references(() => tracks.id),
  gitBranch: text('git_branch'),
  cwd: text('cwd'),
  nowDoing: text('now_doing'),          // 当前 tool call 描述，hook 写入
  duration: integer('duration'),        // session 时长（秒），session 结束时写入
  model: text('model'),                 // P8: 具体模型 ID, 例 claude-sonnet-4-6 / gpt-5.4
  costUsd: real('cost_usd'),            // P8: 依定价表算出的 $；null = 未知模型或数据缺失
});

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  name: text('name').notNull(),         // inferred from branch name
  stage: text('stage'),                 // think|review|build|test|done
  nickname: text('nickname'),
  avatar: text('avatar'),
  statusText: text('status_text'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

export const decisions = sqliteTable('decisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').references(() => projects.id),
  trackId: text('track_id').references(() => tracks.id),
  sessionId: text('session_id').references(() => sessions.id),
  title: text('title').notNull(),
  reason: text('reason'),
  status: text('status'),               // accepted|proposed|deprecated
  createdAt: integer('created_at'),
});

// P9 — Code Authorship Attribution
// per-line 归因记录：每条 row 覆盖 [lineStart, lineEnd] 连续行
// mixed 叠加策略：同一行可由多条 row 描述（AI session + 后续 user commit），按 createdAt 决定最终归属
export const codeAuthorship = sqliteTable('code_authorship', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').references(() => projects.id),
  file: text('file').notNull(),                              // 相对 repo root，例 src/lib/x.ts
  lineStart: integer('line_start').notNull(),                // 1-based，对齐 git blame
  lineEnd: integer('line_end').notNull(),                    // 单行时 == lineStart
  sessionId: text('session_id').references(() => sessions.id), // user-authored 可为 null
  commitSha: text('commit_sha'),                             // git blame 命中的 commit SHA
  author: text('author').notNull(),                          // 'ai-claude' | 'ai-codex' | 'human' | 'mixed' | 'unknown'
  createdAt: integer('created_at').notNull(),                // Date.now() 写入时戳，支撑 lazy-refresh 新鲜度判断
});

export type CodeAuthorship = typeof codeAuthorship.$inferSelect;
export type NewCodeAuthorship = typeof codeAuthorship.$inferInsert;
