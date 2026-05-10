import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, sessions } from '@/lib/schema';
import { count, max } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export interface ProjectWithStats {
  id: string;
  name: string;
  path: string;
  branch: string | null;
  lastActive: number | null;
  sessionCount: number;
  statusLine: string | null;   // from docs/progress.md **Status:** line
  openBugs: number;
  adrCount: number;
}

function readStatusLine(projectPath: string): string | null {
  const progressPath = path.join(projectPath, 'docs', 'progress.md');
  if (!fs.existsSync(progressPath)) return null;
  const content = fs.readFileSync(progressPath, 'utf-8');
  const match = content.match(/\*\*Status:\*\*\s*(.+)/);
  return match ? match[1].trim() : null;
}

function countOpenBugs(projectPath: string): number {
  const buglistPath = path.join(projectPath, 'docs', 'buglist.md');
  if (!fs.existsSync(buglistPath)) return 0;
  const content = fs.readFileSync(buglistPath, 'utf-8');
  return (content.match(/^## \[OPEN\]/gm) ?? []).length;
}

function countAdrs(projectPath: string): number {
  const adrDir = path.join(projectPath, 'docs', 'adr');
  if (!fs.existsSync(adrDir)) return 0;
  return fs.readdirSync(adrDir).filter((f) => f.endsWith('.md')).length;
}

export async function GET() {
  try {
    const allProjects = db.select().from(projects).all();

    // 单次 GROUP BY 查询替代 N+1
    const sessionStats = db
      .select({
        projectId: sessions.projectId,
        sessionCount: count(sessions.id),
        latestActivity: max(sessions.startedAt),
      })
      .from(sessions)
      .groupBy(sessions.projectId)
      .all();
    const statsMap = new Map(sessionStats.map((s) => [s.projectId, s]));

    const result: ProjectWithStats[] = allProjects.map((p) => {
      const stats = statsMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        path: p.path,
        branch: p.branch,
        lastActive: stats?.latestActivity ?? p.lastActive,
        sessionCount: stats?.sessionCount ?? 0,
        statusLine: readStatusLine(p.path),
        openBugs: countOpenBugs(p.path),
        adrCount: countAdrs(p.path),
      };
    });

    result.sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0));
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/projects]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
