'use client';

// RateLimitRail — compact rate-limit panel for the right rail.
// Each row: runner code + window label | usedPct | 3px fill bar | reset hint.
// Warn tone (orange) when usage crosses 80%.

import { tokens } from './tokens';
import type { RateLimitWindow } from '@/lib/observatory/types';
import { Mono, runnerColor, runnerShort } from './primitives/shared';

function formatReset(windowEnd: number): string {
  const ms = windowEnd - Date.now();
  if (ms <= 0) return 'expired';
  if (ms > 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
  if (ms > 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

export function RateLimitRail({ windows }: { windows: RateLimitWindow[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, letterSpacing: -0.1 }}
        >
          rate limits
        </h2>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {windows.length}
        </Mono>
      </div>

      {windows.length === 0 ? (
        <div
          className="px-4 py-5 text-center text-[11px]"
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            color: tokens.dim,
          }}
        >
          no rate-limit data
        </div>
      ) : (
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
          }}
        >
          {windows.map((w, i) => (
            <RateRow
              isLast={i === windows.length - 1}
              key={`${w.provider}-${w.label}-${i}`}
              window={w}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RateRow({
  window,
  isLast,
}: {
  window: RateLimitWindow;
  isLast: boolean;
}) {
  const used = window.unknown
    ? null
    : Math.max(0, Math.min(100, Math.round(window.usedPct)));
  const hot = used !== null && used >= 80;
  const runnerC = runnerColor(window.provider);
  const fillC = hot ? tokens.warn : runnerC;

  // strip redundant prefix so "Claude 5h" displays just as "5h"
  const cleanLabel = window.label.replace(/^(Claude|Codex)\s+/i, '');

  return (
    <div
      className="px-4 py-3"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${tokens.divider}`,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <Mono className="text-[11px] font-medium" style={{ color: runnerC }}>
            {runnerShort(window.provider)}
          </Mono>
          <span className="text-[11px]" style={{ color: tokens.textDim }}>
            {cleanLabel}
          </span>
        </div>
        <Mono
          className="text-[12px] font-medium"
          style={{ color: hot ? tokens.warn : tokens.text }}
        >
          {used === null ? '—' : `${used}%`}
        </Mono>
      </div>

      <div
        aria-hidden="true"
        style={{
          background: tokens.faint,
          borderRadius: 2,
          height: 3,
          overflow: 'hidden',
        }}
      >
        {used !== null ? (
          <div
            style={{
              background: fillC,
              borderRadius: 2,
              height: '100%',
              opacity: hot ? 1 : 0.85,
              transition: 'width .25s ease',
              width: `${used}%`,
            }}
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tokens.muted }}>
          resets in
        </span>
        <Mono className="text-[10px]" style={{ color: tokens.textDim }}>
          {formatReset(window.windowEnd)}
        </Mono>
      </div>
    </div>
  );
}
