import { gte } from 'drizzle-orm';
import { existsSync } from 'fs';
import { NextResponse } from 'next/server';
import { join } from 'path';
import simpleGit from 'simple-git';
import { evaluateQuietBranch, type BranchContext } from '@/lib/brain/branch-health';
import { db } from '@/lib/db';
import { toStage } from '@/lib/observatory/normalize';
import type { QuietBranch } from '@/lib/observatory/types';
import { projects, sessions } from '@/lib/schema';

export async function GET() {
  try {
    const now = Date.now();
    const since = now - 30 * 24 * 60 * 60 * 1000;
    const allProjects = db.select().from(projects).all();
    const recentSessions = db
      .select({
        projectId: sessions.projectId,
        gitBranch: sessions.gitBranch,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(gte(sessions.startedAt, since))
      .all();

    const sessionMap = new Map<string, { startedAt: number }[]>();
    const branchesByProject = new Map<string, Set<string>>();
    for (const session of recentSessions) {
      if (!session.projectId || !session.startedAt) continue;
      const branch = session.gitBranch ?? '';
      const key = `${session.projectId}:${branch}`;
      const current = sessionMap.get(key) ?? [];
      current.push({ startedAt: session.startedAt });
      sessionMap.set(key, current);

      if (branch && branch !== 'HEAD') {
        const branches = branchesByProject.get(session.projectId) ?? new Set<string>();
        branches.add(branch);
        branchesByProject.set(session.projectId, branches);
      }
    }

    const contextsByProject = await Promise.all(
      allProjects.map(async (project): Promise<BranchContext[]> => {
        if (!existsSync(project.path) || !existsSync(join(project.path, '.git'))) return [];

        try {
          const branches = branchesByProject.get(project.id) ?? new Set<string>();
          if (project.branch && project.branch !== 'HEAD') {
            branches.add(project.branch);
          }
          if (branches.size === 0) return [];

          const git = simpleGit(project.path);
          const isRepo = await git.checkIsRepo();
          if (!isRepo) return [];

          const [log, status] = await Promise.all([
            git.log({ maxCount: 50 }),
            git.status(),
          ]);

          const commits = log.all
            .map((commit) => ({ at: new Date(commit.date).getTime() }))
            .filter((commit) => Number.isFinite(commit.at) && commit.at >= since);

          return Array.from(branches).map((branch) => ({
            projectId: project.id,
            projectName: project.name,
            branch,
            stage: toStage(project.stage),
            sessions: sessionMap.get(`${project.id}:${branch}`) ?? [],
            commits,
            hasUncommittedDiff: status.files.length > 0,
          }));
        } catch (error) {
          console.warn('[GET /api/quiet-branches] failed to inspect project', project.path, error);
          return [];
        }
      }),
    );

    const quietBranches: QuietBranch[] = contextsByProject
      .flat()
      .flatMap((context) => {
        const quiet = evaluateQuietBranch(context, now);
        return quiet ? [quiet] : [];
      })
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'warn' ? -1 : 1;
        return b.daysInStage - a.daysInStage;
      });

    return NextResponse.json(quietBranches);
  } catch (error) {
    console.error('[GET /api/quiet-branches]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
