import { eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toRunner } from '@/lib/observatory/normalize';
import type { ActivityEvent } from '@/lib/observatory/types';
import { projects, sessions } from '@/lib/schema';

type ActivityWindow = '4h' | '24h' | '7d';

const WINDOW_MS: Record<ActivityWindow, number> = {
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

function parseWindow(raw: string | null): ActivityWindow {
  if (raw === '4h' || raw === '7d') return raw;
  return '24h';
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const window = parseWindow(url.searchParams.get('window'));
    const from = Date.now() - WINDOW_MS[window];

    const rows = db
      .select({
        sessionId: sessions.id,
        projectId: sessions.projectId,
        projectName: projects.name,
        source: sessions.source,
        startedAt: sessions.startedAt,
        duration: sessions.duration,
      })
      .from(sessions)
      .innerJoin(projects, eq(sessions.projectId, projects.id))
      .where(gte(sessions.startedAt, from - 24 * 60 * 60 * 1000))
      .all();

    const events: ActivityEvent[] = [];

    for (const row of rows) {
      if (!row.startedAt || !row.projectId) continue;

      if (row.startedAt >= from) {
        events.push({
          id: `${row.sessionId}:started`,
          at: row.startedAt,
          kind: 'session.started',
          runner: toRunner(row.source),
          projectId: row.projectId,
          projectName: row.projectName,
          text: 'session started',
        });
      }

      if (row.duration !== null) {
        const endedAt = row.startedAt + row.duration * 1000;
        if (endedAt >= from) {
          events.push({
            id: `${row.sessionId}:ended`,
            at: endedAt,
            kind: 'session.ended',
            runner: toRunner(row.source),
            projectId: row.projectId,
            projectName: row.projectName,
            text: 'session ended',
          });
        }
      }
    }

    events.sort((a, b) => b.at - a.at);
    return NextResponse.json(events.slice(0, 100));
  } catch (error) {
    console.error('[GET /api/activity]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
