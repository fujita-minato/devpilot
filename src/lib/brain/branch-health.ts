import type { QuietBranch, Stage } from '@/lib/observatory/types';

export type Rule = (ctx: BranchContext, now: number) => QuietBranch | null;

export interface BranchContext {
  projectId: string;
  projectName: string;
  branch: string;
  stage: Stage;
  sessions: { startedAt: number }[];
  commits: { at: number }[];
  hasUncommittedDiff: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTICE_MS = 2 * DAY_MS;
const WARN_MS = 5 * DAY_MS;
const RECENT_SESSION_MS = 7 * DAY_MS;
const ABANDONED_SESSION_MS = 30 * DAY_MS;

export function evaluateQuietBranch(ctx: BranchContext, now = Date.now()): QuietBranch | null {
  if (isAbandoned(ctx, now)) return null;

  return warnRule(ctx, now) ?? noticeRule(ctx, now);
}

export const warnRule: Rule = (ctx, now) => {
  if (ctx.stage === 'done') return null;

  const lastSession = latestSessionAt(ctx);
  if (lastSession === null || now - lastSession > RECENT_SESSION_MS) return null;
  if (!hasNoCommitSince(ctx, now, WARN_MS)) return null;

  return toQuietBranch(ctx, now, {
    severity: 'warn',
    reason: reasonText(ctx, 'no commits in 5d while sessions are still recent'),
  });
};

export const noticeRule: Rule = (ctx, now) => {
  if (ctx.stage === 'done') return null;
  if (!hasNoCommitSince(ctx, now, NOTICE_MS)) return null;

  return toQuietBranch(ctx, now, {
    severity: 'notice',
    reason: reasonText(ctx, 'no commits in 2d'),
  });
};

export function isAbandoned(ctx: BranchContext, now: number): boolean {
  const lastSession = latestSessionAt(ctx);
  return lastSession === null || now - lastSession > ABANDONED_SESSION_MS;
}

function hasNoCommitSince(ctx: BranchContext, now: number, thresholdMs: number) {
  const lastCommit = latestCommitAt(ctx);
  return lastCommit === null || now - lastCommit >= thresholdMs;
}

function toQuietBranch(
  ctx: BranchContext,
  now: number,
  details: Pick<QuietBranch, 'reason' | 'severity'>,
): QuietBranch {
  const lastCommit = latestCommitAt(ctx);
  const lastSession = latestSessionAt(ctx);
  const since = lastCommit ?? lastSession ?? now;

  return {
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    branch: ctx.branch,
    stage: ctx.stage,
    daysInStage: Math.max(0, Math.floor((now - since) / DAY_MS)),
    lastCommit,
    lastSession,
    reason: details.reason,
    severity: details.severity,
  };
}

function reasonText(ctx: BranchContext, base: string) {
  if (ctx.hasUncommittedDiff) {
    return `${base} · uncommitted diff present`;
  }
  return base;
}

function latestCommitAt(ctx: BranchContext) {
  return latestAt(ctx.commits.map((commit) => commit.at));
}

function latestSessionAt(ctx: BranchContext) {
  return latestAt(ctx.sessions.map((session) => session.startedAt));
}

function latestAt(values: number[]) {
  if (values.length === 0) return null;
  return Math.max(...values);
}
