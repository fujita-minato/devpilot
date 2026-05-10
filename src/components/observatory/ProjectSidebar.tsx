'use client';

// ProjectSidebar — Linear 风。
// 紧凑 1 行 = 状态点 + 项目名 + 时间。
// 副信息(cc/cx · tokens · dirty)hover 时浮出。
// 分 3 桶:Active / Recent / Cold。

import type { MonitorProject } from '@/app/api/monitor/route';
import { tokens } from './tokens';
import { formatRelativeTime, formatTokens } from './primitives/shared';

type Bucket = 'hot' | 'warm' | 'cold';

function lastTouchedAt(project: MonitorProject): number | null {
  const cands: number[] = [];
  for (const r of [project.runners.cc, project.runners.cx]) {
    if (r.lastAt) cands.push(r.lastAt);
  }
  for (const h of project.history) cands.push(h.startedAt);
  return cands.length === 0 ? null : Math.max(...cands);
}

function bucketOf(lastAt: number | null): Bucket {
  if (!lastAt) return 'cold';
  const age = Date.now() - lastAt;
  if (age < 24 * 3_600_000) return 'hot';
  if (age < 7 * 86_400_000) return 'warm';
  return 'cold';
}

function dotColor(b: Bucket): string {
  if (b === 'hot') return tokens.success;
  if (b === 'warm') return tokens.warn;
  return tokens.dim;
}

function ProjectRow({
  project,
  selected,
  onSelect,
}: {
  project: MonitorProject;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const last = lastTouchedAt(project);
  const bucket = bucketOf(last);
  const totalTok = project.tokens.in + project.tokens.out;
  const cc = project.runners.cc.sessionCount;
  const cx = project.runners.cx.sessionCount;
  const dirty = project.git?.uncommitted ?? 0;

  return (
    <li>
      <button
        aria-current={selected ? 'true' : undefined}
        className="dp-sidebar-row group w-full text-left"
        onClick={() => onSelect(project.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px 6px 14px',
          borderLeft: `2px solid ${selected ? tokens.brand : 'transparent'}`,
          background: selected ? tokens.brandSoft : 'transparent',
          cursor: 'pointer',
          minHeight: 30,
        }}
        type="button"
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: dotColor(bucket),
            flexShrink: 0,
          }}
        />
        <span
          className="flex-1 truncate text-[12.5px]"
          style={{
            color: selected ? tokens.text : tokens.textDim,
            fontWeight: selected ? 500 : 400,
          }}
          title={project.name}
        >
          {project.name}
        </span>
        {/* 默认显示时间 · hover 时切到详细 */}
        <span
          className="text-[10.5px] font-mono tabular-nums dp-sidebar-meta"
          style={{ color: tokens.muted, flexShrink: 0 }}
          title={`${cc} cc · ${cx} cx · ${formatTokens(totalTok)} tokens${dirty > 0 ? ` · ${dirty} dirty` : ''}`}
        >
          <span className="dp-sidebar-meta-default">
            {last ? formatRelativeTime(last) : '—'}
          </span>
          <span className="dp-sidebar-meta-hover" style={{ display: 'none' }}>
            <span
              style={{ color: cc > 0 ? tokens.claude : tokens.dim }}
            >
              {cc}
            </span>
            <span style={{ color: tokens.dim }}>·</span>
            <span style={{ color: cx > 0 ? tokens.codex : tokens.dim }}>
              {cx}
            </span>
            {dirty > 0 ? (
              <>
                <span style={{ color: tokens.dim, marginLeft: 4 }}>·</span>
                <span style={{ color: tokens.warn, marginLeft: 4 }}>
                  {dirty}d
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function BucketGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <div
        className="flex items-baseline gap-2 px-3.5 pt-3 pb-1"
        style={{ color: tokens.muted }}
      >
        <span
          className="text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ color: tokens.muted }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: tokens.dim }}
        >
          {count}
        </span>
      </div>
      <ul role="list">{children}</ul>
    </section>
  );
}

export function ProjectSidebar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: MonitorProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const hot: MonitorProject[] = [];
  const warm: MonitorProject[] = [];
  const cold: MonitorProject[] = [];
  for (const p of projects) {
    const b = bucketOf(lastTouchedAt(p));
    if (b === 'hot') hot.push(p);
    else if (b === 'warm') warm.push(p);
    else cold.push(p);
  }

  return (
    <aside
      className="flex flex-col"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
      }}
    >
      <BucketGroup count={hot.length} label="Active">
        {hot.map((p) => (
          <ProjectRow
            key={p.id}
            onSelect={onSelect}
            project={p}
            selected={p.id === selectedId}
          />
        ))}
      </BucketGroup>
      <BucketGroup count={warm.length} label="Recent">
        {warm.map((p) => (
          <ProjectRow
            key={p.id}
            onSelect={onSelect}
            project={p}
            selected={p.id === selectedId}
          />
        ))}
      </BucketGroup>
      <BucketGroup count={cold.length} label="Cold">
        {cold.map((p) => (
          <ProjectRow
            key={p.id}
            onSelect={onSelect}
            project={p}
            selected={p.id === selectedId}
          />
        ))}
      </BucketGroup>
      <div style={{ height: 8 }} />
    </aside>
  );
}
