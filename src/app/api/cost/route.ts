/**
 * /api/cost
 * 成本聚合查询 —— This Month / This Week / All Time × 项目 × 模型
 *
 * 查询参数:
 *   range = 'month' | 'week' | 'all' （默认 month，以当地月初为界）
 *
 * 响应结构:
 *   {
 *     range, from, to,
 *     totals: { usd, claudeUsd, codexUsd, sessions, tokensIn, tokensOut },
 *     byProject: [{ projectId, name, usd, sessions }],
 *     byModel:   [{ model, source, usd, sessions }],
 *     unknownModelSessions: number   // 无法定价的 session 数（model null 或不在表里）
 *   }
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, sessions } from '@/lib/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

export type CostRange = 'month' | 'week' | 'all';

export interface CostProjectSlice {
  projectId: string;
  name: string;
  usd: number;
  sessions: number;
}

export interface CostModelSlice {
  model: string;
  source: 'claude' | 'codex' | 'unknown';
  usd: number;
  sessions: number;
}

export interface CostResponse {
  range: CostRange;
  from: number | null;   // unix ms，null=全部
  to: number;            // 查询时刻
  totals: {
    usd: number;
    claudeUsd: number;
    codexUsd: number;
    sessions: number;
    tokensIn: number;
    tokensOut: number;
  };
  byProject: CostProjectSlice[];
  byModel: CostModelSlice[];
  unknownModelSessions: number;
}

function parseRange(raw: string | null): CostRange {
  if (raw === 'week' || raw === 'all') return raw;
  return 'month';
}

function rangeStart(range: CostRange, now = new Date()): number | null {
  if (range === 'all') return null;

  if (range === 'week') {
    // 当地周一 00:00
    const d = new Date(now);
    const day = d.getDay(); // 0=Sun
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // month: 当地月 1 日 00:00
  const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return d.getTime();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = parseRange(url.searchParams.get('range'));
    const now = Date.now();
    const from = rangeStart(range, new Date(now));

    const whereClause = from !== null
      ? and(gte(sessions.startedAt, from))
      : undefined;

    // Totals
    const totalsRow = db
      .select({
        sessions: sql<number>`count(*)`,
        usd: sql<number>`coalesce(sum(${sessions.costUsd}), 0)`,
        claudeUsd: sql<number>`coalesce(sum(case when ${sessions.source} = 'claude' then ${sessions.costUsd} end), 0)`,
        codexUsd: sql<number>`coalesce(sum(case when ${sessions.source} = 'codex' then ${sessions.costUsd} end), 0)`,
        tokensIn: sql<number>`coalesce(sum(${sessions.tokensIn}), 0)`,
        tokensOut: sql<number>`coalesce(sum(${sessions.tokensOut}), 0)`,
        unknown: sql<number>`sum(case when ${sessions.costUsd} is null then 1 else 0 end)`,
      })
      .from(sessions)
      .where(whereClause)
      .get();

    // By project
    const projectRows = db
      .select({
        projectId: sessions.projectId,
        name: projects.name,
        usd: sql<number>`coalesce(sum(${sessions.costUsd}), 0)`,
        sessions: sql<number>`count(*)`,
      })
      .from(sessions)
      .leftJoin(projects, eq(sessions.projectId, projects.id))
      .where(whereClause)
      .groupBy(sessions.projectId, projects.name)
      .orderBy(sql`sum(${sessions.costUsd}) desc nulls last`)
      .all();

    const byProject: CostProjectSlice[] = projectRows
      .filter((r) => r.projectId !== null)
      .map((r) => ({
        projectId: r.projectId as string,
        name: r.name ?? '(unknown)',
        usd: Number(r.usd ?? 0),
        sessions: Number(r.sessions ?? 0),
      }));

    // By model
    const modelRows = db
      .select({
        model: sessions.model,
        source: sessions.source,
        usd: sql<number>`coalesce(sum(${sessions.costUsd}), 0)`,
        sessions: sql<number>`count(*)`,
      })
      .from(sessions)
      .where(whereClause)
      .groupBy(sessions.model, sessions.source)
      .orderBy(sql`sum(${sessions.costUsd}) desc nulls last`)
      .all();

    const byModel: CostModelSlice[] = modelRows.map((r) => ({
      model: r.model ?? '(unknown)',
      source:
        r.source === 'claude' || r.source === 'codex' ? r.source : 'unknown',
      usd: Number(r.usd ?? 0),
      sessions: Number(r.sessions ?? 0),
    }));

    const response: CostResponse = {
      range,
      from,
      to: now,
      totals: {
        usd: Number(totalsRow?.usd ?? 0),
        claudeUsd: Number(totalsRow?.claudeUsd ?? 0),
        codexUsd: Number(totalsRow?.codexUsd ?? 0),
        sessions: Number(totalsRow?.sessions ?? 0),
        tokensIn: Number(totalsRow?.tokensIn ?? 0),
        tokensOut: Number(totalsRow?.tokensOut ?? 0),
      },
      byProject,
      byModel,
      unknownModelSessions: Number(totalsRow?.unknown ?? 0),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[GET /api/cost]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
