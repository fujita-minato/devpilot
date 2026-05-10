'use client';

// TopNav — 顶部 thin nav,Vercel 风。
//   左:logo + 产品名 + 路径(breadcrumb)
//   右:全局指标 + refresh
// 高度固定 52px,sticky。下面紧贴 main 内容,无大标题区。

import { Icon } from './primitives/Icons';
import { formatTokens } from './primitives/shared';
import { tokens } from './tokens';

interface GlobalStats {
  projects: number;
  hot: number;
  sessions7d: number;
  tokens7d: number;
}

export function TopNav({
  projectName,
  stats,
  loading,
  onRefresh,
}: {
  projectName: string | null;
  stats: GlobalStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30"
      style={{
        background: tokens.bg,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <div
        className="mx-auto flex h-[52px] items-center justify-between gap-6"
        style={{ maxWidth: 1440, paddingInline: 'clamp(16px, 3vw, 32px)' }}
      >
        {/* left: logo + breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                background: tokens.brand,
                borderRadius: 4,
                display: 'inline-block',
              }}
            />
            <span
              className="text-[13px] font-semibold tracking-tight"
              style={{ color: tokens.text }}
            >
              devpilot
            </span>
          </div>
          <span style={{ color: tokens.dim }}>/</span>
          <span
            className="text-[13px] truncate"
            style={{ color: tokens.textDim }}
          >
            {projectName ?? 'Vibecoding journal'}
          </span>
        </div>

        {/* right: stats + refresh */}
        <div className="flex items-center gap-5">
          <div
            className="hidden md:flex items-baseline gap-4 text-[11px] tabular-nums"
            style={{ color: tokens.muted }}
          >
            {[
              { label: 'projects', value: stats ? String(stats.projects) : '—' },
              {
                label: 'active',
                value: stats ? String(stats.hot) : '—',
                accent: tokens.success,
              },
              {
                label: 'sessions · 7d',
                value: stats ? String(stats.sessions7d) : '—',
              },
              {
                label: 'tokens · 7d',
                value: stats ? formatTokens(stats.tokens7d) : '—',
              },
            ].map((c) => (
              <span className="inline-flex items-baseline gap-1.5" key={c.label}>
                <span
                  className="font-mono"
                  style={{ color: c.accent ?? tokens.text, fontWeight: 600 }}
                >
                  {c.value}
                </span>
                <span>{c.label}</span>
              </span>
            ))}
          </div>
          <button
            aria-label="Refresh"
            className="inline-flex h-7 items-center gap-1.5 px-2.5 text-[11px] font-medium transition-colors"
            onClick={onRefresh}
            style={{
              background: 'transparent',
              border: `1px solid ${tokens.border}`,
              borderRadius: 4,
              color: tokens.textDim,
            }}
            type="button"
          >
            <Icon name="refresh" size={12} strokeWidth={1.7} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  );
}
