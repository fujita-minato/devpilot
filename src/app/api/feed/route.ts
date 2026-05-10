import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, projects } from '@/lib/schema';
import { desc, eq, isNotNull, ne, and } from 'drizzle-orm';

export interface FeedItem {
  sessionId: string;
  projectId: string;
  projectName: string;
  startedAt: number | null;
  summary: string | null;
  gitBranch: string | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

  const rows = db
    .select({
      sessionId: sessions.id,
      projectId: sessions.projectId,
      startedAt: sessions.startedAt,
      summary: sessions.summary,
      gitBranch: sessions.gitBranch,
      projectName: projects.name,
    })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(isNotNull(sessions.summary), ne(sessions.summary, '')))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

  const feed: FeedItem[] = rows
    .filter((r) => r.projectId !== null)
    .map((r) => ({
      sessionId: r.sessionId,
      projectId: r.projectId!,
      projectName: r.projectName,
      startedAt: r.startedAt,
      summary: r.summary,
      gitBranch: r.gitBranch,
    }));

  return NextResponse.json(feed);
}
