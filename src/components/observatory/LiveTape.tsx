'use client';

// LiveTape — terminal log of the most recent activity events.
// Fully monospace: HH:MM | runner | project | kind | text.
// Color only on runner glyph and kind severity. Row height is tight (28px)
// so the tape can show ~12 events before scrolling.

import { tokens } from './tokens';
import type { ActivityEvent, ActivityKind } from '@/lib/observatory/types';
import {
  eventKindLabel,
  Mono,
  runnerColor,
  runnerShort,
} from './primitives/shared';

function kindColor(kind: ActivityKind): string {
  switch (kind) {
    case 'build.failed':
    case 'session.error':
      return tokens.danger;
    case 'stalled.detected':
      return tokens.warn;
    case 'commit.pushed':
      return tokens.success;
    default:
      return tokens.textDim;
  }
}

function formatTapeTime(at: number): string {
  const d = new Date(at);
  const now = Date.now();
  const diff = now - at;

  // today → HH:MM
  if (diff < 86_400_000 && d.getDate() === new Date(now).getDate()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  // within a week → Nd ago (compact)
  if (diff < 604_800_000) {
    const days = Math.max(1, Math.floor(diff / 86_400_000));
    return `${days}d ago`;
  }
  // else → MM/DD HH:MM
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function LiveTape({ events }: { events: ActivityEvent[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, letterSpacing: -0.1 }}
        >
          live tape
        </h2>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {events.length}
        </Mono>
        <span className="text-[11px]" style={{ color: tokens.muted }}>
          · events in window
        </span>
      </div>

      {events.length === 0 ? (
        <div
          className="px-4 py-8 text-center text-[11px]"
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            color: tokens.dim,
          }}
        >
          no events in window
        </div>
      ) : (
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {events.map((e, i) => (
            <TapeRow event={e} isLast={i === events.length - 1} key={e.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function TapeRow({ event, isLast }: { event: ActivityEvent; isLast: boolean }) {
  const color = event.runner ? runnerColor(event.runner) : tokens.muted;
  const glyph = event.runner ? runnerShort(event.runner) : '·';
  const kindC = kindColor(event.kind);

  return (
    <div
      className="dp-row grid items-baseline gap-3 px-4"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${tokens.divider}`,
        gridTemplateColumns: '72px 26px minmax(0, 1.1fr) 140px minmax(0, 2.4fr)',
        padding: '9px 16px',
      }}
    >
      <Mono className="text-[11px]" style={{ color: tokens.dim }}>
        {formatTapeTime(event.at)}
      </Mono>
      <Mono
        className="text-[11px] font-medium"
        style={{ color }}
      >
        {glyph}
      </Mono>
      <Mono className="truncate text-[11px]" style={{ color: tokens.textDim }}>
        {event.projectName}
      </Mono>
      <Mono
        className="truncate text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: kindC }}
      >
        {eventKindLabel(event.kind)}
      </Mono>
      <span
        className="truncate text-[12px]"
        style={{ color: tokens.text, lineHeight: 1.4 }}
      >
        {event.text}
      </span>
    </div>
  );
}
