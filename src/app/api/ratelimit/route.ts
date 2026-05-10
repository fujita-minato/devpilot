import { and, gte, inArray } from 'drizzle-orm';
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { HEURISTIC_CAP } from '@/lib/observatory/ratelimit';
import type { RateLimitWindow } from '@/lib/observatory/types';
import { sessions } from '@/lib/schema';

function startOfWeek(now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function pct(count: number, cap: number) {
  return Math.min(100, Math.round((count / cap) * 100));
}

function probeClaudeCandidates() {
  const claudeDir = join(homedir(), '.claude');
  const candidates: string[] = [];

  if (existsSync(join(claudeDir, 'config.json'))) {
    candidates.push(join(claudeDir, 'config.json'));
  }

  const usageDir = join(claudeDir, 'usage');
  if (existsSync(usageDir)) {
    for (const file of readdirSync(usageDir)) {
      if (file.endsWith('.json')) candidates.push(join(usageDir, file));
    }
  }

  if (candidates.length > 0) {
    console.info('[GET /api/ratelimit] Claude usage candidates:', candidates);
  }

  return candidates;
}

export async function GET() {
  try {
    const now = Date.now();
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    const weekStart = startOfWeek(new Date(now));
    const claudeCandidates = probeClaudeCandidates();
    const claudeUnknown = claudeCandidates.length > 0;

    const recentRows = db
      .select({
        source: sessions.source,
        model: sessions.model,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(and(gte(sessions.startedAt, weekStart), inArray(sessions.source, ['claude', 'codex'])))
      .all();

    const claude5hCount = recentRows.filter((row) => row.source === 'claude' && (row.startedAt ?? 0) >= fiveHoursAgo).length;
    const codex5hCount = recentRows.filter((row) => row.source === 'codex' && (row.startedAt ?? 0) >= fiveHoursAgo).length;
    const opusWeeklyCount = recentRows.filter(
      (row) => row.source === 'claude' && (row.model ?? '').toLowerCase().includes('opus'),
    ).length;

    const windows: RateLimitWindow[] = [
      {
        provider: 'claude',
        label: 'Claude 5h',
        windowStart: fiveHoursAgo,
        windowEnd: now,
        usedPct: claudeUnknown ? 0 : pct(claude5hCount, HEURISTIC_CAP['claude-5h']),
        unknown: claudeUnknown || undefined,
      },
      {
        provider: 'claude',
        label: 'Opus weekly',
        windowStart: weekStart,
        windowEnd: weekStart + 7 * 24 * 60 * 60 * 1000,
        usedPct: claudeUnknown ? 0 : pct(opusWeeklyCount, HEURISTIC_CAP['opus-weekly']),
        unknown: claudeUnknown || undefined,
      },
      {
        provider: 'codex',
        label: 'Codex 5h',
        windowStart: fiveHoursAgo,
        windowEnd: now,
        usedPct: pct(codex5hCount, HEURISTIC_CAP['codex-5h']),
      },
    ];

    return NextResponse.json(windows);
  } catch (error) {
    console.error('[GET /api/ratelimit]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
