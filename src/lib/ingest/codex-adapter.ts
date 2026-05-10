/**
 * codex-adapter.ts
 * 解析 ~/.codex/sessions/ 下的 JSONL session 数据，写入 SQLite
 *
 * Codex JSONL 格式（与 Claude 不同）：
 * - session_meta: { id, cwd, git: { branch, commit_hash }, timestamp, ... }
 * - response_item: { type: 'message', role, content: [{ type: 'output_text', text }] }
 * - response_item: { type: 'function_call', name: 'exec_command', ... }
 * - event_msg: { type: 'token_count', ... } (只有 rate limit %，无绝对数)
 */

import { readdirSync, createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { createHash } from 'crypto';
import { db } from '../db';
import { projects, sessions } from '../schema';
import { inferStage } from './stage-inferrer';
import { calculateCost } from '../pricing';

const CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions');
const MAX_SESSION_SECS = 4 * 3600;

function pathToId(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16);
}

function pathToName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

interface CodexSession {
  id: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: number | null;
  endedAt: number | null;
  toolCount: number;
  summary: string;
  // P8 — Cost Attribution
  model: string | null;        // 从 turn_context.payload.model
  tokensIn: number;            // 非缓存 input（= input_tokens - cached_input_tokens）
  tokensCacheRead: number;     // cached_input_tokens
  tokensOut: number;           // output_tokens + reasoning_output_tokens（reasoning 按 output 价格计）
}

async function parseCodexJsonl(filePath: string): Promise<CodexSession | null> {
  const result: CodexSession = {
    id: '',
    projectPath: '',
    gitBranch: null,
    startedAt: null,
    endedAt: null,
    toolCount: 0,
    summary: '',
    model: null,
    tokensIn: 0,
    tokensCacheRead: 0,
    tokensOut: 0,
  };

  let lastAssistantText = '';
  // 最后一次 token_count 事件的 cumulative usage（Codex 每次返回增量，取 last 即 final）
  let lastTotalInput = 0;
  let lastTotalCached = 0;
  let lastTotalOutput = 0;
  let lastTotalReasoning = 0;

  await new Promise<void>((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        const payload = obj.payload;
        if (!payload) return;

        // Track timestamps
        if (obj.timestamp) {
          const ts = new Date(obj.timestamp).getTime();
          if (!Number.isNaN(ts)) {
            if (result.startedAt === null || ts < result.startedAt) result.startedAt = ts;
            if (result.endedAt === null || ts > result.endedAt) result.endedAt = ts;
          }
        }

        // session_meta → project info
        // codex format: { type: "session_meta", payload: { id, cwd, git, ... } }
        if (obj.type === 'session_meta' && payload) {
          result.id = payload.id ?? '';
          result.projectPath = payload.cwd ?? '';
          if (payload.git?.branch) {
            result.gitBranch = payload.git.branch;
          }
        }

        // turn_context → 具体 model id（可能每 turn 切换，取首次出现）
        if (obj.type === 'turn_context' && payload && !result.model && typeof payload.model === 'string') {
          result.model = payload.model;
        }

        // token_count events: info.total_token_usage 是 cumulative；取 last 即 session 终值
        if (payload.type === 'token_count' && payload.info?.total_token_usage) {
          const u = payload.info.total_token_usage;
          if (typeof u.input_tokens === 'number') lastTotalInput = u.input_tokens;
          if (typeof u.cached_input_tokens === 'number') lastTotalCached = u.cached_input_tokens;
          if (typeof u.output_tokens === 'number') lastTotalOutput = u.output_tokens;
          if (typeof u.reasoning_output_tokens === 'number') lastTotalReasoning = u.reasoning_output_tokens;
        }

        // function_call → tool count
        if (payload.type === 'function_call') {
          result.toolCount++;
        }

        // assistant messages → summary
        if (payload.role === 'assistant' && Array.isArray(payload.content)) {
          for (const block of payload.content) {
            if (block?.type === 'output_text' && block.text?.trim()) {
              lastAssistantText = block.text.trim();
            }
          }
        }
      } catch {
        // skip
      }
    });

    rl.on('close', () => resolve());
    rl.on('error', () => resolve());
  });

  if (!result.id || !result.projectPath) return null;

  result.summary = lastAssistantText.slice(0, 2000);
  // Codex total_token_usage.input_tokens 包含 cached 部分 → 拆分计费
  result.tokensIn = Math.max(0, lastTotalInput - lastTotalCached);
  result.tokensCacheRead = lastTotalCached;
  // reasoning tokens 按 output 价计费（OpenAI 官方口径）
  result.tokensOut = lastTotalOutput + lastTotalReasoning;
  return result;
}

// 递归找所有 JSONL
function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(full));
      } else if (entry.name.endsWith('.jsonl')) {
        files.push(full);
      }
    }
  } catch {
    // skip
  }
  return files;
}

export async function ingestCodex(): Promise<{ projectCount: number; sessionCount: number }> {
  console.log(`[codex-adapter] scanning ${CODEX_SESSIONS_DIR}`);
  const jsonlFiles = findJsonlFiles(CODEX_SESSIONS_DIR);
  console.log(`[codex-adapter] found ${jsonlFiles.length} JSONL files`);
  if (jsonlFiles.length === 0) {
    return { projectCount: 0, sessionCount: 0 };
  }

  // Parse all sessions
  const results = await Promise.allSettled(
    jsonlFiles.map((f) => parseCodexJsonl(f)),
  );

  const parsed: CodexSession[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      parsed.push(r.value);
    }
  }

  // Group by project path
  const byProject = new Map<string, CodexSession[]>();
  for (const s of parsed) {
    const arr = byProject.get(s.projectPath) ?? [];
    arr.push(s);
    byProject.set(s.projectPath, arr);
  }

  let projectCount = 0;
  let sessionCount = 0;

  for (const [projectPath, projectSessions] of byProject) {
    const projectId = pathToId(projectPath);
    const projectName = pathToName(projectPath);

    let latestActivity = 0;
    let latestBranch: string | null = null;
    let latestSession: CodexSession | null = null;

    for (const s of projectSessions) {
      if (s.startedAt && s.startedAt > latestActivity) {
        latestActivity = s.startedAt;
        latestSession = s;
      }
      if (s.gitBranch) latestBranch = s.gitBranch;
    }

    const stage = inferStage(
      latestSession?.gitBranch ?? latestBranch,
      latestSession?.summary ?? '',
      latestActivity > 0 ? latestActivity : null,
    );

    // Upsert project (might already exist from claude-adapter)
    // 只更新 codex 比 claude 更新的情况
    db.insert(projects).values({
      id: projectId,
      name: projectName,
      path: projectPath,
      branch: latestBranch,
      lastActive: latestActivity > 0 ? latestActivity : null,
      stage,
    }).onConflictDoUpdate({
      target: projects.id,
      set: {
        // 只在 codex lastActive 更新的情况下覆盖
        branch: latestBranch,
        lastActive: latestActivity > 0 ? latestActivity : undefined,
        stage,
      },
    }).run();

    for (const s of projectSessions) {
      const rawDuration =
        s.startedAt && s.endedAt && s.endedAt > s.startedAt
          ? Math.round((s.endedAt - s.startedAt) / 1000)
          : null;
      const duration = rawDuration !== null
        ? Math.min(rawDuration, MAX_SESSION_SECS)
        : null;

      const costUsd = calculateCost(s.model, {
        input: s.tokensIn,
        output: s.tokensOut,
        cacheRead: s.tokensCacheRead,
      });

      db.insert(sessions).values({
        id: s.id,
        projectId,
        source: 'codex',
        startedAt: s.startedAt,
        summary: s.summary,
        tokensIn: s.tokensIn,
        tokensOut: s.tokensOut,
        tokensCacheRead: s.tokensCacheRead,
        tokensCacheCreate: 0,
        toolsUsed: JSON.stringify(Array(s.toolCount).fill('exec_command').slice(0, 1)),
        trackId: null,
        gitBranch: s.gitBranch,
        cwd: s.projectPath,
        duration,
        model: s.model,
        costUsd,
      }).onConflictDoUpdate({
        target: sessions.id,
        set: {
          projectId,
          summary: s.summary,
          tokensIn: s.tokensIn,
          tokensOut: s.tokensOut,
          tokensCacheRead: s.tokensCacheRead,
          gitBranch: s.gitBranch,
          cwd: s.projectPath,
          duration,
          model: s.model,
          costUsd,
        },
      }).run();

      sessionCount++;
    }

    projectCount++;
  }

  return { projectCount, sessionCount };
}
