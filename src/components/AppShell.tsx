'use client';

// AppShell 只提供顶栏，不做侧边栏
import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import Link from 'next/link';
import type { KpiResponse } from '@/app/api/kpi/route';
import { CommandPalette } from './CommandPalette';

interface LiveSession {
  pid: number;
  project: string;
  cwd: string;
  status: string;
  updatedAt: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface ShellCtx {
  live: LiveSession[];
  kpi: KpiResponse | null;
  onSync: () => void;
  syncing: boolean;
}

const ShellContext = createContext<ShellCtx>({ live: [], kpi: null, onSync: () => {}, syncing: false });
export const useShell = () => useContext(ShellContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState<LiveSession[]>([]);
  const [kpi, setKpi] = useState<KpiResponse | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchLive = useCallback(async () => {
    const [lr, kr] = await Promise.all([fetch('/api/live'), fetch('/api/kpi')]);
    if (lr.ok) setLive(await lr.json());
    if (kr.ok) setKpi(await kr.json());
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/ingest', { method: 'POST' });
      // trigger re-render in child pages by dispatching a custom event
      window.dispatchEvent(new Event('devpilot:synced'));
    } finally {
      setSyncing(false);
      await fetchLive();
    }
  }, [fetchLive]);

  useEffect(() => {
    fetchLive();
    const t = setInterval(fetchLive, 3000);
    return () => clearInterval(t);
  }, [fetchLive]);

  const totalTok = (kpi?.tokensTodayIn ?? 0) + (kpi?.tokensTodayOut ?? 0);
  const cost = kpi?.estimatedCostUsd ?? 0;
  const activeCount = live.length;

  return (
    <ShellContext.Provider value={{ live, kpi, onSync: handleSync, syncing }}>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        {/* Top bar */}
        <header className="h-11 flex-shrink-0 border-b border-gray-900 flex items-center px-5 gap-4 sticky top-0 bg-gray-950/95 backdrop-blur z-20">
          <span className="text-white font-semibold text-sm">devpilot</span>

          <div className="h-4 w-px bg-gray-800" />

          <nav className="hidden items-center gap-1 text-xs md:flex">
            <Link className="rounded px-2 py-1 text-gray-500 hover:bg-gray-900 hover:text-gray-200" href="/">
              Home
            </Link>
            <Link className="rounded px-2 py-1 text-gray-500 hover:bg-gray-900 hover:text-gray-200" href="/graph">
              Graph
            </Link>
            <Link className="rounded px-2 py-1 text-gray-500 hover:bg-gray-900 hover:text-gray-200" href="/report">
              Report
            </Link>
          </nav>

          <div className="hidden h-4 w-px bg-gray-800 md:block" />

          {/* Live indicator */}
          {activeCount > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {activeCount} running
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="w-2 h-2 rounded-full bg-gray-800" />
              idle
            </span>
          )}

          {/* Token / cost */}
          {totalTok > 0 && (
            <>
              <div className="h-4 w-px bg-gray-800" />
              <span className="text-xs text-gray-500">
                <span className="text-gray-300">{formatTokens(totalTok)}</span> tokens today
                {cost > 0.001 && (
                  <span className="text-gray-600 ml-2">~${cost.toFixed(2)}</span>
                )}
              </span>
            </>
          )}

          <div className="flex-1" />

          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-gray-600 select-none">
            <kbd className="border border-gray-800 px-1 py-0.5 rounded">⌘K</kbd>
            jump
          </span>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 hover:text-white transition-colors font-medium"
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </header>

        {/* Content */}
        <div className="flex-1">
          {children}
        </div>

        <CommandPalette />
      </div>
    </ShellContext.Provider>
  );
}
