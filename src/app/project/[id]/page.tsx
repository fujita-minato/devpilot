'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import type { ProjectDetailResponse, SessionDetail } from '@/app/api/projects/[id]/route';
import type { ProjectDocsResponse, AdrFile, BugEntry } from '@/app/api/projects/[id]/docs/route';

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Minimal markdown renderer */
function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="text-gray-300 font-semibold text-sm mt-4 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-gray-200 font-semibold text-base mt-5 mb-2">{line.slice(3)}</h2>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-white font-bold text-lg mt-1 mb-3">{line.slice(2)}</h1>;
        if (line.startsWith('---')) return <hr key={i} className="border-gray-800 my-3" />;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="text-gray-400 text-sm ml-4 list-disc leading-relaxed"><InlineFormat text={line.slice(2)} /></li>;
        if (/^\d+\.\s/.test(line)) return <li key={i} className="text-gray-400 text-sm ml-4 list-decimal leading-relaxed"><InlineFormat text={line.replace(/^\d+\.\s/, '')} /></li>;
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-gray-400 text-sm leading-relaxed"><InlineFormat text={line} /></p>;
      })}
    </div>
  );
}

function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-gray-200 font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Section({ title, badge, children, hint }: { title: string; badge?: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-900">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        {badge}
        {hint && <span className="text-xs text-gray-700 ml-auto">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function AdrRow({ adr }: { adr: AdrFile }) {
  const [open, setOpen] = useState(false);
  const statusColor = adr.status === 'accepted' ? 'text-emerald-400' : adr.status === 'deprecated' ? 'text-red-400' : 'text-yellow-400';
  return (
    <div className="border border-gray-900 rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors text-left">
        <span className={`text-xs font-medium ${statusColor} w-16 flex-shrink-0`}>{adr.status}</span>
        <span className="text-gray-200 text-sm flex-1">{adr.title}</span>
        <span className="text-gray-600 text-xs">{adr.filename.split('-').slice(0, 1)}</span>
        <span className="text-gray-700 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-gray-900 bg-gray-950/50">
          <MarkdownView content={adr.content} />
        </div>
      )}
    </div>
  );
}

const BUG_STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-red-400',
  FIXED: 'text-emerald-400',
  WORKAROUND: 'text-yellow-400',
  'WONT-FIX': 'text-gray-500',
};

function BugRow({ bug }: { bug: BugEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-900 rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors text-left">
        <span className={`text-xs font-medium w-20 flex-shrink-0 ${BUG_STATUS_COLOR[bug.status] ?? 'text-gray-400'}`}>{bug.status}</span>
        <span className="text-gray-200 text-sm flex-1">{bug.title}</span>
        <span className="text-gray-600 text-xs">{bug.severity}</span>
        <span className="text-gray-700 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-gray-900 bg-gray-950/50">
          <MarkdownView content={bug.content} />
        </div>
      )}
    </div>
  );
}

const SOURCE_BADGE: Record<SessionDetail['source'], { label: string; cls: string }> = {
  claude: { label: 'Claude', cls: 'text-orange-300 bg-orange-950/40 border-orange-900/60' },
  codex: { label: 'Codex', cls: 'text-sky-300 bg-sky-950/40 border-sky-900/60' },
  unknown: { label: '—', cls: 'text-gray-500 bg-gray-900/40 border-gray-800' },
};

function SourceBadge({ source }: { source: SessionDetail['source'] }) {
  const b = SOURCE_BADGE[source];
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${b.cls} mr-2 flex-shrink-0`}>
      {b.label}
    </span>
  );
}

function SessionRow({ session }: { session: SessionDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-900 last:border-0">
      <div className="w-32 flex-shrink-0 text-right">
        <span className="text-gray-600 text-xs">{timeAgo(session.startedAt)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <SourceBadge source={session.source} />
        {session.gitBranch && (
          <span className="text-indigo-400 font-mono text-xs mr-2">{session.gitBranch}</span>
        )}
        {session.summary ? (
          <>
            <p className={`text-gray-400 text-xs leading-relaxed ${open ? '' : 'line-clamp-2'}`}>
              {session.summary}
            </p>
            {session.summary.length > 120 && (
              <button onClick={() => setOpen(!open)} className="text-xs text-gray-700 hover:text-gray-500 mt-0.5">
                {open ? 'less' : 'more'}
              </button>
            )}
          </>
        ) : (
          <span className="text-gray-700 text-xs italic">No summary</span>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        {(session.tokensIn || session.tokensOut) ? (
          <span className="text-gray-700 text-xs">
            {formatTokens((session.tokensIn ?? 0) + (session.tokensOut ?? 0))} tok
          </span>
        ) : null}
      </div>
    </div>
  );
}

type SessionFilter = 'all' | 'claude' | 'codex';

function SessionsSection({ sessions }: { sessions: SessionDetail[] }) {
  const [filter, setFilter] = useState<SessionFilter>('all');
  const claudeCount = sessions.filter((s) => s.source === 'claude').length;
  const codexCount = sessions.filter((s) => s.source === 'codex').length;
  const filtered = filter === 'all' ? sessions : sessions.filter((s) => s.source === filter);

  const tabCls = (active: boolean) =>
    `text-xs px-2 py-0.5 rounded border transition-colors ${
      active
        ? 'text-gray-100 bg-gray-800 border-gray-700'
        : 'text-gray-600 border-gray-900 hover:text-gray-400 hover:border-gray-800'
    }`;

  return (
    <Section
      title="Sessions"
      badge={<span className="text-xs text-gray-700">{sessions.length}</span>}
    >
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setFilter('all')} className={tabCls(filter === 'all')}>
          All <span className="text-gray-600">{sessions.length}</span>
        </button>
        <button onClick={() => setFilter('claude')} className={tabCls(filter === 'claude')}>
          Claude <span className="text-gray-600">{claudeCount}</span>
        </button>
        <button onClick={() => setFilter('codex')} className={tabCls(filter === 'codex')}>
          Codex <span className="text-gray-600">{codexCount}</span>
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-gray-700 text-sm italic">No sessions.</p>
      ) : (
        <div>
          {filtered.map((s) => <SessionRow key={s.id} session={s} />)}
        </div>
      )}
    </Section>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [docs, setDocs] = useState<ProjectDocsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [dataRes, docsRes] = await Promise.all([
          fetch(`/api/projects/${id}`),
          fetch(`/api/projects/${id}/docs`),
        ]);
        if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
        setData(await dataRes.json());
        if (docsRes.ok) setDocs(await docsRes.json());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-700 text-sm">Loading…</div>
  );

  if (error || !data) return (
    <div className="p-6">
      <p className="text-red-400">{error ?? 'Not found'}</p>
    </div>
  );

  const { project, sessions, contextBrief } = data;
  const openBugs = docs?.bugs.filter((b) => b.status === 'OPEN') ?? [];
  const resolvedBugs = docs?.bugs.filter((b) => b.status !== 'OPEN') ?? [];
  const totalTokens = contextBrief.totalTokensIn + contextBrief.totalTokensOut;

  return (
    <div className="text-gray-100">
      {/* Project header bar */}
      <div className="border-b border-gray-900 px-6 py-3 flex items-center gap-3 sticky top-0 bg-gray-950/95 backdrop-blur z-10">
        <span className="text-white font-semibold text-sm">{project.name}</span>
        {project.branch && <span className="text-gray-700 font-mono text-xs">{project.branch}</span>}
        <Link
          href={`/project/${project.id}/authorship`}
          className="text-xs text-orange-300 hover:text-orange-200 border border-orange-900/60 rounded px-2 py-0.5 transition-colors ml-auto"
        >
          Authorship →
        </Link>
        <span className="text-gray-800 text-xs ml-3 truncate max-w-xs">{project.path}</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Stats strip */}
        <div className="flex items-center gap-6 text-xs text-gray-500 mb-8 pb-4 border-b border-gray-900">
          <span><span className="text-white font-semibold">{contextBrief.totalSessions}</span> sessions</span>
          {(contextBrief.claudeSessions > 0 || contextBrief.codexSessions > 0) && (
            <span>
              <span className="text-orange-300 font-semibold">{contextBrief.claudeSessions}</span>
              <span className="text-gray-700"> C </span>
              <span className="text-sky-300 font-semibold">{contextBrief.codexSessions}</span>
              <span className="text-gray-700"> X</span>
            </span>
          )}
          <span><span className="text-white font-semibold">{formatTokens(totalTokens)}</span> tokens</span>
          {docs?.adrCount !== undefined && docs.adrCount > 0 && (
            <span><span className="text-indigo-400 font-semibold">{docs.adrCount}</span> ADRs</span>
          )}
          {openBugs.length > 0 && (
            <span><span className="text-red-400 font-semibold">{openBugs.length}</span> open bugs</span>
          )}
        </div>

        {/* Progress */}
        <Section
          title="Progress"
          hint={docs?.hasProgress ? 'docs/progress.md' : undefined}
          badge={!docs?.hasProgress ? (
            <span className="text-xs text-gray-700">run /progress to create</span>
          ) : undefined}
        >
          {docs?.progress ? (
            <MarkdownView content={docs.progress} />
          ) : (
            <div className="space-y-2">
              {contextBrief.recentSummaries.length === 0 ? (
                <p className="text-gray-700 text-sm italic">No summaries available.</p>
              ) : contextBrief.recentSummaries.map((s, i) => (
                <p key={i} className="text-gray-500 text-sm leading-relaxed border-l-2 border-gray-800 pl-3">{s}</p>
              ))}
            </div>
          )}
        </Section>

        {/* ADRs */}
        {(docs?.adrs.length ?? 0) > 0 && (
          <Section title="Architecture Decisions" hint="docs/adr/">
            {docs!.adrs.map((adr) => <AdrRow key={adr.filename} adr={adr} />)}
          </Section>
        )}

        {/* Bugs */}
        {(docs?.bugs.length ?? 0) > 0 && (
          <Section
            title="Bugs"
            badge={openBugs.length > 0 ? (
              <span className="text-xs bg-red-950/60 text-red-400 px-2 py-0.5 rounded-full font-medium">{openBugs.length} open</span>
            ) : undefined}
            hint="docs/buglist.md"
          >
            {openBugs.map((b, i) => <BugRow key={i} bug={b} />)}
            {resolvedBugs.length > 0 && (
              <details className="mt-2">
                <summary className="text-gray-600 text-xs cursor-pointer hover:text-gray-400 py-1">
                  {resolvedBugs.length} resolved
                </summary>
                <div className="mt-2">
                  {resolvedBugs.map((b, i) => <BugRow key={i} bug={b} />)}
                </div>
              </details>
            )}
          </Section>
        )}

        {/* Sessions */}
        <SessionsSection sessions={sessions} />
      </div>
    </div>
  );
}
