'use client';

// devpilot 首页 —— Vercel + Linear hybrid layout。
//   ┌─ TopNav 52px(logo + breadcrumb · 全局指标 · refresh)
//   ┌─ Sidebar 260px(Linear 风:Active/Recent/Cold 三段)
//   ┌─ Main(Vercel-style project page · Hero + KPI grid + sections)

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MonitorProject,
  MonitorResponse,
} from '@/app/api/monitor/route';
import {
  ProjectJournal,
  projectByLastTouched,
} from '@/components/observatory/ProjectJournal';
import { ProjectSidebar } from '@/components/observatory/ProjectSidebar';
import { SectionError } from '@/components/observatory/SectionError';
import { TopNav } from '@/components/observatory/TopNav';
import { tokens } from '@/components/observatory/tokens';

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

function loading<T>(): Loadable<T> {
  return { status: 'loading' };
}
function ready<T>(data: T): Loadable<T> {
  return { status: 'ready', data };
}
function failed<T>(error: unknown): Loadable<T> {
  return {
    status: 'error',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface GlobalStats {
  projects: number;
  hot: number;
  sessions7d: number;
  tokens7d: number;
}

function compute7dStats(projects: MonitorProject[]): GlobalStats {
  const cutoff7d = Date.now() - 7 * 86_400_000;
  const cutoff24h = Date.now() - 24 * 3_600_000;
  let sessions = 0;
  let tokens = 0;
  let hot = 0;
  for (const p of projects) {
    let lastAt = 0;
    for (const r of [p.runners.cc, p.runners.cx]) {
      if (r.lastAt && r.lastAt > lastAt) lastAt = r.lastAt;
    }
    for (const h of p.history) {
      if (h.startedAt > lastAt) lastAt = h.startedAt;
      if (h.startedAt >= cutoff7d) {
        sessions += 1;
        tokens += h.tokensIn + h.tokensOut;
      }
    }
    if (lastAt >= cutoff24h) hot += 1;
  }
  return { projects: projects.length, sessions7d: sessions, tokens7d: tokens, hot };
}

function StatePane({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        minHeight: 400,
        color: tokens.muted,
        fontSize: 13,
        padding: 24,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

export default function ObservatoryHomePage() {
  const [monitor, setMonitor] = useState<Loadable<MonitorResponse>>(loading);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadMonitor = useCallback(async () => {
    setMonitor(loading());
    try {
      const data = await fetchJson<MonitorResponse>('/api/monitor');
      setMonitor(ready(data));
    } catch (error) {
      setMonitor(failed(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadMonitor();
    });
    return () => {
      cancelled = true;
    };
  }, [loadMonitor]);

  const projects = useMemo(
    () => (monitor.status === 'ready' ? monitor.data.projects : []),
    [monitor],
  );
  const ranked = useMemo(
    () => [...projects].sort(projectByLastTouched),
    [projects],
  );
  const stats = useMemo(
    () => (monitor.status === 'ready' ? compute7dStats(projects) : null),
    [monitor, projects],
  );

  const effectiveSelectedId =
    selectedId && ranked.some((p) => p.id === selectedId)
      ? selectedId
      : ranked[0]?.id ?? null;
  const selectedProject =
    ranked.find((p) => p.id === effectiveSelectedId) ?? null;

  return (
    <div
      style={{
        background: tokens.bg,
        color: tokens.text,
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        fontFeatureSettings: "'cv02', 'cv03', 'cv04', 'cv11', 'ss01'",
        fontSize: 13,
        minHeight: '100vh',
      }}
    >
      <style>{`
        @keyframes dp-pulse {
          0%, 100% { opacity: .45 }
          50%      { opacity: 1 }
        }
        .pulse-dot { animation: dp-pulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
        body { background: ${tokens.bg} }

        .dp-sidebar-row:hover {
          background: ${tokens.raised} !important;
        }
        .dp-sidebar-row[aria-current="true"]:hover {
          background: ${tokens.brandHi} !important;
        }
        .dp-sidebar-row:focus-visible {
          outline: none;
          box-shadow: inset 0 0 0 1px ${tokens.brand};
        }
        .dp-sidebar-row:hover .dp-sidebar-meta-default { display: none; }
        .dp-sidebar-row:hover .dp-sidebar-meta-hover { display: inline !important; }

        .dp-session-row:hover {
          background: ${tokens.raised};
        }

        /* native <details> styling — chevron rotates 90° when open */
        .dp-details > summary { cursor: pointer; }
        .dp-details > summary::-webkit-details-marker { display: none; }
        .dp-details > summary::marker { display: none; }
        .dp-details > summary { list-style: none; }
        .dp-details[open] > summary .dp-details-chev {
          transform: rotate(90deg);
        }
        .dp-details > summary:hover h3 { color: ${tokens.text}; }
        .dp-details > summary:hover .dp-details-chev { color: ${tokens.text}; }

        /* master-detail layout */
        .dp-md-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 1024px) {
          .dp-md-grid {
            grid-template-columns: 260px minmax(0, 1fr);
            gap: 28px;
            align-items: start;
          }
        }
        .dp-sidebar-sticky {
          position: static;
        }
        @media (min-width: 1024px) {
          .dp-sidebar-sticky {
            position: sticky;
            top: 68px;
            max-height: calc(100vh - 84px);
            overflow-y: auto;
          }
        }
      `}</style>

      <TopNav
        loading={monitor.status === 'loading'}
        onRefresh={() => void loadMonitor()}
        projectName={selectedProject?.name ?? null}
        stats={stats}
      />

      <main
        className="mx-auto"
        style={{
          maxWidth: 1440,
          minWidth: 0,
          paddingInline: 'clamp(16px, 3vw, 32px)',
          paddingTop: 24,
          paddingBottom: 64,
        }}
      >
        {monitor.status === 'error' ? (
          <SectionError
            message={monitor.message}
            retry={() => void loadMonitor()}
          />
        ) : monitor.status === 'loading' ? (
          <StatePane>Loading projects…</StatePane>
        ) : ranked.length === 0 ? (
          <StatePane>
            No projects detected. Start a Claude Code or Codex session in any
            local repo to populate the journal.
          </StatePane>
        ) : (
          <div className="dp-md-grid">
            <div className="dp-sidebar-sticky">
              <ProjectSidebar
                onSelect={setSelectedId}
                projects={ranked}
                selectedId={effectiveSelectedId}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              {selectedProject ? (
                <ProjectJournal
                  key={selectedProject.id}
                  project={selectedProject}
                />
              ) : (
                <StatePane>Pick a project from the sidebar.</StatePane>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
