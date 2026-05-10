'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { WeeklyReportResult } from '@/lib/reports/weekly';

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(0)}`;
}

export default function WeeklyReportPage() {
  const [report, setReport] = useState<WeeklyReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reports/weekly');
      if (!response.ok) throw new Error(`/api/reports/weekly failed with ${response.status}`);
      setReport((await response.json()) as WeeklyReportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const generate = async () => {
    setSaving(true);
    setError(null);
    setSavedPath(null);
    try {
      const response = await fetch('/api/reports/weekly', { method: 'POST' });
      if (!response.ok) throw new Error(`report write failed with ${response.status}`);
      const nextReport = (await response.json()) as WeeklyReportResult;
      setReport(nextReport);
      setSavedPath(nextReport.outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
            weekly report
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-gray-100">
            AI spend, output, and project movement.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Local markdown report generated from SQLite sessions, pricing, decisions, and authorship data.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="inline-flex h-9 items-center rounded border border-gray-800 px-3 text-xs font-medium text-gray-400 hover:text-white"
            href="/graph"
          >
            Open graph
          </Link>
          <button
            className="inline-flex h-9 items-center rounded bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-50"
            disabled={saving || loading}
            onClick={generate}
            type="button"
          >
            {saving ? 'Generating…' : 'Generate markdown'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {savedPath ? (
        <div className="mt-6 rounded border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Wrote {savedPath}
        </div>
      ) : null}

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Projects" value={String(report?.metrics.projectsTouched ?? '—')} />
        <Metric label="Sessions" value={String(report?.metrics.sessions ?? '—')} />
        <Metric label="Tokens" value={report ? formatTokens(report.metrics.tokens) : '—'} />
        <Metric label="Spend" value={report ? formatUsd(report.metrics.costUsd) : '—'} />
        <Metric label="AI lines" value={String(report?.metrics.aiLines ?? '—')} />
      </div>

      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-h-[580px] overflow-hidden rounded-lg border border-gray-850 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-850 px-4 py-3">
            <span className="font-mono text-xs text-gray-500">
              {report ? `docs/weekly/${report.filename}` : 'loading report'}
            </span>
            <button
              className="text-xs text-gray-500 hover:text-gray-200"
              onClick={() => void loadReport()}
              type="button"
            >
              Refresh preview
            </button>
          </div>
          <pre className="max-h-[calc(100vh-270px)] min-h-[520px] overflow-auto whitespace-pre-wrap px-5 py-4 text-[12px] leading-6 text-gray-300">
            {loading ? 'Loading report…' : report?.markdown ?? 'No report data.'}
          </pre>
        </div>

        <aside className="rounded-lg border border-gray-850 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Top Projects</h2>
          <div className="mt-4 space-y-3">
            {report?.byProject.slice(0, 7).map((project) => (
              <div className="rounded border border-gray-850 bg-gray-950/50 p-3" key={project.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-gray-200">{project.name}</span>
                  <span className="font-mono text-xs text-orange-300">{formatUsd(project.costUsd)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
                  <span>{project.sessions} sessions</span>
                  <span>{formatTokens(project.tokens)}</span>
                </div>
              </div>
            )) ?? (
              <div className="text-sm text-gray-600">No project rows.</div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-850 bg-gray-900 px-4 py-3">
      <div className="font-mono text-2xl text-gray-100">{value}</div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
        {label}
      </div>
    </div>
  );
}
