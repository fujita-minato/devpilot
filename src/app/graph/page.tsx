'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  WorkGraphLink,
  WorkGraphNode,
  WorkGraphResponse,
} from '@/lib/graph/build-graph';

const WORKSPACE_LABEL = '~/Developer';

interface FolderCluster {
  id: string;
  folder: string;
  path: string;
  projects: WorkGraphNode[];
  sessions: WorkGraphNode[];
  files: WorkGraphNode[];
  branches: WorkGraphNode[];
  models: WorkGraphNode[];
  tokens: number;
  costUsd: number;
  aiLines: number;
  mixedLines: number;
  latestAt: number | null;
}

interface PlacedCluster extends FolderCluster {
  x: number;
  y: number;
  r: number;
}

const DOTS = {
  project: '#0f4c81',
  session: '#f0643f',
  file: '#be3157',
  branch: '#28705f',
  model: '#9a6a1c',
};

function projectPath(node: WorkGraphNode): string | null {
  return typeof node.description === 'string' ? node.description : null;
}

function metricNumber(node: WorkGraphNode, key: string): number {
  const value = node.metrics[key];
  return typeof value === 'number' ? value : 0;
}

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

function formatDate(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function topFolder(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return '_root';
  const developerIndex = parts.lastIndexOf('Developer');
  if (developerIndex >= 0 && parts[developerIndex + 1]) return parts[developerIndex + 1];
  return parts[parts.length - 1] || null;
}

function folderLabel(folder: string): string {
  return folder === '_root' ? 'Workspace root' : folder;
}

function clusterPath(folder: string): string {
  return folder === '_root' ? WORKSPACE_LABEL : `${WORKSPACE_LABEL}/${folder}`;
}

function otherNode(link: WorkGraphLink, id: string): string | null {
  if (link.source === id) return link.target;
  if (link.target === id) return link.source;
  return null;
}

function uniqueNodes(nodes: WorkGraphNode[]): WorkGraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function buildClusters(data: WorkGraphResponse): FolderCluster[] {
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const byFolder = new Map<string, WorkGraphNode[]>();

  for (const node of data.nodes) {
    if (node.type !== 'project') continue;
    const path = projectPath(node);
    if (!path) continue;
    const folder = topFolder(path);
    if (!folder) continue;
    const projects = byFolder.get(folder) ?? [];
    projects.push(node);
    byFolder.set(folder, projects);
  }

  const clusters: FolderCluster[] = [];
  for (const [folder, projects] of byFolder) {
    const related: WorkGraphNode[] = [];
    const sessionIds = new Set<string>();

    for (const project of projects) {
      for (const link of data.links) {
        const id = otherNode(link, project.id);
        if (!id) continue;
        const node = nodesById.get(id);
        if (!node) continue;
        related.push(node);
        if (node.type === 'session') sessionIds.add(node.id);
      }
    }

    for (const link of data.links) {
      const sourceSession = sessionIds.has(link.source);
      const targetSession = sessionIds.has(link.target);
      if (!sourceSession && !targetSession) continue;
      const id = sourceSession ? link.target : link.source;
      const node = nodesById.get(id);
      if (node) related.push(node);
    }

    const sessions = uniqueNodes(related.filter((node) => node.type === 'session'));
    const files = uniqueNodes(related.filter((node) => node.type === 'file'));
    const branches = uniqueNodes(related.filter((node) => node.type === 'branch'));
    const models = uniqueNodes(related.filter((node) => node.type === 'model'));
    const tokens = projects.reduce((sum, project) => sum + metricNumber(project, 'tokens'), 0);
    const costUsd = projects.reduce((sum, project) => sum + metricNumber(project, 'costUsd'), 0);
    const aiLines = projects.reduce((sum, project) => sum + metricNumber(project, 'aiLines'), 0);
    const mixedLines = projects.reduce((sum, project) => sum + metricNumber(project, 'mixedLines'), 0);
    const latestAt = projects.reduce<number | null>((latest, project) => {
      const value = metricNumber(project, 'latestAt');
      if (!value) return latest;
      return latest === null ? value : Math.max(latest, value);
    }, null);

    clusters.push({
      id: `folder:${folder}`,
      folder,
      path: clusterPath(folder),
      projects: projects.sort((a, b) => metricNumber(b, 'tokens') - metricNumber(a, 'tokens')),
      sessions,
      files,
      branches,
      models,
      tokens,
      costUsd,
      aiLines,
      mixedLines,
      latestAt,
    });
  }

  return clusters.sort((a, b) => b.tokens - a.tokens || b.costUsd - a.costUsd);
}

function placeClusters(clusters: FolderCluster[]): PlacedCluster[] {
  const maxTokens = Math.max(1, ...clusters.map((cluster) => cluster.tokens));
  const ringA = 205;
  const ringB = 350;
  return clusters.slice(0, 18).map((cluster, index) => {
    const inner = index < 7;
    const ring = inner ? ringA : ringB;
    const ringIndex = inner ? index : index - 7;
    const ringCount = inner ? Math.min(7, clusters.length) : Math.max(1, Math.min(11, clusters.length - 7));
    const angle = -Math.PI / 2 + (Math.PI * 2 * ringIndex) / ringCount + (inner ? 0 : Math.PI / 11);
    const scale = Math.sqrt(cluster.tokens / maxTokens);
    return {
      ...cluster,
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring * 0.72,
      r: 42 + scale * 58,
    };
  });
}

function miniDots(cluster: FolderCluster) {
  const dots: Array<{ type: keyof typeof DOTS; count: number }> = [
    { type: 'project', count: cluster.projects.length },
    { type: 'session', count: cluster.sessions.length },
    { type: 'file', count: cluster.files.length },
    { type: 'branch', count: cluster.branches.length },
    { type: 'model', count: cluster.models.length },
  ];
  const expanded: Array<{ type: keyof typeof DOTS; index: number }> = [];
  for (const dot of dots) {
    for (let i = 0; i < Math.min(dot.count, 8); i++) {
      expanded.push({ type: dot.type, index: expanded.length });
    }
  }
  return expanded.slice(0, 22);
}

export default function GraphPage() {
  const [data, setData] = useState<WorkGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/graph');
      if (!response.ok) throw new Error(`/api/graph failed with ${response.status}`);
      const graph = (await response.json()) as WorkGraphResponse;
      setData(graph);
      setSelectedId((current) => current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const clusters = useMemo(() => (data ? buildClusters(data) : []), [data]);
  const placed = useMemo(() => placeClusters(clusters), [clusters]);
  const selected = placed.find((cluster) => cluster.id === selectedId) ?? placed[0] ?? null;
  const totalTokens = clusters.reduce((sum, cluster) => sum + cluster.tokens, 0);
  const totalCost = clusters.reduce((sum, cluster) => sum + cluster.costUsd, 0);

  useEffect(() => {
    if (!selectedId && placed[0]) setSelectedId(placed[0].id);
  }, [placed, selectedId]);

  return (
    <main className="min-h-[calc(100vh-44px)] bg-[#f3f1ec] text-[#22201d]">
      <div className="mx-auto max-w-[1480px] px-4 py-5 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#f0643f]">
              directory cluster map
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
              Developer projects by folder.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
              Rooted at <span className="font-mono">{WORKSPACE_LABEL}</span>. Worktrees are folded into their parent project folder.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 hover:text-black" href="/">
              Home
            </Link>
            <Link className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 hover:text-black" href="/report">
              Report
            </Link>
            <button
              className="rounded-md bg-[#22201d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              disabled={loading}
              onClick={() => void loadGraph()}
              type="button"
            >
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
          <aside className="order-2 rounded-xl border border-black/10 bg-white/82 p-3 shadow-sm lg:order-1">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Folders</h2>
              <span className="font-mono text-xs text-black/40">{clusters.length}</span>
            </div>
            <div className="mt-3 max-h-[250px] space-y-1 overflow-auto pr-1 lg:max-h-[650px]">
              {clusters.map((cluster) => {
                const active = selected?.id === cluster.id;
                return (
                  <button
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      active ? 'bg-[#e7f0f7] text-[#0f4c81]' : 'text-black/60 hover:bg-black/[0.035] hover:text-black'
                    }`}
                    key={cluster.id}
                    onClick={() => setSelectedId(cluster.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold">{folderLabel(cluster.folder)}</span>
                      <span className="shrink-0 font-mono text-[11px]">{formatTokens(cluster.tokens)}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] opacity-60">
                      {cluster.projects.length} project entries · {cluster.sessions.length} sessions
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="order-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm lg:order-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/35">
                  {WORKSPACE_LABEL}
                </div>
                <div className="mt-1 text-sm font-semibold">
                  Folder clusters sized by captured token volume
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(DOTS).map(([key, color]) => (
                  <span className="flex items-center gap-1.5 text-[11px] text-black/45" key={key}>
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    {key}
                  </span>
                ))}
              </div>
            </div>

            <svg
              aria-label="Developer directory project clusters"
              className="block h-[560px] w-full lg:h-[660px]"
              role="img"
              viewBox="-610 -410 1220 820"
            >
              <rect fill="#f8f7f3" height="820" x="-610" y="-410" width="1220" />
              <g opacity="0.52">
                {Array.from({ length: 31 }, (_, i) => -580 + i * 40).map((x) =>
                  Array.from({ length: 21 }, (_, j) => -390 + j * 40).map((y) => (
                    <circle cx={x} cy={y} fill="#d1ccc2" key={`${x}:${y}`} r="1.15" />
                  )),
                )}
              </g>

              <g>
                <circle cx="0" cy="0" fill="#22201d" r="58" />
                <circle cx="0" cy="0" fill="#ffffff" r="8" />
                <text fill="#22201d" fontSize="12" fontWeight="800" textAnchor="middle" x="0" y="82">
                  Developer
                </text>
                <text fill="#807970" fontFamily="ui-monospace, Menlo, monospace" fontSize="10" textAnchor="middle" x="0" y="97">
                  {formatTokens(totalTokens)} · {formatUsd(totalCost)}
                </text>
              </g>

              {placed.map((cluster) => (
                <path
                  d={`M 0 0 C ${cluster.x * 0.3} ${cluster.y * 0.08}, ${cluster.x * 0.7} ${cluster.y * 0.92}, ${cluster.x} ${cluster.y}`}
                  fill="none"
                  key={`link:${cluster.id}`}
                  stroke={selected?.id === cluster.id ? '#f0643f' : '#b8b1a7'}
                  strokeOpacity={selected?.id === cluster.id ? 0.6 : 0.3}
                  strokeWidth={selected?.id === cluster.id ? 2.2 : 1.1}
                />
              ))}

              {placed.map((cluster) => (
                <ClusterBubble
                  cluster={cluster}
                  key={cluster.id}
                  onSelect={setSelectedId}
                  selected={selected?.id === cluster.id}
                />
              ))}
            </svg>
          </div>

          <div className="order-3">
            <ClusterDetails cluster={selected} />
          </div>
        </section>
      </div>
    </main>
  );
}

function ClusterBubble({
  cluster,
  onSelect,
  selected,
}: {
  cluster: PlacedCluster;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const dots = miniDots(cluster);
  return (
    <g
      onClick={() => onSelect(cluster.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(cluster.id);
        }
      }}
      role="button"
      style={{ cursor: 'pointer', outline: 'none' }}
      tabIndex={0}
    >
      <title>{cluster.path}</title>
      <circle
        cx={cluster.x}
        cy={cluster.y}
        fill={selected ? '#e7f0f7' : 'rgba(255,255,255,0.78)'}
        r={cluster.r}
        stroke={selected ? '#0f4c81' : 'rgba(15,76,129,0.35)'}
        strokeWidth={selected ? 3 : 1.4}
      />
      <circle cx={cluster.x} cy={cluster.y} fill="#0f4c81" r={Math.max(5, cluster.r * 0.12)} />

      {dots.map((dot, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, dots.length);
        const rr = cluster.r * 0.48;
        return (
          <circle
            cx={cluster.x + Math.cos(angle) * rr}
            cy={cluster.y + Math.sin(angle) * rr * 0.72}
            fill={DOTS[dot.type]}
            key={`${dot.type}:${index}`}
            opacity="0.85"
            r={dot.type === 'session' ? 4.2 : 3.5}
          />
        );
      })}

      <text
        fill="#22201d"
        fontSize={selected ? 13 : 11}
        fontWeight="800"
        textAnchor="middle"
        x={cluster.x}
        y={cluster.y + cluster.r + 18}
      >
        {folderLabel(cluster.folder).length > 22
          ? `${folderLabel(cluster.folder).slice(0, 21)}…`
          : folderLabel(cluster.folder)}
      </text>
      <text
        fill="#807970"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="9"
        textAnchor="middle"
        x={cluster.x}
        y={cluster.y + cluster.r + 32}
      >
        {formatTokens(cluster.tokens)} · {cluster.sessions.length} sessions
      </text>
    </g>
  );
}

function ClusterDetails({ cluster }: { cluster: FolderCluster | null }) {
  if (!cluster) {
    return (
      <aside className="rounded-xl border border-black/10 bg-white/82 p-4 shadow-sm">
        <p className="text-sm text-black/55">No Developer projects captured yet.</p>
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-black/10 bg-white/82 p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f4c81]">
        Folder
      </div>
      <h2 className="mt-2 truncate text-xl font-semibold">{folderLabel(cluster.folder)}</h2>
      <div className="mt-1 truncate font-mono text-xs text-black/45">{cluster.path}</div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Tokens" value={formatTokens(cluster.tokens)} />
        <Metric label="Cost" value={formatUsd(cluster.costUsd)} />
        <Metric label="Sessions" value={String(cluster.sessions.length)} />
        <Metric label="AI lines" value={String(cluster.aiLines)} />
      </div>

      <div className="mt-5 border-t border-black/10 pt-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-black/35">
          Project entries
        </div>
        <div className="space-y-2">
          {cluster.projects.slice(0, 6).map((project) => (
            <Link
              className="block rounded-lg border border-black/10 bg-black/[0.025] px-3 py-2 hover:bg-black/[0.045]"
              href={project.href ?? '#'}
              key={project.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold">{project.label}</span>
                <span className="shrink-0 font-mono text-xs text-black/50">{formatTokens(metricNumber(project, 'tokens'))}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-black/38">
                {project.description}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-black/10 pt-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-black/35">
          Cluster signals
        </div>
        <DetailRow label="Branches" value={String(cluster.branches.length)} />
        <DetailRow label="Models" value={cluster.models.slice(0, 3).map((model) => model.label).join(', ') || '—'} />
        <DetailRow label="AI files" value={String(cluster.files.length)} />
        <DetailRow label="Last active" value={formatDate(cluster.latestAt)} />
        <DetailRow label="Mixed lines" value={String(cluster.mixedLines)} />
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.025] px-3 py-2">
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/38">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-xs">
      <span className="text-black/42">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-black/62">{value}</span>
    </div>
  );
}
