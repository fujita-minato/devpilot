'use client';

// ActivityWaveform — the dominant visual on the page.
// Full-width spike chart derived from the 7d × 24h heatmap matrix.
// Window picker reshapes the buckets:
//   4h  → last 4 hours of the most recent day
//   24h → one row of 24 hourly bars (most recent day)
//   7d  → per-day totals across the whole week
// Bars are Claude orange. Zero-activity bars stay as a 2px baseline so the
// grid stays visually anchored even on empty windows.

import { tokens } from './tokens';
import type { HeatmapMatrix } from '@/lib/observatory/types';
import { Mono } from './primitives/shared';
import type { TimeWindow } from './primitives/shared';

interface Buckets {
  values: number[];
  xLabels: Array<string | null>;
  description: string;
}

function deriveBuckets(matrix: HeatmapMatrix, window: TimeWindow): Buckets {
  const days = matrix.length ? matrix.length : 7;
  const lastDay = matrix[days - 1] ?? Array.from({ length: 24 }, () => 0);

  if (window === '4h') {
    const hours = lastDay.slice(20, 24); // last 4 hours of the most recent day
    return {
      values: hours,
      xLabels: hours.map((_, i) => String(20 + i).padStart(2, '0')),
      description: '4h · hourly',
    };
  }

  if (window === '24h') {
    return {
      values: lastDay,
      xLabels: lastDay.map((_, i) => (i % 6 === 0 ? String(i).padStart(2, '0') : null)),
      description: '24h · hourly',
    };
  }

  const perDay = matrix.map((row) => row.reduce((sum, v) => sum + v, 0));
  const dayLabels = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return {
    values: perDay,
    xLabels: perDay.map((_, i) => dayLabels[i] ?? null),
    description: '7d · daily',
  };
}

export function ActivityWaveform({
  matrix,
  window,
  onWindowChange,
}: {
  matrix: HeatmapMatrix;
  window: TimeWindow;
  onWindowChange: (w: TimeWindow) => void;
}) {
  const { values, xLabels, description } = deriveBuckets(matrix, window);
  const peak = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const HEIGHT = 140;

  return (
    <section className="pt-10 pb-6" style={{ borderBottom: `1px solid ${tokens.border}` }}>
      <div className="mb-4 flex items-end justify-between">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-[13px] font-semibold"
            style={{ color: tokens.text, letterSpacing: -0.1 }}
          >
            activity
          </h2>
          <span className="text-[11px]" style={{ color: tokens.muted }}>
            {description} · <Mono>{total}</Mono> events
          </span>
        </div>
        <WindowPicker onChange={onWindowChange} value={window} />
      </div>

      {total === 0 ? (
        <div
          className="flex h-[82px] items-center justify-between px-5"
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
          }}
        >
          <div>
            <div className="text-[13px] font-medium" style={{ color: tokens.text }}>
              No activity in this window
            </div>
            <p className="mt-1 text-[12px]" style={{ color: tokens.muted }}>
              Switch to 7d for older signals, or use the project map below to resume work.
            </p>
          </div>
          <Mono className="text-[28px] leading-none" style={{ color: tokens.dim }}>
            0
          </Mono>
        </div>
      ) : (
        <>
          <div
            aria-label="Activity waveform"
            className="flex items-end"
            role="img"
            style={{ gap: values.length > 12 ? 4 : 6, height: HEIGHT }}
          >
            {values.map((v, i) => {
              const ratio = peak === 0 ? 0 : v / peak;
              const h = Math.max(2, Math.round(ratio * HEIGHT));
              const cold = v === 0;
              return (
                <div
                  key={i}
                  style={{
                    background: cold ? tokens.faint : tokens.brand,
                    borderRadius: 2,
                    flex: 1,
                    height: h,
                    minWidth: 0,
                    opacity: cold ? 1 : 0.7 + ratio * 0.3,
                    transition: 'height .25s ease, opacity .25s ease',
                  }}
                />
              );
            })}
          </div>

          <div className="mt-2 flex items-center" style={{ gap: values.length > 12 ? 4 : 6 }}>
            {xLabels.map((label, i) => (
              <div
                key={i}
                className="text-center text-[10px]"
                style={{
                  color: label ? tokens.muted : 'transparent',
                  flex: 1,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  minWidth: 0,
                }}
              >
                {label ?? '·'}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WindowPicker({
  value,
  onChange,
}: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
}) {
  const opts: TimeWindow[] = ['4h', '24h', '7d'];
  return (
    <div
      className="inline-flex gap-0.5 rounded"
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, padding: 2 }}
    >
      {opts.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            className="dp-tab h-6 rounded px-2.5 text-[10px] font-medium uppercase tracking-[0.10em]"
            data-active={active ? 'true' : undefined}
            onClick={() => onChange(opt)}
            type="button"
          >
            <Mono>{opt}</Mono>
          </button>
        );
      })}
    </div>
  );
}
