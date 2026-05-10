/**
 * brain/decision-extractor.ts
 * 从 session summary 中用本地 pattern match 提取技术决策，写入 decisions 表
 */

import { isNotNull, ne, and, eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { sessions, decisions } from '../schema.ts';

interface ExtractedDecision {
  title: string;    // 决策标题，一句话
  reason: string;   // 原因（可为空）
  status: 'accepted' | 'proposed' | 'deprecated';
}

const ACCEPTED_KEYWORDS = [
  '决定',
  '确定',
  '选择',
  '采用',
  '使用',
  '改为',
  '改用',
  '切换到',
  '迁移到',
  '保留',
  '落地',
  'decision',
  'decide',
  'decided',
  'choose',
  'chose',
  'chosen',
  'use',
  'using',
  'adopt',
  'adopted',
  'switch to',
  'switched to',
  'migrate to',
  'migrated to',
];

const DEPRECATED_KEYWORDS = [
  '放弃',
  '弃用',
  '不再使用',
  '不用',
  '移除',
  '删除',
  'deprecated',
  'deprecate',
  'drop',
  'dropped',
  'remove',
  'removed',
];

function normalizeLine(line: string): string {
  return line
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasKeyword(line: string, keywords: string[]): boolean {
  const lower = line.toLowerCase();
  return keywords.some((keyword) => {
    if (/^[a-z ]+$/i.test(keyword)) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(line);
    }

    return lower.includes(keyword.toLowerCase());
  });
}

function hasDecisionSignal(line: string): boolean {
  return hasKeyword(line, ACCEPTED_KEYWORDS) || hasKeyword(line, DEPRECATED_KEYWORDS);
}

function inferStatus(line: string): ExtractedDecision['status'] {
  if (hasKeyword(line, DEPRECATED_KEYWORDS)) {
    return 'deprecated';
  }

  return 'accepted';
}

function toDecisionTitle(line: string): string | null {
  const title = normalizeLine(line)
    .replace(/^\*\*(decision|decisions|决定|决策)\*\*[:：]?\s*/i, '')
    .replace(/^(decision|decisions|决定|决策)[:：]\s*/i, '')
    .trim();

  if (title.length < 4) {
    return null;
  }

  return title.slice(0, 100);
}

export function extractFromSummary(summary: string): ExtractedDecision[] {
  const extracted: ExtractedDecision[] = [];
  const seen = new Set<string>();

  for (const rawLine of summary.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (!line || !hasDecisionSignal(line)) {
      continue;
    }

    const title = toDecisionTitle(line);
    if (!title) {
      continue;
    }

    const key = title.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    extracted.push({
      title,
      reason: '',
      status: inferStatus(line),
    });
  }

  return extracted;
}

export async function extractDecisions(): Promise<{ decisionCount: number }> {
  // 只处理有 summary 的 sessions
  const allSessions = db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      trackId: sessions.trackId,
      summary: sessions.summary,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(and(isNotNull(sessions.summary), ne(sessions.summary, '')))
    .all();

  let decisionCount = 0;

  for (const s of allSessions) {
    if (!s.summary) continue;

    const extracted = extractFromSummary(s.summary);

    for (const d of extracted) {
      if (!d.title?.trim()) continue;

      const title = d.title.trim().slice(0, 100);

      // 同一 session 同标题不重复插入
      const existing = db
        .select({ id: decisions.id })
        .from(decisions)
        .where(and(eq(decisions.title, title), eq(decisions.sessionId, s.id)))
        .get();

      if (!existing) {
        db.insert(decisions).values({
          projectId: s.projectId,
          trackId: s.trackId,
          sessionId: s.id,
          title,
          reason: d.reason?.trim() ?? null,
          status: d.status ?? 'accepted',
          createdAt: s.startedAt,
        }).run();
        decisionCount++;
      }
    }
  }

  return { decisionCount };
}
