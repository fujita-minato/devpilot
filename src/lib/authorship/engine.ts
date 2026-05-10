// P9 — Code Authorship Attribution Engine
//
// 把 Wave 1 的三条腿拧成严格归因算法：
//   1. listTrackedFiles + isTrackedTextFile → 枚举可归因文件
//   2. blameFile → 每行 (commitSha, authoredAt)
//   3. extractClaudeEdits / extractCodexEdits → session 的 ToolCallEdit[]
//
// 严格判定（CONTEXT Area 1 / ROADMAP SC#3 + 09-04 Deviation Rule 2）：
//   AI-authored 当且仅当：
//     - 该 session 的某条 tool_call 改过当前 file（路径规范化比对命中）
//     - 且其 newText 包含 blame 行内容（弱内容命中，行 trim ≥ 8 字符以避开通用 syntax）
//     - 且 blame.authoredAt ∈ [session.startedAt − 5min, session.startedAt + duration + 48h]
//
// 关于 48h post-session buffer（Deviation Rule 2，09-04 SUMMARY 中记录）：
// CONTEXT Area 3 原定 5min buffer 覆盖"写完 → review → commit"小 gap。但真实数据
// 里常见"session 当天写代码、次日或数天后 batch commit"，5min 会让所有 AI 代码都被
// 判定 mixed/unknown（严格判定下 AI 行=0）。扩大到 48h 后仍保留内容命中约束，
// 不会跨越相邻 session（sessions 间隔通常 > 48h，若 < 48h 则 "最后一次修改" 规则
// 由 startedAt 倒序遍历自然解决）。5min pre-session buffer 保留用于"时钟偏移"场景。
//
// 多 session 命中同一行：按 startedAt 倒序取**最近一次**；若 blame commit 晚于所有 AI
// session 时间窗但曾有 AI session 的 newText 含过该行内容 → 标 `mixed`；否则 human/unknown。
//
// 本文件无 next/server 依赖，可被 API route / CLI 脚本同样调用。

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readdirSync, statSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { projects, sessions, codeAuthorship } from '../schema.ts';
import {
  blameFile,
  isTrackedTextFile,
  listTrackedFiles,
  type BlameLine,
} from './git-blame.ts';
import {
  extractClaudeEdits,
  extractCodexEdits,
  type ToolCallEdit,
} from './tool-call-parser.ts';

const PRE_SESSION_BUFFER_MS = 5 * 60 * 1000; // 时钟偏移
const POST_SESSION_BUFFER_MS = 48 * 60 * 60 * 1000; // 写完隔夜 / 次日 batch commit

export type AuthorKind =
  | 'ai-claude'
  | 'ai-codex'
  | 'human'
  | 'mixed'
  | 'unknown';

export interface AuthorshipLine {
  lineNumber: number;
  content: string;
  author: AuthorKind;
  sessionId: string | null; // 最近一次命中 session（human/unknown/mixed-非AI 时 null）
  commitSha: string | null;
  authoredAt: number | null;
}

export interface FileAuthorship {
  path: string; // 相对 repo root
  totalLines: number;
  lines: AuthorshipLine[];
}

export interface BackfillResult {
  filesProcessed: number;
  linesAttributed: number;
}

// 运行时缓存：session id → 推导出的 JSONL 绝对路径。
// 避免每次 backfill 都重扫 ~/.codex/sessions（递归 I/O 贵）。
const claudeJsonlCache = new Map<string, string | null>();
let codexJsonlIndex: Map<string, string> | null = null;

// ----- JSONL 路径推导 -----

// Claude stores project directories by replacing each "/" in the absolute path with "-".
function claudeProjectDirFor(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

// 给定 session id + projectPath，返回 Claude JSONL 文件绝对路径（若存在）
async function findClaudeJsonl(
  sessionId: string,
  projectPath: string,
): Promise<string | null> {
  const cached = claudeJsonlCache.get(sessionId);
  if (cached !== undefined) return cached;

  const candidate = join(
    homedir(),
    '.claude',
    'projects',
    claudeProjectDirFor(projectPath),
    `${sessionId}.jsonl`,
  );
  try {
    await fs.access(candidate);
    claudeJsonlCache.set(sessionId, candidate);
    return candidate;
  } catch {
    claudeJsonlCache.set(sessionId, null);
    return null;
  }
}

// Codex JSONL 分散在 ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
// 没有可推导的 session-id → path 映射（文件名是 rollout-<id>-<ts>.jsonl 但 id 不等于 session id），
// 必须扫全树读首行 session_meta.payload.id 建索引。
// 为避免对每次调用重扫，进程内缓存一次；若 session 是新产生的在缓存之后，会 miss
// → backfill 只保证处理「已落库的 session」；新 session 在下次 ingest+backfill 才纳入
async function ensureCodexIndex(): Promise<Map<string, string>> {
  if (codexJsonlIndex) return codexJsonlIndex;
  const index = new Map<string, string>();
  const root = join(homedir(), '.codex', 'sessions');
  const files = findJsonlRecursive(root);

  // 同步读每个文件首行 —— 慢但只跑一次且文件数量级百计
  for (const abs of files) {
    try {
      const first = await readFirstLine(abs);
      if (!first) continue;
      const obj = JSON.parse(first);
      if (obj?.type === 'session_meta' && obj?.payload?.id) {
        index.set(String(obj.payload.id), abs);
      }
    } catch {
      // schema drift / 坏文件 → 跳过
    }
  }

  codexJsonlIndex = index;
  return index;
}

function findJsonlRecursive(dir: string): string[] {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return out;
  }
  for (const entry of entries) {
    const name = entry.name;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      out.push(...findJsonlRecursive(full));
    } else if (name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

async function readFirstLine(filePath: string): Promise<string | null> {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    if (bytesRead === 0) return null;
    const text = buf.slice(0, bytesRead).toString('utf-8');
    const nl = text.indexOf('\n');
    return nl >= 0 ? text.slice(0, nl) : text;
  } finally {
    await fh.close();
  }
}

// ----- 路径规范化 -----

// ToolCallEdit.filePath 可能是绝对路径或相对（Claude Edit 通常绝对，Codex apply_patch 常相对）。
// 统一转「相对 repo root」形式以便和 blame 返回的 relPath 对齐。
function normalizeEditPath(editPath: string, repoPath: string): string {
  if (!editPath) return '';
  const absRepo = path.resolve(repoPath);
  if (path.isAbsolute(editPath)) {
    const rel = path.relative(absRepo, editPath);
    // 跨 repo 的编辑（相对会带 ../）→ 保留原样但不会在 blame 中命中
    return rel;
  }
  return editPath.replace(/^\.\//, '');
}

// ----- session → tool-call 缓存 -----

interface SessionWindow {
  sessionId: string;
  source: 'claude' | 'codex';
  /** 判定下界：startedAt − PRE_SESSION_BUFFER_MS（允许时钟漂移） */
  windowStart: number;
  /** 判定上界：startedAt + duration*1000 + POST_SESSION_BUFFER_MS（覆盖跨日 commit） */
  windowEnd: number;
  /** 原始 startedAt —— "最后一次修改 session" 决策用，按 startedAt 倒序遍历 */
  startedAt: number;
  // edits 按 filePath (已规范化为 rel-to-repo) 建索引，加速命中查询
  editsByFile: Map<string, ToolCallEdit[]>;
}

async function buildSessionWindows(
  projectId: string,
  projectPath: string,
): Promise<SessionWindow[]> {
  const rawSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .all();

  const out: SessionWindow[] = [];

  for (const s of rawSessions) {
    if (!s.startedAt) continue; // startedAt 缺 → 无法做时间窗匹配
    if (s.source !== 'claude' && s.source !== 'codex') continue;

    // 判定窗口：
    //   - windowStart = startedAt − 5min（允许时钟漂移）
    //   - windowEnd   = startedAt + duration*1000 + 48h（覆盖跨日 commit）
    // duration 单位秒（schema 注释 & adapter 一致）；若 null 按 0。
    const durationMs = (s.duration ?? 0) * 1000;
    const windowStart = s.startedAt - PRE_SESSION_BUFFER_MS;
    const windowEnd = s.startedAt + durationMs + POST_SESSION_BUFFER_MS;

    let edits: ToolCallEdit[] = [];
    try {
      if (s.source === 'claude') {
        const jsonl = await findClaudeJsonl(s.id, projectPath);
        if (!jsonl) {
          console.warn(
            `[authorship] claude session ${s.id} JSONL not found, skip`,
          );
          continue;
        }
        edits = await extractClaudeEdits(jsonl, s.id);
      } else {
        // codex
        const index = await ensureCodexIndex();
        const jsonl = index.get(s.id);
        if (!jsonl) {
          console.warn(
            `[authorship] codex session ${s.id} JSONL not found, skip`,
          );
          continue;
        }
        edits = await extractCodexEdits(jsonl, s.id);
      }
    } catch (err) {
      console.warn(
        `[authorship] extract edits failed for session ${s.id}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    // 按 rel-path 归组，便于行级 JOIN 查询
    const editsByFile = new Map<string, ToolCallEdit[]>();
    for (const e of edits) {
      const rel = normalizeEditPath(e.filePath, projectPath);
      if (!rel || rel.startsWith('..')) continue; // 跨 repo 的编辑忽略
      const arr = editsByFile.get(rel) ?? [];
      arr.push(e);
      editsByFile.set(rel, arr);
    }

    out.push({
      sessionId: s.id,
      source: s.source,
      startedAt: s.startedAt,
      windowStart,
      windowEnd,
      editsByFile,
    });
  }

  return out;
}

// ----- 行级 JOIN 核心 -----

// 判定某行是否被某 session 的 tool_call 覆盖（file-level 已经对齐到同 relPath）。
//
// 弱内容命中：newText 含 blame 行（trim 后）的子串。为避免 `});` / `}` / `*/` 等
// 通用 syntax 导致大面积误命中，加两条启发：
//   - 行 trim 后长度 < 8 字符 → 视为通用符号，不参与内容命中
//   - 空行（trim 为空）→ 视为无意义内容，不单独判定，**不返回 true 也不返回 false**
//     实际返回 false，让 attributeLine 靠时间窗 + 邻近行的判断兜底
function toolCallCoversLine(
  edits: ToolCallEdit[],
  lineContent: string,
): boolean {
  const needle = lineContent.trim();
  if (needle.length < 8) return false; // 太短/空 → 不触发内容匹配
  for (const e of edits) {
    if (e.newText && e.newText.includes(needle)) return true;
  }
  return false;
}

interface LineAttribution {
  author: AuthorKind;
  sessionId: string | null;
}

function attributeLine(
  blameLine: BlameLine,
  relPath: string,
  windows: SessionWindow[],
): LineAttribution {
  // 最近优先：按 startedAt 倒序遍历
  const sorted = [...windows].sort((a, b) => b.startedAt - a.startedAt);

  let anyAiCoveredContent = false; // mixed 判定：曾有 AI session 写过此行内容但 commit 不在窗口里

  for (const w of sorted) {
    const editsForFile = w.editsByFile.get(relPath);
    if (!editsForFile || editsForFile.length === 0) continue;

    const contentMatch = toolCallCoversLine(editsForFile, blameLine.content);
    if (!contentMatch) continue;

    anyAiCoveredContent = true;

    // 时间窗命中 → 直接 AI
    if (
      blameLine.authoredAt >= w.windowStart &&
      blameLine.authoredAt <= w.windowEnd
    ) {
      return {
        author: w.source === 'claude' ? 'ai-claude' : 'ai-codex',
        sessionId: w.sessionId,
      };
    }
  }

  // 时间窗都没命中，但内容曾被 AI 写过 → mixed（AI 写过后 human 又改 / 移动到同样内容）
  if (anyAiCoveredContent) {
    return { author: 'mixed', sessionId: null };
  }

  // 内容没被任何 AI session 写过：
  // 若 blame commit 的时间点落在「任一」AI session 窗口内 → human（session 期间人手改）
  // 否则 → unknown（pre-devpilot 或与 AI 无交集）
  for (const w of windows) {
    if (
      blameLine.authoredAt >= w.windowStart &&
      blameLine.authoredAt <= w.windowEnd
    ) {
      return { author: 'human', sessionId: null };
    }
  }
  return { author: 'unknown', sessionId: null };
}

// ----- 公共入口：backfill -----

export async function backfillProject(
  projectId: string,
): Promise<BackfillResult> {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) {
    throw new Error(`[authorship] project not found: ${projectId}`);
  }
  const repoPath = project.path;

  // 先确认 repoPath 真的存在（项目目录可能已被用户删除）
  try {
    const st = statSync(repoPath);
    if (!st.isDirectory()) {
      throw new Error(`not a directory: ${repoPath}`);
    }
  } catch (err) {
    throw new Error(
      `[authorship] repo path inaccessible: ${repoPath} — ${err instanceof Error ? err.message : err}`,
    );
  }

  console.log(`[authorship] backfill start: project=${projectId} path=${repoPath}`);

  const windows = await buildSessionWindows(projectId, repoPath);
  console.log(
    `[authorship] built ${windows.length} session windows (edits cached by file)`,
  );

  const trackedAll = await listTrackedFiles(repoPath);
  // 并发受限过滤（isTrackedTextFile 会 fork git + 读文件头）
  const trackedFiles: string[] = [];
  for (const f of trackedAll) {
    if (await isTrackedTextFile(repoPath, f)) {
      trackedFiles.push(f);
    }
  }

  // 清空该项目的旧归因（避免 stale）。简单粗暴但 backfill 只在首次/手动触发时跑。
  db.delete(codeAuthorship)
    .where(eq(codeAuthorship.projectId, projectId))
    .run();

  const now = Date.now();
  const rowBuffer: Array<typeof codeAuthorship.$inferInsert> = [];
  const BATCH = 500;

  let aiLines = 0;
  let humanLines = 0;
  let unknownLines = 0;
  let mixedLines = 0;
  let processed = 0;

  for (const relPath of trackedFiles) {
    const blame = await blameFile(repoPath, relPath);
    if (!blame) {
      processed++;
      continue;
    }

    for (const line of blame) {
      const attr = attributeLine(line, relPath, windows);
      rowBuffer.push({
        projectId,
        file: relPath,
        lineStart: line.lineNumber,
        lineEnd: line.lineNumber,
        sessionId: attr.sessionId,
        commitSha: line.commitSha,
        author: attr.author,
        createdAt: now,
      });
      if (attr.author === 'ai-claude' || attr.author === 'ai-codex') aiLines++;
      else if (attr.author === 'human') humanLines++;
      else if (attr.author === 'mixed') mixedLines++;
      else unknownLines++;

      if (rowBuffer.length >= BATCH) {
        flushBuffer(rowBuffer);
        rowBuffer.length = 0;
      }
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(
        `[authorship] progress ${processed}/${trackedFiles.length} files, ai=${aiLines} human=${humanLines} mixed=${mixedLines} unknown=${unknownLines}`,
      );
    }
  }

  if (rowBuffer.length > 0) {
    flushBuffer(rowBuffer);
    rowBuffer.length = 0;
  }

  const totalLines = aiLines + humanLines + mixedLines + unknownLines;
  console.log(
    `[authorship] backfill done: project=${projectId} files=${processed} total=${totalLines} ai=${aiLines} human=${humanLines} mixed=${mixedLines} unknown=${unknownLines}`,
  );

  return {
    filesProcessed: processed,
    linesAttributed: totalLines,
  };
}

function flushBuffer(rows: Array<typeof codeAuthorship.$inferInsert>): void {
  try {
    db.insert(codeAuthorship).values(rows).run();
  } catch (err) {
    console.warn(
      `[authorship] batch insert failed (${rows.length} rows):`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ----- 查询：单文件 per-line -----

export async function getAuthorshipForFile(
  projectId: string,
  relPath: string,
): Promise<FileAuthorship | null> {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return null;

  // 读当前 FS 文件内容拿 content（DB 只存 authorship 元数据，不存每行原文，减轻存储）
  const abs = path.resolve(project.path, relPath);
  let raw: string;
  try {
    raw = await fs.readFile(abs, 'utf-8');
  } catch {
    return null;
  }
  const fileLines = raw.split('\n');
  // 若最后一行是空（文件以 \n 结尾导致 split 多出空尾），丢掉
  if (fileLines.length > 0 && fileLines[fileLines.length - 1] === '') {
    fileLines.pop();
  }

  const rows = db
    .select()
    .from(codeAuthorship)
    .where(eq(codeAuthorship.file, relPath))
    .all()
    .filter((r) => r.projectId === projectId);

  // 按 lineStart 建索引（单行 row: lineStart == lineEnd，直接用 lineStart 作 key）
  const byLine = new Map<number, typeof rows[number]>();
  for (const r of rows) {
    // 同一行多 row 情况（mixed 叠加历史）：保留 createdAt 最大的
    const prev = byLine.get(r.lineStart);
    if (!prev || (r.createdAt ?? 0) > (prev.createdAt ?? 0)) {
      byLine.set(r.lineStart, r);
    }
  }

  const out: AuthorshipLine[] = fileLines.map((content, idx) => {
    const ln = idx + 1;
    const row = byLine.get(ln);
    if (!row) {
      return {
        lineNumber: ln,
        content,
        author: 'unknown' as AuthorKind,
        sessionId: null,
        commitSha: null,
        authoredAt: null,
      };
    }
    return {
      lineNumber: ln,
      content,
      author: row.author as AuthorKind,
      sessionId: row.sessionId,
      commitSha: row.commitSha,
      authoredAt: null, // 归因表不存 authoredAt，UI 若需可通过 sessions/git 再查
    };
  });

  return {
    path: relPath,
    totalLines: fileLines.length,
    lines: out,
  };
}
