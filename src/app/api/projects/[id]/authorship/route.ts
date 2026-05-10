/**
 * /api/projects/[id]/authorship
 *
 * 按项目粒度曝光行级归因数据给 UI（Wave 3 消费）。
 *
 * 查询模式：
 *   GET /api/projects/[id]/authorship
 *       → 所有文件的摘要（path + 各类 author 行计数）。无数据时异步触发 backfill 并返回
 *         202 status=building；再次访问（backfill 完成后）返回 200。
 *
 *   GET /api/projects/[id]/authorship?file=<relPath>
 *       → 单文件 per-line + 涉及的 session 详情（summary/model/costUsd/tokens）
 *
 *   GET /api/projects/[id]/authorship?run=1
 *       → 强制触发 backfill（去重，重复触发共用同一 Promise），立即 202 返回
 *
 *   GET /api/projects/[id]/authorship?tree=1
 *       → 仅返回 tracked 文件树列表（给 UI 左侧 pane 用），不需等 backfill
 *
 * 响应约定：
 *   - 404 = project not found
 *   - 202 + status='building' = backfill 进行中
 *   - 200 + status='ready' = 数据就绪
 *   - 500 = 服务端异常
 */

import { NextResponse } from 'next/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, sessions, codeAuthorship } from '@/lib/schema';
import {
  backfillProject,
  getAuthorshipForFile,
  type AuthorKind,
  type FileAuthorship,
} from '@/lib/authorship/engine';
import { isTrackedTextFile, listTrackedFiles } from '@/lib/authorship/git-blame';

export interface AuthorshipSummary {
  path: string;
  totalLines: number;
  aiClaudeLines: number;
  aiCodexLines: number;
  humanLines: number;
  mixedLines: number;
  unknownLines: number;
}

export interface AuthorshipSessionInfo {
  id: string;
  source: 'claude' | 'codex' | 'unknown';
  summary: string | null;
  model: string | null;
  costUsd: number | null;
  startedAt: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface AuthorshipResponse {
  projectId: string;
  projectPath: string;
  status: 'ready' | 'building';
  files: AuthorshipSummary[];
  file?: FileAuthorship & {
    sessions: AuthorshipSessionInfo[];
  };
}

// 去重：同一项目并发触发 backfill 合并为一条 Promise，完成后从 map 移除
const inFlight = new Map<string, Promise<void>>();

function triggerBackfill(projectId: string): Promise<void> {
  const existing = inFlight.get(projectId);
  if (existing) return existing;

  const p = (async () => {
    try {
      await backfillProject(projectId);
    } catch (err) {
      console.error(`[authorship] backfill failed for ${projectId}:`, err);
    } finally {
      inFlight.delete(projectId);
    }
  })();

  inFlight.set(projectId, p);
  return p;
}

// 聚合：SELECT file, author, count(*) 分组，组装成 AuthorshipSummary[]
function aggregateSummaries(projectId: string): AuthorshipSummary[] {
  const rows = db
    .select({
      file: codeAuthorship.file,
      author: codeAuthorship.author,
      cnt: sql<number>`count(*)`,
    })
    .from(codeAuthorship)
    .where(eq(codeAuthorship.projectId, projectId))
    .groupBy(codeAuthorship.file, codeAuthorship.author)
    .all();

  const byFile = new Map<string, AuthorshipSummary>();
  for (const r of rows) {
    const existing = byFile.get(r.file) ?? {
      path: r.file,
      totalLines: 0,
      aiClaudeLines: 0,
      aiCodexLines: 0,
      humanLines: 0,
      mixedLines: 0,
      unknownLines: 0,
    };
    const n = Number(r.cnt ?? 0);
    existing.totalLines += n;
    switch (r.author as AuthorKind) {
      case 'ai-claude':
        existing.aiClaudeLines += n;
        break;
      case 'ai-codex':
        existing.aiCodexLines += n;
        break;
      case 'human':
        existing.humanLines += n;
        break;
      case 'mixed':
        existing.mixedLines += n;
        break;
      default:
        existing.unknownLines += n;
    }
    byFile.set(r.file, existing);
  }
  return [...byFile.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// 从 sessions 表捞出 file 中涉及到的所有 session 详情
function fetchFileSessions(
  projectId: string,
  relPath: string,
): AuthorshipSessionInfo[] {
  const sessionIdRows = db
    .select({ sessionId: codeAuthorship.sessionId })
    .from(codeAuthorship)
    .where(eq(codeAuthorship.file, relPath))
    .all()
    .filter((r) => r.sessionId !== null);

  const uniqIds = Array.from(
    new Set(sessionIdRows.map((r) => r.sessionId as string)),
  );
  if (uniqIds.length === 0) return [];

  const sessionRows = db
    .select()
    .from(sessions)
    .where(inArray(sessions.id, uniqIds))
    .all();

  return sessionRows
    .filter((s) => s.projectId === projectId)
    .map((s) => ({
      id: s.id,
      source:
        s.source === 'claude' || s.source === 'codex'
          ? s.source
          : ('unknown' as const),
      summary: s.summary,
      model: s.model,
      costUsd: s.costUsd,
      startedAt: s.startedAt,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
    }));
}

async function buildTrackedTree(repoPath: string): Promise<string[]> {
  const all = await listTrackedFiles(repoPath);
  const out: string[] = [];
  for (const f of all) {
    if (await isTrackedTextFile(repoPath, f)) out.push(f);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const fileParam = url.searchParams.get('file');
    const runParam = url.searchParams.get('run');
    const treeParam = url.searchParams.get('tree');

    // 模式 1: 强制触发 backfill
    if (runParam === '1') {
      const started = Date.now();
      // 如果已在跑：不等；await 新的会阻塞直到完成
      const pending = inFlight.get(id);
      if (pending) {
        return NextResponse.json(
          {
            projectId: id,
            projectPath: project.path,
            status: 'building' as const,
            files: [],
            note: 'backfill already in progress',
          },
          { status: 202 },
        );
      }
      // 同步 await —— 小仓 backfill 通常 1-10 秒，client 可以等；前端也可选 fire-and-forget
      await triggerBackfill(id);
      const files = aggregateSummaries(id);
      return NextResponse.json({
        projectId: id,
        projectPath: project.path,
        status: 'ready' as const,
        files,
        elapsedMs: Date.now() - started,
      });
    }

    // 模式 2: 仅返回文件树（不等 backfill）
    if (treeParam === '1') {
      const tracked = await buildTrackedTree(project.path);
      return NextResponse.json({
        projectId: id,
        projectPath: project.path,
        status: 'ready' as const,
        files: tracked.map((p) => ({
          path: p,
          totalLines: 0,
          aiClaudeLines: 0,
          aiCodexLines: 0,
          humanLines: 0,
          mixedLines: 0,
          unknownLines: 0,
        })),
      } satisfies AuthorshipResponse);
    }

    // 检查是否已有归因数据
    const hasRow = db
      .select({ id: codeAuthorship.id })
      .from(codeAuthorship)
      .where(eq(codeAuthorship.projectId, id))
      .limit(1)
      .get();

    if (!hasRow) {
      // 无数据：异步触发 backfill，返回 building 状态
      void triggerBackfill(id);
      return NextResponse.json(
        {
          projectId: id,
          projectPath: project.path,
          status: 'building' as const,
          files: [],
        } satisfies AuthorshipResponse,
        { status: 202 },
      );
    }

    // 模式 3: 单文件详情
    if (fileParam) {
      const fileData = await getAuthorshipForFile(id, fileParam);
      if (!fileData) {
        return NextResponse.json(
          { error: `file not found or unreadable: ${fileParam}` },
          { status: 404 },
        );
      }
      const sessionsInvolved = fetchFileSessions(id, fileParam);
      const summaries = aggregateSummaries(id);
      const response: AuthorshipResponse = {
        projectId: id,
        projectPath: project.path,
        status: 'ready',
        files: summaries,
        file: {
          ...fileData,
          sessions: sessionsInvolved,
        },
      };
      return NextResponse.json(response);
    }

    // 模式 4: 项目摘要
    const summaries = aggregateSummaries(id);
    const response: AuthorshipResponse = {
      projectId: id,
      projectPath: project.path,
      status: 'ready',
      files: summaries,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error(`[GET /api/projects/${id}/authorship]`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
