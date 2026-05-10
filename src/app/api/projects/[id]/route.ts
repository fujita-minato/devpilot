import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, sessions } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export type SessionSource = 'claude' | 'codex' | 'unknown';

export interface SessionDetail {
  id: string;
  source: SessionSource;
  startedAt: number | null;
  summary: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  toolsUsed: string[];
  gitBranch: string | null;
  cwd: string | null;
}

export interface ProjectDetailResponse {
  project: {
    id: string;
    name: string;
    path: string;
    branch: string | null;
    lastActive: number | null;
  };
  sessions: SessionDetail[];
  contextBrief: {
    recentSummaries: string[];
    currentBranch: string | null;
    totalSessions: number;
    totalTokensIn: number;
    totalTokensOut: number;
    claudeSessions: number;
    codexSessions: number;
  };
}

export async function GET(
  _req: Request,
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

    // 查所有 sessions，按时间倒序
    const rawSessions = db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .orderBy(desc(sessions.startedAt))
      .all();

    const sessionDetails: SessionDetail[] = rawSessions.map((s) => {
      let toolsUsed: string[] = [];
      if (s.toolsUsed) {
        try {
          toolsUsed = JSON.parse(s.toolsUsed);
        } catch {
          // toolsUsed 格式异常时静默忽略，返回空数组
        }
      }
      const source: SessionSource =
        s.source === 'claude' || s.source === 'codex' ? s.source : 'unknown';
      return {
        id: s.id,
        source,
        startedAt: s.startedAt,
        summary: s.summary,
        tokensIn: s.tokensIn,
        tokensOut: s.tokensOut,
        toolsUsed,
        gitBranch: s.gitBranch,
        cwd: s.cwd,
      };
    });

    // 取最近 3 个有 summary 的 session
    const recentSummaries = sessionDetails
      .filter((s) => s.summary && s.summary.trim().length > 0)
      .slice(0, 3)
      .map((s) => s.summary as string);

    const totalTokensIn = sessionDetails.reduce(
      (sum, s) => sum + (s.tokensIn ?? 0),
      0,
    );
    const totalTokensOut = sessionDetails.reduce(
      (sum, s) => sum + (s.tokensOut ?? 0),
      0,
    );

    const response: ProjectDetailResponse = {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        branch: project.branch,
        lastActive: project.lastActive,
      },
      sessions: sessionDetails,
      contextBrief: {
        recentSummaries,
        currentBranch: project.branch,
        totalSessions: sessionDetails.length,
        totalTokensIn,
        totalTokensOut,
        claudeSessions: sessionDetails.filter((s) => s.source === 'claude').length,
        codexSessions: sessionDetails.filter((s) => s.source === 'codex').length,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error(`[GET /api/projects/${id}]`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
