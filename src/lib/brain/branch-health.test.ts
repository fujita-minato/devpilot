import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateQuietBranch,
  isAbandoned,
  noticeRule,
  warnRule,
  type BranchContext,
} from './branch-health.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 3, 19, 12, 0, 0);

function ctx(overrides: Partial<BranchContext> = {}): BranchContext {
  return {
    projectId: 'p1',
    projectName: 'project-one',
    branch: 'feat/quiet',
    stage: 'build',
    sessions: [{ startedAt: NOW - DAY_MS }],
    commits: [{ at: NOW - DAY_MS }],
    hasUncommittedDiff: false,
    ...overrides,
  };
}

test('noticeRule flags non-done branches with no commits in 2d', () => {
  const result = noticeRule(
    ctx({
      commits: [{ at: NOW - 3 * DAY_MS }],
    }),
    NOW,
  );

  assert.equal(result?.severity, 'notice');
  assert.equal(result?.reason, 'no commits in 2d');
});

test('noticeRule ignores branches with recent commits', () => {
  const result = noticeRule(
    ctx({
      commits: [{ at: NOW - DAY_MS }],
    }),
    NOW,
  );

  assert.equal(result, null);
});

test('warnRule flags branches with no commits in 5d and recent sessions', () => {
  const result = warnRule(
    ctx({
      sessions: [{ startedAt: NOW - 3 * DAY_MS }],
      commits: [{ at: NOW - 6 * DAY_MS }],
      hasUncommittedDiff: true,
    }),
    NOW,
  );

  assert.equal(result?.severity, 'warn');
  assert.match(result?.reason ?? '', /uncommitted diff/);
});

test('warnRule ignores branches whose last session is older than 7d', () => {
  const result = warnRule(
    ctx({
      sessions: [{ startedAt: NOW - 8 * DAY_MS }],
      commits: [{ at: NOW - 6 * DAY_MS }],
    }),
    NOW,
  );

  assert.equal(result, null);
});

test('abandoned branches are not returned as quiet branches', () => {
  const context = ctx({
    sessions: [{ startedAt: NOW - 31 * DAY_MS }],
    commits: [],
  });

  assert.equal(isAbandoned(context, NOW), true);
  assert.equal(evaluateQuietBranch(context, NOW), null);
});

test('branches with sessions inside 30d are not abandoned', () => {
  const context = ctx({
    sessions: [{ startedAt: NOW - 10 * DAY_MS }],
    commits: [],
    stage: 'done',
  });

  assert.equal(isAbandoned(context, NOW), false);
  assert.equal(evaluateQuietBranch(context, NOW), null);
});
