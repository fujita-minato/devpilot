import { eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toRunner } from '@/lib/observatory/normalize';
import type { ActiveSession, SessionState } from '@/lib/observatory/types';
import { projects, sessions } from '@/lib/schema';

function sessionState(nowDoing: string | null, duration: number | null): SessionState {
  if (duration !== null) return 'thinking';
  if (nowDoing) return 'typing';
  return 'idle';
}

export async function GET() {
  try {
    const now = Date.now();
    const openSessionCutoff = now - 30 * 60 * 1000;
    const queryCutoff = now - 24 * 60 * 60 * 1000;

    const rows = db
      .select({
        sessionId: sessions.id,
        projectId: sessions.projectId,
        projectName: projects.name,
        source: sessions.source,
        model: sessions.model,
        nowDoing: sessions.nowDoing,
        startedAt: sessions.startedAt,
        duration: sessions.duration,
        tokensIn: sessions.tokensIn,
        tokensOut: sessions.tokensOut,
      })
      .from(sessions)
      .innerJoin(projects, eq(sessions.projectId, projects.id))
      .where(gte(sessions.startedAt, queryCutoff))
      .all();

    const active: ActiveSession[] = rows
      .filter((row) => {
        if (!row.projectId || !row.startedAt) return false;
        if (row.duration !== null) return row.startedAt + row.duration * 1000 > now;
        return row.startedAt > openSessionCutoff;
      })
      .map((row) => ({
        sessionId: row.sessionId,
        projectId: row.projectId!,
        projectName: row.projectName,
        runner: toRunner(row.source),
        model: row.model,
        state: sessionState(row.nowDoing, row.duration),
        nowDoing: row.nowDoing,
        startedAt: row.startedAt ?? 0,
        tokensIn: row.tokensIn ?? 0,
        tokensOut: row.tokensOut ?? 0,
      }))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 20);

    return NextResponse.json(active);
  } catch (error) {
    console.error('[GET /api/sessions/active]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
