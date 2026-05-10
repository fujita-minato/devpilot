'use client';

// ActiveNowPanel — right-rail live panel. Pulsing dot in the header when
// there are live sessions; mutes when idle. Each session shows runner +
// project + what it's doing + token volume + start time.

import { tokens } from './tokens';
import type { ActiveSession } from '@/lib/observatory/types';
import {
  formatRelativeTime,
  formatTokens,
  Mono,
  runnerColor,
  runnerShort,
} from './primitives/shared';

export function ActiveNowPanel({ sessions }: { sessions: ActiveSession[] }) {
  const live = sessions.length > 0;

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <div className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            style={{
              animation: live ? 'dp-pulse 1.6s ease-in-out infinite' : 'none',
              background: live ? tokens.brand : tokens.dim,
              borderRadius: 99,
              display: 'inline-block',
              height: 7,
              width: 7,
            }}
          />
          <h2
            className="text-[13px] font-semibold"
            style={{ color: tokens.text, letterSpacing: -0.1 }}
          >
            active now
          </h2>
        </div>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {sessions.length}
        </Mono>
      </div>

      {!live ? (
        <div
          className="px-4 py-5 text-center text-[11px]"
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            color: tokens.dim,
          }}
        >
          nothing running
        </div>
      ) : (
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
          }}
        >
          {sessions.map((s, i) => (
            <ActiveRow
              isLast={i === sessions.length - 1}
              key={s.sessionId}
              session={s}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActiveRow({
  session,
  isLast,
}: {
  session: ActiveSession;
  isLast: boolean;
}) {
  return (
    <div
      className="px-4 py-3"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${tokens.divider}`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Mono
              className="text-[11px] font-medium"
              style={{ color: runnerColor(session.runner) }}
            >
              {runnerShort(session.runner)}
            </Mono>
            <span
              className="truncate text-[12px] font-medium"
              style={{ color: tokens.text }}
            >
              {session.projectName}
            </span>
          </div>
          <div
            className="mt-1.5 truncate text-[11px]"
            style={{ color: tokens.textDim, lineHeight: 1.4 }}
          >
            {session.nowDoing ?? 'idle'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Mono
            className="text-[11px] font-medium"
            style={{ color: tokens.text }}
          >
            {formatTokens(session.tokensIn + session.tokensOut)}
          </Mono>
          <div className="mt-0.5 text-[10px]" style={{ color: tokens.muted }}>
            <Mono>{formatRelativeTime(session.startedAt)}</Mono>
          </div>
        </div>
      </div>
    </div>
  );
}
