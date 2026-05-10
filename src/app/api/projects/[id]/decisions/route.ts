/**
 * GET /api/projects/[id]/decisions
 * 返回该项目的所有决策，按 createdAt 倒序
 */

import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { decisions } from '@/lib/schema';

export interface DecisionItem {
  id: number;
  title: string;
  status: string | null;
  sessionId: string | null;
  createdAt: number | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rows = db
      .select({
        id: decisions.id,
        title: decisions.title,
        status: decisions.status,
        sessionId: decisions.sessionId,
        createdAt: decisions.createdAt,
      })
      .from(decisions)
      .where(eq(decisions.projectId, id))
      .orderBy(desc(decisions.createdAt))
      .all();

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[/api/projects/[id]/decisions] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
