'use client';

// P9 Wave 3 — Authorship 页：文件树 + 行级着色 viewer + session drawer
//
// 视觉/交互决策（对齐 09-CONTEXT Area 4）：
// - 不引 Monaco：P9 只需只读 viewer，60KB+ 的 editor 太重；用 Tailwind <pre> + 行级 div 足够
// - 颜色延用 SourceBadge 体系（避免 UI 双轨）：Claude 橙 / Codex 蓝 / human 灰 / mixed 条纹 / unknown 透明
// - mixed 行用 repeating-linear-gradient（橙 + 灰 45° 斜纹）——原生 Tailwind 无此模式，走 inline style
// - unknown 行透明底 + 行号右侧小圆点 + title="before tracking" 解释为什么没归因
// - hover 不触发 drawer（避免 scroll 时误触），仅 click；title 属性给 hover 提示
// - 无全局 state 库（无 zustand / redux），走 useState，对齐项目惯例

import { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import type {
  AuthorshipResponse,
  AuthorshipSummary,
  AuthorshipSessionInfo,
} from '@/app/api/projects/[id]/authorship/route';
import type { AuthorshipLine, AuthorKind } from '@/lib/authorship/engine';
import { formatCostUsd } from '@/lib/pricing';

// ── helpers ──────────────────────────────────────────────────────────────

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

function formatShortSha(sha: string | null): string {
  if (!sha) return '—';
  return sha.slice(0, 7);
}

// mixed 行的条纹背景（橙 + 灰 45° 斜纹）
const MIXED_STRIPE_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(251,146,60,0.15) 0, rgba(251,146,60,0.15) 4px, rgba(156,163,175,0.12) 4px, rgba(156,163,175,0.12) 8px)',
};

// ── 项目总览(GitHub 风格热力网格) ───────────────────────────────────────

interface ProjectStats {
  fileCount: number;
  totalLines: number;
  aiClaudeLines: number;
  aiCodexLines: number;
  humanLines: number;
  mixedLines: number;
  unknownLines: number;
}

function computeStats(files: AuthorshipSummary[]): ProjectStats {
  const stats: ProjectStats = {
    fileCount: files.length,
    totalLines: 0,
    aiClaudeLines: 0,
    aiCodexLines: 0,
    humanLines: 0,
    mixedLines: 0,
    unknownLines: 0,
  };
  for (const f of files) {
    stats.totalLines += f.totalLines;
    stats.aiClaudeLines += f.aiClaudeLines;
    stats.aiCodexLines += f.aiCodexLines;
    stats.humanLines += f.humanLines;
    stats.mixedLines += f.mixedLines;
    stats.unknownLines += f.unknownLines;
  }
  return stats;
}

// AI 占比 → 5 阶强度(0..4),用于 heatmap 上色
function aiRatioBin(file: AuthorshipSummary): number {
  const total = Math.max(1, file.totalLines);
  // mixed 行算半 AI 半 human
  const aiLines = file.aiClaudeLines + file.aiCodexLines + file.mixedLines * 0.5;
  const ratio = aiLines / total;
  if (ratio < 0.05) return 0;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

const HEAT_BG = [
  'bg-gray-900',
  'bg-orange-950/70',
  'bg-orange-800/80',
  'bg-orange-600/90',
  'bg-orange-400',
] as const;

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function ProjectMap({
  files,
  stats,
  selectedPath,
  onSelect,
}: {
  files: AuthorshipSummary[];
  stats: ProjectStats;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const aiTotal =
    stats.aiClaudeLines + stats.aiCodexLines + stats.mixedLines * 0.5;
  const aiPct = pct(aiTotal, stats.totalLines);
  return (
    <div className="border-b border-gray-900 bg-gray-950/95 px-6 py-3 flex items-start gap-6 flex-shrink-0">
      <div className="flex-shrink-0 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
          Project map
        </div>
        <div className="text-xs text-gray-400 space-x-3 font-mono">
          <span className="text-gray-200">{stats.fileCount}</span>
          <span className="text-gray-600">files</span>
          <span className="text-gray-200">{formatTokens(stats.totalLines)}</span>
          <span className="text-gray-600">lines</span>
          <span className="text-orange-300">{aiPct}</span>
          <span className="text-gray-600">AI</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-orange-400/80" />
            Claude {pct(stats.aiClaudeLines, stats.totalLines)}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-sky-400/80" />
            Codex {pct(stats.aiCodexLines, stats.totalLines)}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-gray-500/70" />
            Human {pct(stats.humanLines, stats.totalLines)}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-[3px] max-h-[80px] overflow-y-auto pr-2">
          {files.map((f) => {
            const bin = aiRatioBin(f);
            const isActive = f.path === selectedPath;
            const aiLines = f.aiClaudeLines + f.aiCodexLines + f.mixedLines * 0.5;
            const fAiPct = pct(aiLines, f.totalLines);
            return (
              <button
                aria-label={`${f.path}, ${fAiPct} AI`}
                className={`w-3 h-3 rounded-sm transition-transform hover:scale-150 hover:z-10 relative ${HEAT_BG[bin]} ${
                  isActive ? 'ring-1 ring-indigo-400' : ''
                }`}
                key={f.path}
                onClick={() => onSelect(f.path)}
                title={`${f.path} · ${fAiPct} AI · ${f.totalLines} lines`}
                type="button"
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-600">
          <span>Less AI</span>
          {HEAT_BG.map((cls, i) => (
            <span className={`w-2 h-2 rounded-sm ${cls}`} key={i} />
          ))}
          <span>More AI</span>
        </div>
      </div>
    </div>
  );
}

// ── 文件树构造 ──────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string; // full rel path for leaves, partial for dirs
  children: TreeNode[];
  isFile: boolean;
  summary?: AuthorshipSummary; // 叶节点才带
}

// 把扁平的 AuthorshipSummary[] 按 '/' 分段展开成树
function buildTree(files: AuthorshipSummary[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false };
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLeaf = i === parts.length - 1;
      const partialPath = parts.slice(0, i + 1).join('/');
      let child = cur.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          path: partialPath,
          children: [],
          isFile: isLeaf,
          summary: isLeaf ? f : undefined,
        };
        cur.children.push(child);
      }
      cur = child;
    }
  }
  // 目录在前，字母序；目录节点直接标为非文件
  const sortNode = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

// ── FileTree ────────────────────────────────────────────────────────────

function MiniBar({ s }: { s: AuthorshipSummary }) {
  // 迷你柱状图：橙/蓝/灰/mixed/unknown 按比例堆叠
  const total = Math.max(1, s.totalLines);
  const segs = [
    { cls: 'bg-orange-400/70', w: (s.aiClaudeLines / total) * 100 },
    { cls: 'bg-sky-400/70', w: (s.aiCodexLines / total) * 100 },
    { cls: 'bg-gray-600/70', w: (s.humanLines / total) * 100 },
    { cls: 'bg-yellow-600/50', w: (s.mixedLines / total) * 100 },
    { cls: 'bg-gray-800/50', w: (s.unknownLines / total) * 100 },
  ].filter((x) => x.w > 0);
  return (
    <span className="inline-flex h-1.5 w-10 rounded overflow-hidden bg-gray-900 flex-shrink-0 ml-2">
      {segs.map((s, i) => (
        <span key={i} className={s.cls} style={{ width: `${s.w}%` }} />
      ))}
    </span>
  );
}

function TreeView({
  node,
  depth,
  selectedPath,
  onSelect,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (p: string) => void;
  expanded: Set<string>;
  onToggle: (p: string) => void;
}) {
  return (
    <ul className="text-xs">
      {node.children.map((child) => {
        if (child.isFile) {
          const active = child.path === selectedPath;
          return (
            <li key={child.path}>
              <button
                onClick={() => onSelect(child.path)}
                className={`w-full flex items-center px-2 py-0.5 hover:bg-gray-900 transition-colors text-left rounded ${
                  active ? 'bg-gray-800 text-gray-100' : 'text-gray-400'
                }`}
                style={{ paddingLeft: `${depth * 10 + 8}px` }}
                title={child.path}
              >
                <span className="truncate flex-1">{child.name}</span>
                {child.summary && <MiniBar s={child.summary} />}
              </button>
            </li>
          );
        }
        // 目录节点：可展开 / 折叠
        const isOpen = expanded.has(child.path);
        return (
          <li key={child.path}>
            <button
              onClick={() => onToggle(child.path)}
              className="w-full flex items-center px-2 py-0.5 hover:bg-gray-900 transition-colors text-left text-gray-500"
              style={{ paddingLeft: `${depth * 10 + 8}px` }}
            >
              <span className="text-gray-700 mr-1 w-3">{isOpen ? '▾' : '▸'}</span>
              <span className="truncate">{child.name}</span>
            </button>
            {isOpen && (
              <TreeView
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                expanded={expanded}
                onToggle={onToggle}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── CodeViewer ──────────────────────────────────────────────────────────

function lineBgClass(author: AuthorKind): string {
  switch (author) {
    case 'ai-claude':
      return 'bg-orange-950/30';
    case 'ai-codex':
      return 'bg-sky-950/30';
    case 'human':
      return 'bg-gray-900/60';
    case 'mixed':
      return ''; // gradient via inline style
    case 'unknown':
    default:
      return '';
  }
}

function authorLabel(author: AuthorKind): string {
  switch (author) {
    case 'ai-claude':
      return 'Claude';
    case 'ai-codex':
      return 'Codex';
    case 'human':
      return 'Human';
    case 'mixed':
      return 'Mixed (AI + human)';
    case 'unknown':
    default:
      return 'Unknown (before tracking)';
  }
}

function CodeViewer({
  file,
  onSelectLine,
  selectedLineNumber,
}: {
  file: NonNullable<AuthorshipResponse['file']>;
  onSelectLine: (line: AuthorshipLine) => void;
  selectedLineNumber: number | null;
}) {
  return (
    <div className="font-mono text-xs text-gray-200">
      {file.lines.map((line) => {
        const bg = lineBgClass(line.author);
        const isMixed = line.author === 'mixed';
        const isUnknown = line.author === 'unknown';
        const active = selectedLineNumber === line.lineNumber;
        return (
          <div
            key={line.lineNumber}
            onClick={() => onSelectLine(line)}
            title={authorLabel(line.author)}
            className={`flex items-stretch cursor-pointer hover:ring-1 hover:ring-gray-700 ${bg} ${
              active ? 'ring-1 ring-indigo-500/70' : ''
            }`}
            style={isMixed ? MIXED_STRIPE_STYLE : undefined}
          >
            <span className="text-gray-700 text-right pr-2 select-none w-10 flex-shrink-0 border-r border-gray-900">
              {line.lineNumber}
            </span>
            <span className="w-2 flex items-center justify-center flex-shrink-0">
              {isUnknown && (
                <span
                  className="inline-block w-1 h-1 rounded-full bg-gray-700"
                  title="before tracking"
                />
              )}
            </span>
            <pre className="pl-2 pr-2 py-0 whitespace-pre overflow-x-auto flex-1">
              {line.content || ' '}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<
  'claude' | 'codex' | 'unknown',
  { label: string; cls: string }
> = {
  claude: {
    label: 'Claude',
    cls: 'text-orange-300 bg-orange-950/40 border-orange-900/60',
  },
  codex: {
    label: 'Codex',
    cls: 'text-sky-300 bg-sky-950/40 border-sky-900/60',
  },
  unknown: {
    label: '—',
    cls: 'text-gray-500 bg-gray-900/40 border-gray-800',
  },
};

function SourceBadge({ source }: { source: 'claude' | 'codex' | 'unknown' }) {
  const b = SOURCE_BADGE[source];
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${b.cls}`}
    >
      {b.label}
    </span>
  );
}

function Drawer({
  projectId,
  line,
  sessions,
  onClose,
}: {
  projectId: string;
  line: AuthorshipLine | null;
  sessions: AuthorshipSessionInfo[];
  onClose: () => void;
}) {
  const open = line !== null;
  const session = useMemo(() => {
    if (!line?.sessionId) return null;
    return sessions.find((s) => s.id === line.sessionId) ?? null;
  }, [line, sessions]);

  return (
    <div
      className={`fixed right-0 top-0 h-full w-80 bg-gray-950 border-l border-gray-800 shadow-2xl z-30 transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      {line && (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-900">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Line {line.lineNumber}</span>
              <span className="text-xs text-gray-700">· {authorLabel(line.author)}</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-200 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {session ? (
              <>
                <div className="flex items-center gap-2">
                  <SourceBadge source={session.source} />
                  {session.model && (
                    <span className="text-xs text-gray-500 font-mono truncate">
                      {session.model}
                    </span>
                  )}
                </div>

                {session.summary ? (
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-6">
                    {session.summary}
                  </p>
                ) : (
                  <p className="text-xs text-gray-700 italic">No summary</p>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-gray-900">
                  <div>
                    <div className="text-gray-700 mb-0.5">Cost</div>
                    <div className="text-gray-200 font-mono">
                      {formatCostUsd(session.costUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-700 mb-0.5">Tokens</div>
                    <div className="text-gray-200 font-mono">
                      {formatTokens(
                        (session.tokensIn ?? 0) + (session.tokensOut ?? 0),
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-700 mb-0.5">Started</div>
                    <div className="text-gray-300">{timeAgo(session.startedAt)}</div>
                  </div>
                </div>

                <Link
                  href={`/project/${projectId}#session-${session.id}`}
                  className="inline-block text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-900/60 rounded px-2 py-1 transition-colors"
                >
                  Jump to session →
                </Link>
              </>
            ) : (
              // human / unknown / mixed-无 session：展示 commit + time
              <div className="space-y-3 text-xs">
                <p className="text-gray-500">
                  {line.author === 'unknown'
                    ? 'This line was committed before devpilot tracking started.'
                    : line.author === 'human'
                      ? 'No AI session matched this line. Attributed to human author.'
                      : 'AI session content matched but fell outside the time window.'}
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-900">
                  <div>
                    <div className="text-gray-700 mb-0.5">Commit</div>
                    <div className="text-gray-200 font-mono">
                      {formatShortSha(line.commitSha)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-700 mb-0.5">Authored</div>
                    <div className="text-gray-300">{timeAgo(line.authoredAt)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────

type PageStatus = 'loading' | 'building' | 'ready' | 'error';

export default function AuthorshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [summary, setSummary] = useState<AuthorshipResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileData, setFileData] = useState<
    NonNullable<AuthorshipResponse['file']> | null
  >(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [fileLoading, setFileLoading] = useState(false);
  const [selectedLine, setSelectedLine] = useState<AuthorshipLine | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Effect 1: 挂载拉 summary，若 building 轮询直到 ready
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${id}/authorship`);
        // 202 或 body.status==='building' 都当 building 处理
        const body = (await res.json()) as AuthorshipResponse & {
          error?: string;
        };
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('error');
          setErrorMsg('Project not found');
          return;
        }
        if (!res.ok && res.status !== 202) {
          setStatus('error');
          setErrorMsg(body.error ?? `HTTP ${res.status}`);
          return;
        }
        if (body.status === 'building' || body.files.length === 0) {
          setStatus('building');
          // 每 2s 重试
          timer = setTimeout(poll, 2000);
          return;
        }
        setSummary(body);
        setStatus('ready');
        // 默认自动展开第一层目录 + 选第一个文件
        if (body.files.length > 0 && !selectedFile) {
          const firstPath = body.files[0].path;
          // 展开到 firstPath 的所有前缀目录
          const parts = firstPath.split('/');
          const newExpanded = new Set<string>();
          for (let i = 1; i < parts.length; i++) {
            newExpanded.add(parts.slice(0, i).join('/'));
          }
          setExpanded(newExpanded);
          setSelectedFile(firstPath);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(String(err));
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Effect 2: selectedFile 变化拉 file 详情
  useEffect(() => {
    if (!selectedFile || status !== 'ready') return;
    let cancelled = false;
    setFileLoading(true);
    setSelectedLine(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${id}/authorship?file=${encodeURIComponent(selectedFile)}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setFileData(null);
            setErrorMsg(`Failed to load file: HTTP ${res.status}`);
          }
          return;
        }
        const body = (await res.json()) as AuthorshipResponse;
        if (!cancelled && body.file) {
          setFileData(body.file);
          setErrorMsg(null);
        }
      } catch (err) {
        if (!cancelled) setErrorMsg(String(err));
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, selectedFile, status]);

  const tree = useMemo(
    () => (summary ? buildTree(summary.files) : null),
    [summary],
  );
  const stats = useMemo(
    () => (summary ? computeStats(summary.files) : null),
    [summary],
  );

  const toggleDir = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  // ── renders ──

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen text-gray-700 text-sm">
        Loading…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <p className="text-red-400 text-sm">{errorMsg ?? 'Failed to load'}</p>
        <Link
          href={`/project/${id}`}
          className="text-indigo-400 text-xs mt-3 inline-block hover:text-indigo-300"
        >
          ← Back to project
        </Link>
      </div>
    );
  }

  if (status === 'building') {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <div className="flex items-center gap-2">
          <span className="pulse-dot inline-block w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-gray-300 text-sm">
            Building authorship index…
          </span>
        </div>
        <p className="text-gray-600 text-xs">
          This may take 30–60s on first visit.
        </p>
      </div>
    );
  }

  // status === 'ready'
  return (
    <div className="text-gray-100 h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-900 px-6 py-3 flex items-center gap-3 bg-gray-950/95">
        <Link
          href={`/project/${id}`}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          ← Project
        </Link>
        <span className="text-gray-800">/</span>
        <span className="text-white font-semibold text-sm">Authorship</span>
        {summary && (
          <span className="text-gray-700 text-xs ml-2">
            {summary.files.length} files
          </span>
        )}
        <span className="text-gray-800 text-xs ml-auto truncate max-w-xs">
          {summary?.projectPath}
        </span>
      </div>

      {/* Project map (GitHub-style heatmap) */}
      {summary && stats && (
        <ProjectMap
          files={summary.files}
          stats={stats}
          selectedPath={selectedFile}
          onSelect={setSelectedFile}
        />
      )}

      {/* Two-pane layout */}
      <div className="flex-1 flex min-h-0">
        {/* File tree */}
        <aside className="w-72 flex-shrink-0 border-r border-gray-900 overflow-y-auto py-2">
          {tree && (
            <TreeView
              node={tree}
              depth={0}
              selectedPath={selectedFile}
              onSelect={setSelectedFile}
              expanded={expanded}
              onToggle={toggleDir}
            />
          )}
        </aside>

        {/* Code viewer */}
        <main className="flex-1 overflow-auto bg-gray-950">
          {fileLoading && (
            <div className="p-6 text-gray-700 text-sm">Loading file…</div>
          )}
          {!fileLoading && !fileData && selectedFile && (
            <div className="p-6 text-gray-700 text-sm">
              {errorMsg ?? 'No data for this file.'}
            </div>
          )}
          {!fileLoading && !selectedFile && (
            <div className="p-6 text-gray-700 text-sm">
              Select a file from the tree.
            </div>
          )}
          {!fileLoading && fileData && (
            <>
              <div className="sticky top-0 border-b border-gray-900 bg-gray-950/95 backdrop-blur px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-gray-300 font-mono truncate">
                  {fileData.path}
                </span>
                <span className="text-gray-700 ml-auto">
                  {fileData.totalLines} lines
                </span>
              </div>
              <CodeViewer
                file={fileData}
                onSelectLine={setSelectedLine}
                selectedLineNumber={selectedLine?.lineNumber ?? null}
              />
            </>
          )}
        </main>
      </div>

      {/* Drawer */}
      <Drawer
        projectId={id}
        line={selectedLine}
        sessions={fileData?.sessions ?? []}
        onClose={() => setSelectedLine(null)}
      />
    </div>
  );
}
