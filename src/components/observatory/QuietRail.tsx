'use client';

// QuietRail — branches that stopped producing signal. Each row: severity
// glyph + project/branch + reason + last-commit-relative. Clicking opens the
// project drawer so the user can investigate.

import { tokens } from './tokens';
import type { QuietBranch } from '@/lib/observatory/types';
import { formatRelativeTime, Mono } from './primitives/shared';

export function QuietRail({
  items,
  onOpen,
}: {
  items: QuietBranch[];
  onOpen: (q: QuietBranch) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2
          className="text-[13px] font-semibold"
          style={{ color: tokens.text, letterSpacing: -0.1 }}
        >
          quiet branches
        </h2>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {items.length}
        </Mono>
      </div>

      {items.length === 0 ? (
        <div
          className="px-4 py-5 text-center text-[11px]"
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
            color: tokens.dim,
          }}
        >
          all branches producing signal
        </div>
      ) : (
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 6,
          }}
        >
          {items.map((q, i) => (
            <QuietRow
              isLast={i === items.length - 1}
              key={`${q.projectId}-${q.branch}`}
              onOpen={() => onOpen(q)}
              quiet={q}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuietRow({
  quiet,
  isLast,
  onOpen,
}: {
  quiet: QuietBranch;
  isLast: boolean;
  onOpen: () => void;
}) {
  const severityColor = quiet.severity === 'warn' ? tokens.warn : tokens.muted;
  return (
    <button
      className="dp-row flex w-full items-start gap-3 px-4 py-3 text-left"
      onClick={onOpen}
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${tokens.divider}`,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        style={{
          color: severityColor,
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        ⚠
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="truncate text-[12px] font-medium"
            style={{ color: tokens.text }}
          >
            {quiet.projectName}
          </span>
          <Mono
            className="truncate text-[10px]"
            style={{ color: tokens.muted }}
          >
            {quiet.branch}
          </Mono>
        </div>
        <div
          className="mt-1 text-[11px]"
          style={{ color: tokens.textDim, lineHeight: 1.45 }}
        >
          {quiet.reason}
        </div>
      </div>
      <Mono
        className="shrink-0 text-[10px]"
        style={{ color: tokens.dim, paddingTop: 2 }}
      >
        {formatRelativeTime(quiet.lastCommit)}
      </Mono>
    </button>
  );
}
