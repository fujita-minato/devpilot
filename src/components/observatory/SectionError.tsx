'use client';

import { tokens } from './tokens';
import { Icon } from './primitives/Icons';

export function SectionError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div
      className="mb-6 flex items-center justify-between gap-4 rounded-md px-4 py-3"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        color: tokens.muted,
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon
          name="alert"
          size={14}
          strokeWidth={1.75}
          style={{ color: tokens.warn }}
        />
        <span className="truncate text-[12px]">{message}</span>
      </div>
      <button
        className="dp-icon-btn shrink-0 rounded px-3 py-1 text-[11px] font-medium"
        onClick={retry}
        style={{ color: tokens.textDim }}
        type="button"
      >
        retry
      </button>
    </div>
  );
}
