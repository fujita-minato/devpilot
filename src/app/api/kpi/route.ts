import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/schema';
import { gte, sum } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface KpiResponse {
  liveAgents: number;
  tokensTodayIn: number;
  tokensTodayOut: number;
  estimatedCostUsd: number;   // rough Sonnet 4 pricing
}

const LIVE_DIR = path.join(os.homedir(), '.devpilot', 'live');
const STALE_MS = 5 * 60 * 1000;

// Sonnet 4.6 pricing (per million tokens, approximate)
const COST_PER_M_IN = 3.0;
const COST_PER_M_OUT = 15.0;

export async function GET() {
  // Count live agents
  let liveAgents = 0;
  if (fs.existsSync(LIVE_DIR)) {
    const now = Date.now();
    const files = fs.readdirSync(LIVE_DIR).filter((f) => f.endsWith('.json'));
    liveAgents = files.filter((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, f), 'utf-8'));
        return now - (data.updatedAt ?? 0) < STALE_MS;
      } catch { return false; }
    }).length;
  }

  // Tokens used today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const [stats] = db
    .select({
      totalIn: sum(sessions.tokensIn),
      totalOut: sum(sessions.tokensOut),
    })
    .from(sessions)
    .where(gte(sessions.startedAt, todayMs))
    .all();

  const tokensTodayIn = Number(stats?.totalIn ?? 0);
  const tokensTodayOut = Number(stats?.totalOut ?? 0);
  const estimatedCostUsd =
    (tokensTodayIn / 1_000_000) * COST_PER_M_IN +
    (tokensTodayOut / 1_000_000) * COST_PER_M_OUT;

  return NextResponse.json({
    liveAgents,
    tokensTodayIn,
    tokensTodayOut,
    estimatedCostUsd,
  } satisfies KpiResponse);
}
