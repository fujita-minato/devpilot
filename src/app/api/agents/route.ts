import { NextResponse } from 'next/server.js';
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  ne,
  or,
} from 'drizzle-orm';
import { db } from '../../../lib/db.ts';
import { projects, tracks } from '../../../lib/schema.ts';

export interface AgentItem {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  nickname: string | null;
  avatar: string | null;
  statusText: string | null;
  stage: string | null;
  updatedAt: number | null;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = normalizeLimit(url.searchParams.get('limit'));

  try {
    const rows = db
      .select({
        id: tracks.id,
        name: tracks.name,
        projectId: projects.id,
        projectName: projects.name,
        nickname: tracks.nickname,
        avatar: tracks.avatar,
        statusText: tracks.statusText,
        stage: tracks.stage,
        updatedAt: tracks.updatedAt,
      })
      .from(tracks)
      .innerJoin(projects, eq(tracks.projectId, projects.id))
      .where(or(
        and(isNotNull(tracks.nickname), ne(tracks.nickname, '')),
        ne(tracks.stage, 'done'),
        isNull(tracks.stage),
      ))
      .orderBy(desc(tracks.updatedAt))
      .limit(limit)
      .all();

    return NextResponse.json(rows satisfies AgentItem[]);
  } catch (err) {
    console.error('[GET /api/agents] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function normalizeLimit(rawLimit: string | null): number {
  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}
