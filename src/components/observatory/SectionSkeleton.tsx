'use client';

import { tokens } from './tokens';

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="mb-6 rounded-lg p-5"
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, boxShadow: tokens.shadow1 }}
    >
      <div className="mb-4 h-4 w-40 rounded" style={{ background: tokens.raised }} />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="h-24 rounded-md" key={index} style={{ background: tokens.bg, border: `1px solid ${tokens.border}` }} />
        ))}
      </div>
    </div>
  );
}
