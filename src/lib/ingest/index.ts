/**
 * ingest/index.ts
 * 数据层入口 — 触发全量重新解析（claude + codex）
 */

import { ingestClaude } from './claude-adapter';
import { ingestCodex } from './codex-adapter';
import { buildTracks } from '../brain/track-builder';
import { extractDecisions } from '../brain/decision-extractor';

export interface IngestResult {
  claudeProjects: number;
  claudeSessions: number;
  codexProjects: number;
  codexSessions: number;
  trackCount: number;
  decisionCount: number;
  durationMs: number;
}

export async function runIngest(): Promise<IngestResult> {
  const start = Date.now();
  const claude = await ingestClaude();
  const codex = await ingestCodex();
  const { trackCount } = await buildTracks();
  const { decisionCount } = await extractDecisions();
  return {
    claudeProjects: claude.projectCount,
    claudeSessions: claude.sessionCount,
    codexProjects: codex.projectCount,
    codexSessions: codex.sessionCount,
    trackCount,
    decisionCount,
    durationMs: Date.now() - start,
  };
}
