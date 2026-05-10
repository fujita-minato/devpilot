import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, sessions, tracks, decisions } from '@/lib/schema';
import { getLiveSessions } from '@/lib/ingest/live-monitor';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GitInfo {
  status: 'clean' | 'dirty';
  uncommitted: number;
  uncommittedFiles: string[];
  ahead: number;
  behind: number;
  recentCommits: Array<{ hash: string; message: string }>;
}

export interface RunnerInfo {
  active: boolean;
  sessionId: string | null;
  nowDoing: string | null;
  sessionCount: number;
  // 准确的 per-runner token 总量(由 server 端汇总,不依赖 history[20] 截断)
  tokensIn: number;
  tokensOut: number;
  lastSummary: string;
  lastAt: number | null;
  lastDuration: number | null;
}

export interface TrackInfo {
  id: string;
  name: string;
  stage: string | null;
  updatedAt: number | null;
}

export interface DecisionInfo {
  title: string;
  reason: string | null;
  status: string | null;
  createdAt: number | null;
}

export interface ActivityInfo {
  sessionId: string;
  runner: 'claude' | 'codex';
  summary: string;
  startedAt: number;
  duration: number;
}

export interface MonitorProject {
  id: string;
  name: string;
  branch: string;
  stage: string;
  git: GitInfo | null;
  runners: { cc: RunnerInfo; cx: RunnerInfo };
  tokens: { in: number; out: number; sessions: number };
  claudeProject: { instructions: string; projectFiles: number; contextUsedPct: number };
  history: Array<{
    sessionId: string;
    runner: 'claude' | 'codex';
    startedAt: number;
    duration: number;
    summary: string;
    tokensIn: number;
    tokensOut: number;
  }>;
  recentFiles: string[];
  decisions: DecisionInfo[];
  recentActivity: ActivityInfo[];
  tracks: TrackInfo[];
}

export interface MonitorResponse {
  projects: MonitorProject[];
}

// ── 5s cache for git info ────────────────────────────────────────────────────

interface CacheEntry {
  git: GitInfo | null;
  recentFiles: string[];
  ts: number;
}
const gitCache = new Map<string, CacheEntry>();
const GIT_TTL = 5_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function runGit(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, timeout: 3000, encoding: 'utf8' });
  if (r.error || r.status !== 0) return '';
  return (r.stdout as string).trim();
}

function getGitInfo(projectPath: string): GitInfo | null {
  if (!existsSync(path.join(projectPath, '.git'))) return null;
  try {
    // porcelain 列对齐重要 —— runGit().trim() 会吃掉首行的 leading space("XY path"
    // 中 X=' '),导致按位 slice 错位。这一处直接 spawnSync 拿原始 stdout。
    const statusRaw = spawnSync('git', ['status', '--porcelain'], {
      cwd: projectPath,
      timeout: 3000,
      encoding: 'utf8',
    });
    const statusOut =
      statusRaw.error || statusRaw.status !== 0
        ? ''
        : (statusRaw.stdout as string);

    const logOut = runGit(['log', '--oneline', '-3'], projectPath);
    const aheadOut = runGit(['rev-list', '--count', 'HEAD...@{u}'], projectPath);

    const uncommittedLines = statusOut.split('\n').filter(Boolean);
    // 每行格式恒为 "XY path"(2 status 字符 + 1 空格 + path);rename 是 "XY old -> new"。
    const uncommittedFiles = uncommittedLines.slice(0, 30).map((l) => {
      const rest = l.slice(3);
      const arrow = rest.indexOf(' -> ');
      return arrow >= 0 ? rest.slice(arrow + 4) : rest;
    });
    const ahead = parseInt(aheadOut, 10) || 0;
    const recentCommits = logOut
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const spaceIdx = line.indexOf(' ');
        return {
          hash: line.slice(0, spaceIdx),
          message: line.slice(spaceIdx + 1),
        };
      });

    return {
      status: uncommittedLines.length > 0 ? 'dirty' : 'clean',
      uncommitted: uncommittedLines.length,
      uncommittedFiles,
      ahead,
      behind: 0,
      recentCommits,
    };
  } catch {
    return null;
  }
}

function getRecentFiles(projectPath: string): string[] {
  if (!existsSync(path.join(projectPath, '.git'))) return [];
  try {
    const out = runGit(['log', '--name-only', '--pretty=format:', '-20'], projectPath);
    if (!out) return [];
    const seen = new Set<string>();
    const files: string[] = [];
    for (const line of out.split('\n')) {
      const f = line.trim();
      if (f && !seen.has(f)) {
        seen.add(f);
        files.push(f);
        if (files.length >= 30) break;
      }
    }
    return files;
  } catch {
    return [];
  }
}

function getClaudeProject(projectPath: string) {
  let instructions = '';
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, 'utf-8');
      instructions =
        content
          .split('\n')
          .find((l) => l.trim())
          ?.trim()
          .slice(0, 120) ?? '';
    } catch {}
  }

  let projectFiles = 0;
  const claudeDir = path.join(projectPath, '.claude');
  if (existsSync(claudeDir)) {
    try {
      projectFiles = readdirSync(claudeDir).length;
    } catch {}
  }

  return { instructions, projectFiles, contextUsedPct: 0 };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const allProjects = db.select().from(projects).all();
    const allSessions = db.select().from(sessions).all();
    const allTracks = db.select().from(tracks).all();
    const allDecisions = db.select().from(decisions).all();
    const liveSessions = getLiveSessions();

    // Group live sessions by project path
    const liveByPath = new Map<string, typeof liveSessions>();
    for (const ls of liveSessions) {
      const arr = liveByPath.get(ls.project) ?? [];
      arr.push(ls);
      liveByPath.set(ls.project, arr);
    }

    const now = Date.now();

    const result: MonitorProject[] = allProjects.map((p) => {
      const projectSessions = allSessions.filter((s) => s.projectId === p.id);

      // Token totals
      const tokIn = projectSessions.reduce((acc, s) => acc + (s.tokensIn ?? 0), 0);
      const tokOut = projectSessions.reduce((acc, s) => acc + (s.tokensOut ?? 0), 0);

      // Per-runner stats
      const ccAll = projectSessions.filter((s) => s.source === 'claude');
      const cxAll = projectSessions.filter((s) => s.source === 'codex');

      // Active runners: nowDoing != null means currently running
      const ccActive = ccAll.filter((s) => s.nowDoing != null);
      const cxActive = cxAll.filter((s) => s.nowDoing != null);

      // Also check live sessions for cc activity
      const liveParts = liveByPath.get(p.path) ?? [];
      const ccLive = liveParts.find(
        (ls) => ls.status === 'tool_use' || ls.status === 'thinking',
      );

      // Last session per runner (with non-empty summary)
      const ccLast = ccAll
        .filter((s) => s.startedAt && s.summary?.trim())
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
      const cxLast = cxAll
        .filter((s) => s.startedAt && s.summary?.trim())
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;

      // History (most recent 20 sessions)
      const history = projectSessions
        .filter((s) => s.startedAt != null)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
        .slice(0, 20)
        .map((s) => ({
          sessionId: s.id,
          runner: (s.source === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex',
          startedAt: s.startedAt ?? 0,
          duration: s.duration ?? 0,
          summary: s.summary ?? '',
          tokensIn: s.tokensIn ?? 0,
          tokensOut: s.tokensOut ?? 0,
        }));

      // Git & recent files from cache
      let cached = gitCache.get(p.id);
      if (!cached || now - cached.ts > GIT_TTL) {
        cached = { git: getGitInfo(p.path), recentFiles: getRecentFiles(p.path), ts: now };
        gitCache.set(p.id, cached);
      }

      // Decisions for this project (newest first, max 10)
      const projectDecisions: DecisionInfo[] = allDecisions
        .filter((d) => d.projectId === p.id)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 10)
        .map((d) => ({
          title: d.title,
          reason: d.reason,
          status: d.status,
          createdAt: d.createdAt,
        }));

      // Recent activity: 5 most recent sessions with non-empty summary
      const recentActivity: ActivityInfo[] = projectSessions
        .filter((s) => s.startedAt != null && s.summary && s.summary.trim())
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
        .slice(0, 5)
        .map((s) => ({
          sessionId: s.id,
          runner: (s.source === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex',
          summary: (s.summary ?? '').slice(0, 200),
          startedAt: s.startedAt ?? 0,
          duration: s.duration ?? 0,
        }));

      return {
        id: p.id,
        name: p.name,
        branch: p.branch ?? 'main',
        stage: p.stage ?? 'think',
        git: cached.git,
        runners: {
          cc: {
            active: ccActive.length > 0 || ccLive != null,
            sessionId: ccActive[0]?.id ?? ccLive?.sessionId ?? null,
            nowDoing: ccActive[0]?.nowDoing ?? ccLive?.lastTool ?? null,
            sessionCount: ccAll.length,
            tokensIn: ccAll.reduce((acc, s) => acc + (s.tokensIn ?? 0), 0),
            tokensOut: ccAll.reduce((acc, s) => acc + (s.tokensOut ?? 0), 0),
            lastSummary: (ccLast?.summary ?? '').slice(0, 200),
            lastAt: ccLast?.startedAt ?? null,
            lastDuration: ccLast?.duration ?? null,
          },
          cx: {
            active: cxActive.length > 0,
            sessionId: cxActive[0]?.id ?? null,
            nowDoing: cxActive[0]?.nowDoing ?? null,
            sessionCount: cxAll.length,
            tokensIn: cxAll.reduce((acc, s) => acc + (s.tokensIn ?? 0), 0),
            tokensOut: cxAll.reduce((acc, s) => acc + (s.tokensOut ?? 0), 0),
            lastSummary: (cxLast?.summary ?? '').slice(0, 200),
            lastAt: cxLast?.startedAt ?? null,
            lastDuration: cxLast?.duration ?? null,
          },
        },
        tokens: { in: tokIn, out: tokOut, sessions: projectSessions.length },
        claudeProject: getClaudeProject(p.path),
        history,
        recentFiles: cached.recentFiles,
        decisions: projectDecisions,
        recentActivity,
        tracks: allTracks
          .filter((t) => t.projectId === p.id)
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .slice(0, 8)
          .map((t) => ({
            id: t.id,
            name: t.name,
            stage: t.stage,
            updatedAt: t.updatedAt,
          })),
      };
    });

    // Active projects first, then by total tokens
    result.sort((a, b) => {
      const aActive = a.runners.cc.active || a.runners.cx.active ? 0 : 1;
      const bActive = b.runners.cc.active || b.runners.cx.active ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.tokens.in + b.tokens.out - (a.tokens.in + a.tokens.out);
    });

    return NextResponse.json({ projects: result } satisfies MonitorResponse);
  } catch (err) {
    console.error('[GET /api/monitor]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
