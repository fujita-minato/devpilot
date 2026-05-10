'use client';

// NumbersHero — typographic display of the four numbers that matter most.
// Cost in brand color at the largest size, then today·sessions, now·active,
// last·signal. Everything mono + tabular-nums for the numbers themselves;
// Inter uppercase kicker for labels. No borders, no cards — pure typography.

import type { ReactNode } from 'react';
import { tokens } from './tokens';
import type { ActiveSession, LastSignal } from '@/lib/observatory/types';
import {
  eventKindLabel,
  formatCostUsd,
  formatRelativeTime,
  Mono,
} from './primitives/shared';

export function NumbersHero({
  todayCostUsd,
  todaySessions,
  activeSessions,
  lastSignal,
}: {
  todayCostUsd: number | null;
  todaySessions: number;
  activeSessions: ActiveSession[];
  lastSignal: LastSignal | null;
}) {
  return (
    <section
      className="grid items-end gap-12 pt-10 pb-9"
      style={{
        borderBottom: `1px solid ${tokens.border}`,
        gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr)',
      }}
    >
      <HeroSlot
        label="spend today"
        size="xl"
        tone="brand"
        value={todayCostUsd === null ? '—' : formatCostUsd(todayCostUsd)}
      />
      <HeroSlot label="sessions today" size="lg" value={String(todaySessions)} />
      <HeroSlot
        label="running now"
        size="lg"
        tone={activeSessions.length > 0 ? 'live' : 'default'}
        value={String(activeSessions.length)}
      />
      <HeroSlot
        footer={
          lastSignal ? (
            <>
              <Mono>{lastSignal.projectName}</Mono>
              <span style={{ color: tokens.muted }}> · {eventKindLabel(lastSignal.kind)}</span>
            </>
          ) : (
            <span style={{ color: tokens.dim }}>waiting for events</span>
          )
        }
        label="latest change"
        size="md"
        value={lastSignal ? formatRelativeTime(lastSignal.at) : '—'}
      />
    </section>
  );
}

type HeroSize = 'xl' | 'lg' | 'md';
type HeroTone = 'default' | 'brand' | 'live';

function HeroSlot({
  label,
  value,
  size,
  tone = 'default',
  footer,
}: {
  label: string;
  value: string;
  size: HeroSize;
  tone?: HeroTone;
  footer?: ReactNode;
}) {
  const fontSize = size === 'xl' ? 64 : size === 'lg' ? 44 : 26;
  const letter = size === 'xl' ? -1.6 : size === 'lg' ? -1 : -0.5;
  const color = tone === 'brand' ? tokens.brand : tone === 'live' ? tokens.text : tokens.text;

  return (
    <div>
      <div
        className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em]"
        style={{ color: tokens.muted }}
      >
        {tone === 'live' ? (
          <span
            aria-hidden="true"
            style={{
              animation: 'dp-pulse 1.6s ease-in-out infinite',
              background: tokens.brand,
              borderRadius: 99,
              display: 'inline-block',
              height: 6,
              width: 6,
            }}
          />
        ) : null}
        {label}
      </div>
      <Mono
        className="block"
        style={{
          color,
          fontSize,
          fontWeight: 500,
          letterSpacing: letter,
          lineHeight: 0.92,
        }}
      >
        {value}
      </Mono>
      {footer ? (
        <div className="mt-2 truncate text-[11px]" style={{ color: tokens.textDim }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
