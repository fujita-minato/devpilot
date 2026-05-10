/**
 * claude-adapter.ts
 * 解析 ~/.claude/projects/ 下的 JSONL session 数据，写入 SQLite
 */

import { readdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { createHash } from 'crypto';
import { db } from '../db';
import { projects, sessions } from '../schema';
import { inferStage } from './stage-inferrer';
import { calculateCost } from '../pricing';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// Convert a Claude project directory name back into an absolute path.
function dirNameToPath(dirName: string): string {
  return dirName.replace(/^-/, '/').replace(/-/g, '/');
}

// 路径 → 稳定 ID（取 sha1 前 8 位足够唯一）
function pathToId(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16);
}

// 路径最后一段作为项目名
function pathToName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

interface ParsedSession {
  id: string;
  projectId: string;
  startedAt: number | null;
  endedAt: number | null;   // 最后一条消息的时间戳，用于算 duration
  gitBranch: string | null;
  cwd: string | null;
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;   // P8: 缓存命中 input（大幅折扣）
  tokensCacheCreate: number; // P8: 缓存写入（略贵）
  toolsUsed: string[];
  summary: string;
  model: string | null;      // P8: 第一次看到的 model id，同一 session 内通常不变
}

// 流式解析 JSONL 文件（避免大文件 OOM）
async function parseJsonlSession(
  filePath: string,
  sessionId: string,
  projectId: string,
): Promise<ParsedSession> {
  const result: ParsedSession = {
    id: sessionId,
    projectId,
    startedAt: null,
    endedAt: null,
    gitBranch: null,
    cwd: null,
    tokensIn: 0,
    tokensOut: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    toolsUsed: [],
    summary: '',
    model: null,
  };

  const toolsSet = new Set<string>();
  // 用数组收集所有 assistant text，最后取最后一条作为 summary
  let lastAssistantText = '';

  await new Promise<void>((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);

        // 从 timestamp 推进 startedAt（最小值）和 endedAt（最大值）
        if (obj.timestamp) {
          const ts = new Date(obj.timestamp).getTime();
          if (!Number.isNaN(ts)) {
            if (result.startedAt === null || ts < result.startedAt) result.startedAt = ts;
            if (result.endedAt === null || ts > result.endedAt) result.endedAt = ts;
          }
        }
        if (!result.gitBranch && obj.gitBranch) {
          result.gitBranch = obj.gitBranch;
        }
        if (!result.cwd && obj.cwd) {
          result.cwd = obj.cwd;
        }

        // 统计 tokens + 抓 model（assistant 消息）
        if (obj.type === 'assistant' && obj.message) {
          const usage = obj.message.usage;
          if (usage) {
            result.tokensIn += usage.input_tokens ?? 0;
            result.tokensOut += usage.output_tokens ?? 0;
            result.tokensCacheRead += usage.cache_read_input_tokens ?? 0;
            result.tokensCacheCreate += usage.cache_creation_input_tokens ?? 0;
          }
          // 首次出现的 model id；同一 session 内一般不会变
          if (!result.model && typeof obj.message.model === 'string') {
            result.model = obj.message.model;
          }
        }

        // 收集用过的 tools，同时记录最后一条 assistant text 作为 summary
        if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
          for (const block of obj.message.content) {
            if (block.type === 'tool_use' && block.name) {
              toolsSet.add(block.name);
            }
            // 最后一条有实质内容的 assistant text（跳过纯 whitespace）
            if (block.type === 'text' && block.text?.trim()) {
              lastAssistantText = block.text.trim();
            }
          }
        }
      } catch {
        // 跳过解析失败的行
      }
    });

    rl.on('close', () => resolve());
    rl.on('error', () => resolve());
  });

  result.toolsUsed = Array.from(toolsSet);
  // 最后一条 assistant 文本 = session 自然结束时的总结，截断到 2000 chars
  result.summary = lastAssistantText.slice(0, 2000);
  return result;
}

// 扫描单个项目目录，解析所有 sessions，返回写入的 session 数量
async function processProjectDir(
  dirName: string,
  fullDirPath: string,
): Promise<number> {
  // 找出所有 .jsonl 文件（每个对应一个 session）
  let files: string[];
  try {
    files = readdirSync(fullDirPath);
  } catch {
    return 0;
  }

  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) return 0;

  // 并行解析所有 JSONL 文件（IO 密集，可以并发）
  const tempId = pathToId(dirNameToPath(dirName));
  const results = await Promise.allSettled(
    jsonlFiles.map((jsonlFile) => {
      const sessionId = jsonlFile.replace('.jsonl', '');
      const jsonlPath = join(fullDirPath, jsonlFile);
      return parseJsonlSession(jsonlPath, sessionId, tempId);
    }),
  );

  const parsedSessions: ParsedSession[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      parsedSessions.push(r.value);
    } else {
      console.error(`[claude-adapter] failed to parse session in ${fullDirPath}:`, r.reason);
    }
  }

  if (parsedSessions.length === 0) return 0;

  // 用 JSONL 里的真实 cwd 作为项目路径（避免目录名反推错误）
  const realCwd = parsedSessions.find((s) => s.cwd)?.cwd ?? null;
  const projectPath = realCwd ?? dirNameToPath(dirName);
  const projectId = pathToId(projectPath);
  const projectName = pathToName(projectPath);

  let latestActivity = 0;
  let latestBranch: string | null = null;
  let latestSession: ParsedSession | null = null;

  for (const parsed of parsedSessions) {
    if (parsed.startedAt && parsed.startedAt > latestActivity) {
      latestActivity = parsed.startedAt;
      latestSession = parsed;
    }
    if (parsed.gitBranch) {
      latestBranch = parsed.gitBranch;
    }
  }

  // 从最近 session 推断 project stage（传入 lastActive 用于休眠判断）
  const projectStage = inferStage(
    latestSession?.gitBranch ?? latestBranch,
    latestSession?.summary ?? '',
    latestActivity > 0 ? latestActivity : null,
  );

  // ★ 先 upsert project（外键约束要求 project 先存在）
  db.insert(projects).values({
    id: projectId,
    name: projectName,
    path: projectPath,
    branch: latestBranch,
    lastActive: latestActivity > 0 ? latestActivity : null,
    stage: projectStage,
  }).onConflictDoUpdate({
    target: projects.id,
    set: {
      name: projectName,
      path: projectPath,
      branch: latestBranch,
      lastActive: latestActivity > 0 ? latestActivity : undefined,
      stage: projectStage,
    },
  }).run();

  // 再 upsert sessions（project 已存在，FK 不会失败）
  for (const parsed of parsedSessions) {
    try {
      // Duration: endedAt - startedAt，但 cap 在 4 小时
      // JSONL 里如果用户隔天回来继续，间隔会非常大，不代表真实工作时长
      const MAX_SESSION_SECS = 4 * 3600; // 4h
      const rawDuration =
        parsed.startedAt && parsed.endedAt && parsed.endedAt > parsed.startedAt
          ? Math.round((parsed.endedAt - parsed.startedAt) / 1000)
          : null;
      const duration = rawDuration !== null
        ? Math.min(rawDuration, MAX_SESSION_SECS)
        : null;

      const costUsd = calculateCost(parsed.model, {
        input: parsed.tokensIn,
        output: parsed.tokensOut,
        cacheRead: parsed.tokensCacheRead,
        cacheCreate: parsed.tokensCacheCreate,
      });

      db.insert(sessions).values({
        id: parsed.id,
        projectId: projectId,
        source: 'claude',
        startedAt: parsed.startedAt,
        summary: parsed.summary,
        tokensIn: parsed.tokensIn,
        tokensOut: parsed.tokensOut,
        tokensCacheRead: parsed.tokensCacheRead,
        tokensCacheCreate: parsed.tokensCacheCreate,
        toolsUsed: JSON.stringify(parsed.toolsUsed),
        trackId: null,
        gitBranch: parsed.gitBranch,
        cwd: parsed.cwd,
        duration,
        model: parsed.model,
        costUsd,
      }).onConflictDoUpdate({
        target: sessions.id,
        set: {
          projectId: projectId,
          tokensIn: parsed.tokensIn,
          tokensOut: parsed.tokensOut,
          tokensCacheRead: parsed.tokensCacheRead,
          tokensCacheCreate: parsed.tokensCacheCreate,
          toolsUsed: JSON.stringify(parsed.toolsUsed),
          gitBranch: parsed.gitBranch,
          cwd: parsed.cwd,
          summary: parsed.summary,
          duration,
          model: parsed.model,
          costUsd,
        },
      }).run();
    } catch (err) {
      console.error(`[claude-adapter] failed to insert session ${parsed.id}:`, err);
    }
  }

  return parsedSessions.length;
}

// 全量扫描入口
export async function ingestClaude(): Promise<{ projectCount: number; sessionCount: number }> {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch (err) {
    console.error('[claude-adapter] cannot read CLAUDE_PROJECTS_DIR:', err);
    return { projectCount: 0, sessionCount: 0 };
  }

  // 过滤出目录，跳过文件
  const validDirs = projectDirs.filter((dirName) => {
    try {
      return statSync(join(CLAUDE_PROJECTS_DIR, dirName)).isDirectory();
    } catch {
      return false;
    }
  });

  // 并行处理所有项目目录（JSONL 解析是 IO 密集型，并发明显提速）
  const results = await Promise.allSettled(
    validDirs.map((dirName) =>
      processProjectDir(dirName, join(CLAUDE_PROJECTS_DIR, dirName)),
    ),
  );

  let processedProjects = 0;
  let processedSessions = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value > 0) {
      processedProjects++;
      processedSessions += r.value;
    } else if (r.status === 'rejected') {
      console.error('[claude-adapter] project processing failed:', r.reason);
    }
  }

  return { projectCount: processedProjects, sessionCount: processedSessions };
}
