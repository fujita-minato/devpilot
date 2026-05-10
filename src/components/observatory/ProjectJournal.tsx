'use client';

// ProjectJournal — Vercel-style project page。
//
//   1. Hero       — 大项目名 + status badge + branch · last
//   2. KPI grid   — 4 个 cards(Sessions / Tokens / Dirty / Last commit)
//   3. CC vs CX   — 双 panel,各自 stats + 最近 summary
//   4. Sessions   — table(默认显示 5 条,可展开全部)。section 可折叠
//   5. Files      — VS Code 风(M/A 状态 + path)。section 默认折叠
//   6. Commits    — 紧凑 commit 列表。section 可折叠
//
// 折叠用原生 <details>;"show all"切换用 useState。
// key={project.id} 切项目时整个 component 重 mount,折叠状态自动重置。

import { useState } from 'react';
import type { MonitorProject } from '@/app/api/monitor/route';
import { FileIcon } from './FileIcon';
import { tokens } from './tokens';
import { formatRelativeTime, formatTokens } from './primitives/shared';

// ── helpers ────────────────────────────────────────────────────

function lastTouchedAt(project: MonitorProject): number | null {
  const candidates: number[] = [];
  for (const r of [project.runners.cc, project.runners.cx]) {
    if (r.lastAt) candidates.push(r.lastAt);
  }
  for (const h of project.history) candidates.push(h.startedAt);
  return candidates.length === 0 ? null : Math.max(...candidates);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function isAlive(project: MonitorProject): boolean {
  const last = lastTouchedAt(project);
  if (!last) return false;
  return Date.now() - last < 24 * 3_600_000;
}

// ── pieces ─────────────────────────────────────────────────────

function StatusBadge({ alive, stage }: { alive: boolean; stage: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10.5px] font-medium"
      style={{
        background: alive ? 'rgba(122,168,137,0.10)' : tokens.bg,
        border: `1px solid ${alive ? 'rgba(122,168,137,0.25)' : tokens.border}`,
        borderRadius: 3,
        color: alive ? tokens.success : tokens.muted,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: alive ? tokens.success : tokens.dim,
        }}
      />
      {alive ? 'Active' : 'Idle'}
      <span style={{ color: tokens.muted, fontWeight: 400, marginLeft: 4 }}>
        · {stage}
      </span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        padding: '14px 16px 12px',
      }}
    >
      <div
        className="text-[10.5px] font-medium"
        style={{ color: tokens.muted, letterSpacing: 0.05 }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-mono tabular-nums"
        style={{
          color: accent ?? tokens.text,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="mt-0.5 text-[10.5px]"
          style={{ color: tokens.dim }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function SectionHead({
  title,
  count,
  hint,
}: {
  title: string;
  count?: number;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3
        className="text-[13px] font-semibold"
        style={{ color: tokens.text, letterSpacing: '-0.01em' }}
      >
        {title}
      </h3>
      {count !== undefined ? (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: tokens.muted }}
        >
          {count}
        </span>
      ) : null}
      {hint ? (
        <span className="text-[11.5px]" style={{ color: tokens.muted }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ── collapsible section(原生 details + 自定义 summary)────────

function Collapsible({
  title,
  count,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="dp-details" open={defaultOpen || undefined}>
      <summary
        className="dp-details-summary flex items-center gap-2 select-none"
        style={{
          padding: '6px 0',
          marginBottom: 8,
          listStyle: 'none',
        }}
      >
        <span
          aria-hidden
          className="dp-details-chev"
          style={{
            width: 14,
            height: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tokens.muted,
            transition: 'transform .15s ease',
            flexShrink: 0,
          }}
        >
          {/* simple chevron-right that rotates 90° when open via CSS */}
          <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
            <path
              d="M3 1 L7 5 L3 9"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.4"
            />
          </svg>
        </span>
        <h3
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, letterSpacing: '-0.01em' }}
        >
          {title}
        </h3>
        {count !== undefined ? (
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: tokens.muted }}
          >
            {count}
          </span>
        ) : null}
        {hint ? (
          <span className="text-[11.5px]" style={{ color: tokens.muted }}>
            {hint}
          </span>
        ) : null}
      </summary>
      <div>{children}</div>
    </details>
  );
}

// ── show-more pill ─────────────────────────────────────────────

function ShowMoreButton({
  expanded,
  onToggle,
  hiddenCount,
}: {
  expanded: boolean;
  onToggle: () => void;
  hiddenCount: number;
}) {
  return (
    <button
      className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors"
      onClick={onToggle}
      style={{
        background: 'transparent',
        border: `1px solid ${tokens.border}`,
        borderRadius: 4,
        color: tokens.textDim,
        cursor: 'pointer',
      }}
      type="button"
    >
      {expanded ? `Show fewer` : `Show all · +${hiddenCount} more`}
    </button>
  );
}

function RunnerPanel({
  label,
  short,
  color,
  sessions,
  tokens: tokenCount,
  lastSummary,
  lastAt,
}: {
  label: string;
  short: string;
  color: string;
  sessions: number;
  tokens: number;
  lastSummary: string;
  lastAt: number | null;
}) {
  const has = sessions > 0;
  return (
    <div
      style={{
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        padding: '14px 16px',
      }}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: color,
              transform: 'translateY(-1px)',
              display: 'inline-block',
            }}
          />
          <span
            className="text-[13px] font-semibold"
            style={{ color: tokens.text }}
          >
            {label}
          </span>
          <span
            className="font-mono text-[11px]"
            style={{ color: tokens.muted }}
          >
            {short}
          </span>
        </div>
        <span
          className="font-mono text-[10.5px] tabular-nums"
          style={{ color: tokens.muted }}
        >
          {has ? formatRelativeTime(lastAt) : '—'}
        </span>
      </div>

      <div
        className="mt-2.5 flex items-baseline gap-5 font-mono tabular-nums"
        style={{ color: tokens.text }}
      >
        <span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{sessions}</span>
          <span
            className="ml-1"
            style={{ fontSize: 11, color: tokens.muted, fontWeight: 400 }}
          >
            sessions
          </span>
        </span>
        <span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>
            {formatTokens(tokenCount)}
          </span>
          <span
            className="ml-1"
            style={{ fontSize: 11, color: tokens.muted, fontWeight: 400 }}
          >
            tokens
          </span>
        </span>
      </div>

      <div
        className="mt-2.5 text-[12px] leading-snug"
        style={{
          color: has ? tokens.textDim : tokens.dim,
          fontStyle: has ? 'normal' : 'italic',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '2.6em',
        }}
      >
        {has ? lastSummary || '(no summary)' : 'no sessions yet'}
      </div>
    </div>
  );
}

// ── sessions table ─────────────────────────────────────────────

function SessionsTable({
  history,
  limit,
}: {
  history: MonitorProject['history'];
  limit?: number;
}) {
  if (history.length === 0) {
    return (
      <div
        className="text-[12px] italic px-4 py-6"
        style={{
          color: tokens.dim,
          background: tokens.bg,
          border: `1px dashed ${tokens.border}`,
          borderRadius: 6,
          textAlign: 'center',
        }}
      >
        no sessions yet
      </div>
    );
  }
  const items = limit ? history.slice(0, limit) : history;
  return (
    <div
      style={{
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* table header */}
      <div
        className="grid items-center px-4 py-2 text-[10px] uppercase tracking-[0.08em]"
        style={{
          gridTemplateColumns: '60px 38px 70px 70px minmax(0, 1fr)',
          gap: 14,
          color: tokens.muted,
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        <span>When</span>
        <span>Who</span>
        <span style={{ textAlign: 'right' }}>Duration</span>
        <span style={{ textAlign: 'right' }}>Tokens</span>
        <span>Summary</span>
      </div>

      {/* rows */}
      {items.map((h, i) => {
        const isCC = h.runner === 'claude';
        const color = isCC ? tokens.claude : tokens.codex;
        const totalTok = h.tokensIn + h.tokensOut;
        return (
          <div
            className="dp-session-row grid items-center px-4 py-2"
            key={h.sessionId}
            style={{
              gridTemplateColumns: '60px 38px 70px 70px minmax(0, 1fr)',
              gap: 14,
              borderTop: i === 0 ? 'none' : `1px solid ${tokens.divider}`,
              transition: 'background-color .12s ease',
            }}
          >
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: tokens.muted }}
            >
              {formatRelativeTime(h.startedAt)}
            </span>
            <span
              className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase"
              style={{ color, fontWeight: 600, letterSpacing: 0.04 }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: color,
                  display: 'inline-block',
                }}
              />
              {isCC ? 'cc' : 'cx'}
            </span>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: tokens.textDim, textAlign: 'right' }}
            >
              {formatDuration(h.duration)}
            </span>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: tokens.textDim, textAlign: 'right' }}
            >
              {formatTokens(totalTok)}
            </span>
            <span
              className="text-[12px] truncate"
              style={{ color: tokens.text, minWidth: 0 }}
              title={h.summary}
            >
              {h.summary || (
                <span style={{ color: tokens.dim, fontStyle: 'italic' }}>
                  (no summary)
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── commits list ───────────────────────────────────────────────

function CommitsList({
  commits,
}: {
  commits: NonNullable<MonitorProject['git']>['recentCommits'];
}) {
  if (!commits || commits.length === 0) {
    return (
      <div
        className="text-[11.5px] italic px-4 py-4"
        style={{
          color: tokens.dim,
          background: tokens.bg,
          border: `1px dashed ${tokens.border}`,
          borderRadius: 6,
          textAlign: 'center',
        }}
      >
        no commits yet
      </div>
    );
  }
  return (
    <div
      style={{
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {commits.map((c, i) => (
        <div
          className="flex items-baseline gap-3 px-4 py-2"
          key={c.hash}
          style={{
            borderTop: i === 0 ? 'none' : `1px solid ${tokens.divider}`,
          }}
        >
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: tokens.dim, flexShrink: 0, width: 56 }}
          >
            {c.hash}
          </span>
          <span
            className="text-[12px] truncate"
            style={{ color: tokens.textDim, minWidth: 0 }}
            title={c.message}
          >
            {c.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── file rows (VS Code SC style) ────────────────────────────────

function FileList({
  files,
  status,
  emptyText,
}: {
  files: string[];
  status: 'uncommitted' | 'committed';
  emptyText: string;
}) {
  if (files.length === 0) {
    return (
      <div
        className="text-[11.5px] italic px-4 py-4"
        style={{
          color: tokens.dim,
          background: tokens.bg,
          border: `1px dashed ${tokens.border}`,
          borderRadius: 6,
          textAlign: 'center',
        }}
      >
        {emptyText}
      </div>
    );
  }
  const isUncommitted = status === 'uncommitted';
  return (
    <div
      style={{
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {files.map((f, i) => (
        <div
          className="flex items-center gap-2.5 px-3 py-1.5"
          key={f}
          style={{
            borderTop: i === 0 ? 'none' : `1px solid ${tokens.divider}`,
            opacity: isUncommitted ? 1 : 0.85,
          }}
        >
          <FileIcon path={f} />
          <span
            className="font-mono text-[11.5px] truncate"
            style={{
              color: isUncommitted ? tokens.text : tokens.textDim,
              minWidth: 0,
            }}
            title={f}
          >
            {f}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── public component ───────────────────────────────────────────

const SESSIONS_DEFAULT = 5;
const RECENT_FILES_DEFAULT = 8;

export function ProjectJournal({ project }: { project: MonitorProject }) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllRecentFiles, setShowAllRecentFiles] = useState(false);

  const lastTouched = lastTouchedAt(project);
  const alive = isAlive(project);
  const totalTok = project.tokens.in + project.tokens.out;

  // 准确的 per-runner token 总量(server 端基于全部 sessions,不依赖 history[20])
  const ccTok = project.runners.cc.tokensIn + project.runners.cc.tokensOut;
  const cxTok = project.runners.cx.tokensIn + project.runners.cx.tokensOut;

  const git = project.git;
  const uncommittedFiles = git?.uncommittedFiles ?? [];
  const recentFiles = project.recentFiles; // Files section 内部自己 slice
  const dirty = git?.uncommitted ?? 0;
  const ahead = git?.ahead ?? 0;
  const lastCommitMsg = git?.recentCommits?.[0]?.message ?? '—';

  return (
    <div className="flex flex-col gap-6">
      {/* ── 1. Hero ───────────────────────────────────── */}
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className="text-[28px] font-semibold tracking-tight"
            style={{ color: tokens.text, letterSpacing: '-0.02em' }}
          >
            {project.name}
          </h1>
          <StatusBadge alive={alive} stage={project.stage || '—'} />
        </div>
        <div
          className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]"
          style={{ color: tokens.muted }}
        >
          <span className="font-mono tabular-nums">
            {project.branch || 'main'}
          </span>
          <span style={{ color: tokens.dim }}>·</span>
          <span>
            last touched{' '}
            <span style={{ color: tokens.textDim }}>
              {lastTouched ? formatRelativeTime(lastTouched) : 'no activity'}
            </span>
          </span>
          {ahead > 0 ? (
            <>
              <span style={{ color: tokens.dim }}>·</span>
              <span style={{ color: tokens.textDim }}>{ahead} ahead</span>
            </>
          ) : null}
        </div>
      </header>

      {/* ── 2. KPI grid ───────────────────────────────── */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}
      >
        <KpiCard
          hint={`${project.runners.cc.sessionCount} cc · ${project.runners.cx.sessionCount} cx`}
          label="Sessions"
          value={String(project.tokens.sessions)}
        />
        <KpiCard
          hint={`${formatTokens(ccTok)} cc · ${formatTokens(cxTok)} cx`}
          label="Tokens"
          value={formatTokens(totalTok)}
        />
        <KpiCard
          accent={dirty > 0 ? tokens.warn : tokens.text}
          hint={dirty > 0 ? 'in working tree' : 'working tree clean'}
          label="Uncommitted"
          value={String(dirty)}
        />
        <KpiCard
          hint={lastCommitMsg.slice(0, 40)}
          label="Last commit"
          value={git?.recentCommits?.[0]?.hash ?? '—'}
        />
      </div>

      {/* ── 3. CC vs CX(始终显示 — 这是核心答案,不折叠)── */}
      <section>
        <SectionHead title="Claude vs Codex" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RunnerPanel
            color={tokens.claude}
            label="Claude"
            lastAt={project.runners.cc.lastAt}
            lastSummary={project.runners.cc.lastSummary}
            sessions={project.runners.cc.sessionCount}
            short="cc"
            tokens={ccTok}
          />
          <RunnerPanel
            color={tokens.codex}
            label="Codex"
            lastAt={project.runners.cx.lastAt}
            lastSummary={project.runners.cx.lastSummary}
            sessions={project.runners.cx.sessionCount}
            short="cx"
            tokens={cxTok}
          />
        </div>
      </section>

      {/* ── 4. Sessions(默认展开,内部 5 条,可"显示全部")── */}
      <Collapsible
        count={project.history.length}
        defaultOpen
        hint={`newest first · top ${Math.min(SESSIONS_DEFAULT, project.history.length)} of ${project.history.length}`}
        title="Sessions"
      >
        <SessionsTable
          history={project.history}
          limit={showAllSessions ? undefined : SESSIONS_DEFAULT}
        />
        {project.history.length > SESSIONS_DEFAULT ? (
          <ShowMoreButton
            expanded={showAllSessions}
            hiddenCount={project.history.length - SESSIONS_DEFAULT}
            onToggle={() => setShowAllSessions((v) => !v)}
          />
        ) : null}
      </Collapsible>

      {/* ── 5. Files(默认折叠 — 数据量大,默认只显示 count)── */}
      <Collapsible
        count={uncommittedFiles.length + recentFiles.length}
        defaultOpen={false}
        hint={
          uncommittedFiles.length > 0
            ? `${uncommittedFiles.length} uncommitted · ${recentFiles.length} in history`
            : `${recentFiles.length} in history · click to expand`
        }
        title="Files"
      >
        <div className="flex flex-col gap-4">
          {uncommittedFiles.length > 0 ? (
            <div>
              <h4
                className="mb-1.5 text-[10.5px] font-medium"
                style={{ color: tokens.warn }}
              >
                Uncommitted
                <span
                  className="ml-2 font-mono"
                  style={{ color: tokens.muted, fontWeight: 400 }}
                >
                  · in working tree
                </span>
              </h4>
              <FileList
                emptyText="working tree clean"
                files={uncommittedFiles.slice(0, 30)}
                status="uncommitted"
              />
            </div>
          ) : null}
          <div>
            <h4
              className="mb-1.5 text-[10.5px] font-medium"
              style={{ color: tokens.muted }}
            >
              Recently touched
              <span
                className="ml-2 font-mono"
                style={{ color: tokens.dim, fontWeight: 400 }}
              >
                · last 20 commits
              </span>
            </h4>
            <FileList
              emptyText="no files in history"
              files={
                showAllRecentFiles
                  ? recentFiles
                  : recentFiles.slice(0, RECENT_FILES_DEFAULT)
              }
              status="committed"
            />
            {recentFiles.length > RECENT_FILES_DEFAULT ? (
              <ShowMoreButton
                expanded={showAllRecentFiles}
                hiddenCount={recentFiles.length - RECENT_FILES_DEFAULT}
                onToggle={() => setShowAllRecentFiles((v) => !v)}
              />
            ) : null}
          </div>
        </div>
      </Collapsible>

      {/* ── 6. Commits(默认展开,只 3 条不需要折叠 size)── */}
      <Collapsible
        count={git?.recentCommits?.length ?? 0}
        defaultOpen
        hint="git log -3"
        title="Commits"
      >
        <CommitsList commits={git?.recentCommits ?? []} />
      </Collapsible>
    </div>
  );
}

// ── sort helper ────────────────────────────────────────────────

export function projectByLastTouched(
  a: MonitorProject,
  b: MonitorProject,
): number {
  const aT = lastTouchedAt(a) ?? 0;
  const bT = lastTouchedAt(b) ?? 0;
  return bT - aT;
}
