/**
 * brain/track-builder.ts
 * 根据 sessions 的 gitBranch 分组，写入 tracks 表并更新 session.trackId
 */

import { createHash } from 'crypto';
import { eq, and, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db';
import { sessions, tracks } from '../schema';
import { inferStage } from '../ingest/stage-inferrer';

// 只跳过空字符串和 HEAD detached 状态
const SKIP_BRANCHES = new Set(['HEAD', '']);

function trackId(projectId: string, branchName: string): string {
  return createHash('sha1')
    .update(`${projectId}:${branchName}`)
    .digest('hex')
    .slice(0, 16);
}

export async function buildTracks(): Promise<{ trackCount: number }> {
  // 拉所有有 gitBranch 的 sessions（排除空字符串），带 summary 用于 stage 推断
  const allSessions = db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      gitBranch: sessions.gitBranch,
      startedAt: sessions.startedAt,
      summary: sessions.summary,
    })
    .from(sessions)
    .where(and(isNotNull(sessions.gitBranch), ne(sessions.gitBranch, '')))
    .all();

  // 按 projectId + gitBranch 分组
  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    {
      projectId: string;
      branch: string;
      sessionIds: string[];
      minStartedAt: number | null;
      maxStartedAt: number | null;
      latestSummary: string;
    }
  >();

  for (const s of allSessions) {
    const branch = s.gitBranch!;
    if (SKIP_BRANCHES.has(branch)) continue;

    const key: GroupKey = `${s.projectId}:${branch}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sessionIds.push(s.id);
      if (s.startedAt != null) {
        if (existing.minStartedAt == null || s.startedAt < existing.minStartedAt) {
          existing.minStartedAt = s.startedAt;
        }
        if (existing.maxStartedAt == null || s.startedAt > existing.maxStartedAt) {
          existing.maxStartedAt = s.startedAt;
          existing.latestSummary = s.summary ?? '';
        }
      }
    } else {
      groups.set(key, {
        projectId: s.projectId!,
        branch,
        sessionIds: [s.id],
        minStartedAt: s.startedAt ?? null,
        maxStartedAt: s.startedAt ?? null,
        latestSummary: s.summary ?? '',
      });
    }
  }

  let trackCount = 0;

  for (const group of groups.values()) {
    const id = trackId(group.projectId, group.branch);
    const stage = inferStage(group.branch, group.latestSummary);

    // upsert track
    db.insert(tracks)
      .values({
        id,
        projectId: group.projectId,
        name: group.branch,
        stage,
        createdAt: group.minStartedAt,
        updatedAt: group.maxStartedAt,
      })
      .onConflictDoUpdate({
        target: tracks.id,
        set: {
          stage,
          updatedAt: group.maxStartedAt,
        },
      })
      .run();

    // 更新所有属于这个 track 的 sessions
    for (const sid of group.sessionIds) {
      db.update(sessions)
        .set({ trackId: id })
        .where(eq(sessions.id, sid))
        .run();
    }

    trackCount++;
  }

  return { trackCount };
}
