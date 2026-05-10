'use client';

import type { CSSProperties, ReactNode } from 'react';
import { tokens } from '../tokens';
import type { Runner, Stage } from '@/lib/observatory/types';
import { Icon } from './Icons';

export type TimeWindow = '4h' | '24h' | '7d';

export function Mono({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`tabular-nums ${className}`}
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", ...style }}
    >
      {children}
    </span>
  );
}

// ─── Runner helpers ─────────────────────────────────────────────

export function runnerColor(runner: Runner | null) {
  if (runner === 'claude') return tokens.claude;
  if (runner === 'codex') return tokens.codex;
  return tokens.muted;
}

export function runnerSoft(runner: Runner | null) {
  if (runner === 'claude') return tokens.claudeSoft;
  if (runner === 'codex') return tokens.codexSoft;
  return tokens.raised;
}

export function runnerHi(runner: Runner | null) {
  if (runner === 'claude') return tokens.claudeHi;
  if (runner === 'codex') return tokens.codexHi;
  return tokens.borderStrong;
}

export function runnerLabel(runner: Runner | null) {
  if (runner === 'claude') return 'claude';
  if (runner === 'codex') return 'codex';
  return 'unknown';
}

export function runnerShort(runner: Runner | null) {
  if (runner === 'claude') return 'cc';
  if (runner === 'codex') return 'cx';
  return '—';
}

// Small text tag — no filled pill, just colored dot + mono short-code.
// Readable at 10px, visually quiet, matches terminal aesthetic.
export function RunnerTag({ runner }: { runner: Runner | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium tabular-nums"
      style={{ color: runnerColor(runner), fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
    >
      <span
        aria-hidden="true"
        style={{ background: runnerColor(runner), borderRadius: 99, height: 5, width: 5 }}
      />
      {runnerShort(runner)}
    </span>
  );
}

// Stage shown as dot + uppercase label, no box. Uses color for stage, not decoration.
export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tokens.textDim }}
    >
      <span
        aria-hidden="true"
        style={{ background: stageColor(stage), borderRadius: 99, height: 6, width: 6 }}
      />
      {stage}
    </span>
  );
}

export function SectionHeader({
  title,
  count,
  hint,
  action,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, letterSpacing: -0.1 }}
        >
          {title}
        </h2>
        {count !== undefined ? (
          <span className="text-[11px] tabular-nums" style={{ color: tokens.muted }}>
            {count}
          </span>
        ) : null}
        {hint ? (
          <span className="truncate text-[11px]" style={{ color: tokens.muted }}>
            {hint}
          </span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active = false,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={title}
      className="dp-icon-btn inline-flex h-7 w-7 items-center justify-center rounded"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon name={icon} size={14} strokeWidth={1.5} />
    </button>
  );
}

// ─── Formatters ────────────────────────────────────────────────

export function eventKindLabel(kind: string) {
  return kind.replace('.', ' ');
}

export function formatCostUsd(value: number | null) {
  if (value === null) return '—';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

// Relative time — terminal log feel ("5m ago" not "04/22 14:30").
// Falls back to absolute date after 7d for precision.
export function formatRelativeTime(at: number | null) {
  if (!at) return '—';
  const diff = Date.now() - at;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
  if (abs < 604_800_000) return `${Math.floor(abs / 86_400_000)}d ago`;
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function primaryRunner(mix: { claude: number; codex: number }): Runner {
  if (mix.claude === 0 && mix.codex === 0) return 'unknown';
  return mix.claude >= mix.codex ? 'claude' : 'codex';
}

export function stageColor(stage: Stage) {
  switch (stage) {
    case 'think':
      return tokens.muted;
    case 'review':
      return tokens.warn;
    case 'build':
      return tokens.brand;
    case 'test':
      return tokens.codex;
    case 'done':
      return tokens.success;
    case 'unknown':
      return tokens.dim;
  }
}
