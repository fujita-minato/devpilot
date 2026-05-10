/**
 * GET /api/projects/[id]/tracks
 * 返回该项目的所有 tracks
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tracks, sessions } from '@/lib/schema';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const sessionCounts = db
      .select({
        trackId: sessions.trackId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .groupBy(sessions.trackId)
      .all();

    const countMap = new Map<string, number>();
    for (const row of sessionCounts) {
      if (row.trackId) countMap.set(row.trackId, Number(row.count));
    }

    const rows = db
      .select()
      .from(tracks)
      .where(eq(tracks.projectId, id))
      .all();

    const result = rows.map((t) => ({
      id: t.id,
      name: t.name,
      stage: t.stage,
      nickname: t.nickname,
      avatar: t.avatar,
      statusText: t.statusText,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      sessionCount: countMap.get(t.id) ?? 0,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/projects/[id]/tracks] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
