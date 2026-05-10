import { gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toStage } from '@/lib/observatory/normalize';
import type { ProjectSummary } from '@/lib/observatory/types';
import { projects, sessions } from '@/lib/schema';

export async function GET() {
  try {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allProjects = db.select().from(projects).all();
    const recentSessions = db
      .select({
        projectId: sessions.projectId,
        source: sessions.source,
        startedAt: sessions.startedAt,
        costUsd: sessions.costUsd,
      })
      .from(sessions)
      .where(gte(sessions.startedAt, since))
      .all();

    const byProject = new Map<
      string,
      {
        sessions7d: number;
        cost7dUsd: number;
        pricedSessions: number;
        claude: number;
        codex: number;
        lastSeen: number;
      }
    >();

    for (const session of recentSessions) {
      if (!session.projectId) continue;
      const current = byProject.get(session.projectId) ?? {
        sessions7d: 0,
        cost7dUsd: 0,
        pricedSessions: 0,
        claude: 0,
        codex: 0,
        lastSeen: 0,
      };

      current.sessions7d += 1;
      current.lastSeen = Math.max(current.lastSeen, session.startedAt ?? 0);

      if (session.costUsd !== null) {
        current.cost7dUsd += session.costUsd;
        current.pricedSessions += 1;
      }

      if (session.source === 'claude') current.claude += 1;
      if (session.source === 'codex') current.codex += 1;

      byProject.set(session.projectId, current);
    }

    const result: ProjectSummary[] = allProjects.map((project) => {
      const stats = byProject.get(project.id);
      const runnerTotal = (stats?.claude ?? 0) + (stats?.codex ?? 0);

      return {
        id: project.id,
        name: project.name,
        path: project.path,
        branch: project.branch,
        stage: toStage(project.stage),
        lastSeen: stats?.lastSeen || project.lastActive || 0,
        sessions7d: stats?.sessions7d ?? 0,
        cost7dUsd: stats && stats.pricedSessions > 0 ? stats.cost7dUsd : null,
        runnerMix: {
          claude: runnerTotal > 0 ? stats!.claude / runnerTotal : 0,
          codex: runnerTotal > 0 ? stats!.codex / runnerTotal : 0,
        },
        quiet: false,
      };
    });

    result.sort((a, b) => b.lastSeen - a.lastSeen);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/projects/summary]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
