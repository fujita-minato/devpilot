'use client';

// Mast — thin top strip. Brand anchor on the left, live ingest pulse on the right.
// Intentionally slim (36px) so the page body gets maximum vertical budget.

import { tokens } from './tokens';
import { Mono } from './primitives/shared';
import type { IngestHealth } from '@/lib/observatory/types';

export function Mast({ ingest }: { ingest: IngestHealth }) {
  const lag = Math.max(0, Math.round(ingest.laggingSeconds));
  const lagDisplay = lag < 60 ? `${lag}s` : `${Math.round(lag / 60)}m`;
  const live = ingest.watchers > 0 && lag < 60;
  const idle = ingest.watchers === 0;
  const status = live ? 'live' : idle ? 'idle' : 'lagging';
  const statusColor = live ? tokens.success : idle ? tokens.dim : tokens.warn;

  return (
    <header
      className="flex items-center justify-between px-8"
      style={{
        background: tokens.bg,
        borderBottom: `1px solid ${tokens.border}`,
        height: 36,
      }}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          aria-hidden="true"
          style={{
            background: tokens.brand,
            borderRadius: 2,
            display: 'inline-block',
            height: 7,
            transform: 'translateY(-1px)',
            width: 7,
          }}
        />
        <span
          className="text-[12px] font-semibold"
          style={{ color: tokens.text, letterSpacing: -0.1 }}
        >
          devpilot
        </span>
        <span style={{ color: tokens.dim }}>·</span>
        <span
          className="text-[10px] font-medium uppercase tracking-[0.18em]"
          style={{ color: tokens.muted }}
        >
          AI work observatory
        </span>
      </div>

      <div className="flex items-center gap-5">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em]"
          style={{ color: tokens.textDim }}
        >
          <span
            aria-hidden="true"
            style={{
              animation: live ? 'dp-pulse 1.8s ease-in-out infinite' : 'none',
              background: statusColor,
              borderRadius: 99,
              height: 6,
              width: 6,
            }}
          />
          {status}
        </span>
        <span className="text-[11px]" style={{ color: tokens.muted }}>
          ingest <Mono style={{ color: live ? tokens.textDim : statusColor }}>{lagDisplay}</Mono>
          <span style={{ color: tokens.dim }}> · </span>
          <Mono style={{ color: tokens.textDim }}>{ingest.watchers}</Mono> watchers
        </span>
      </div>
    </header>
  );
}
