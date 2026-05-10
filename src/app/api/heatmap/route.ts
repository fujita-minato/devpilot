import { gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { HeatmapMatrix } from '@/lib/observatory/types';
import { sessions } from '@/lib/schema';

function parseDays(raw: string | null) {
  const parsed = Number(raw ?? 7);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(31, Math.floor(parsed)));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = parseDays(url.searchParams.get('days'));
    const from = Date.now() - days * 24 * 60 * 60 * 1000;

    const rows = db
      .select({ startedAt: sessions.startedAt })
      .from(sessions)
      .where(gte(sessions.startedAt, from))
      .all();

    const matrix: HeatmapMatrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

    for (const row of rows) {
      if (row.startedAt === null) continue;
      const date = new Date(row.startedAt);
      const mondayFirstDay = (date.getDay() + 6) % 7;
      const hour = date.getHours();
      matrix[mondayFirstDay][hour] += 1;
    }

    return NextResponse.json(matrix);
  } catch (error) {
    console.error('[GET /api/heatmap]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
