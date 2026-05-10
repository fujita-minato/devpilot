import { desc, eq, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, sessions } from '@/lib/schema';
import type { LastSignal } from '@/lib/observatory/types';

export async function GET() {
  try {
    const row = db
      .select({
        startedAt: sessions.startedAt,
        projectName: projects.name,
      })
      .from(sessions)
      .innerJoin(projects, eq(sessions.projectId, projects.id))
      .where(isNotNull(sessions.startedAt))
      .orderBy(desc(sessions.startedAt))
      .limit(1)
      .get();

    if (!row?.startedAt) {
      return NextResponse.json(null);
    }

    const result: LastSignal = {
      at: row.startedAt,
      projectName: row.projectName,
      kind: 'session.started',
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/signal/last]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
