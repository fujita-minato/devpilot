'use client';

import type { ReactNode } from 'react';
import { tokens } from './tokens';
import type { ProjectSummary } from '@/lib/observatory/types';
import { DrawerShell } from './primitives/DrawerShell';
import { Icon } from './primitives/Icons';
import {
  formatCostUsd,
  formatRelativeTime,
  Mono,
  primaryRunner,
  RunnerTag,
  StageBadge,
} from './primitives/shared';

export function ProjectDrawer({
  project,
  onClose,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
}) {
  return (
    <DrawerShell
      onClose={onClose}
      open={project !== null}
      title={project?.name ?? 'Project'}
      width={460}
    >
      {project ? <ProjectDrawerBody project={project} /> : null}
    </DrawerShell>
  );
}

function ProjectDrawerBody({ project }: { project: ProjectSummary }) {
  const runner = primaryRunner(project.runnerMix);

  return (
    <div className="flex flex-col">
      <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="text-[18px] font-semibold"
            style={{ color: tokens.text, letterSpacing: -0.3 }}
          >
            {project.name}
          </span>
          <RunnerTag runner={runner} />
        </div>
        <div
          className="flex items-center gap-2 text-[11px]"
          style={{ color: tokens.muted }}
        >
          <Icon name="git-branch" size={11} strokeWidth={1.75} />
          <Mono>{project.branch ?? 'unknown'}</Mono>
          <span style={{ color: tokens.faint }}>·</span>
          <StageBadge stage={project.stage} />
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-5 grid grid-cols-2 gap-5">
          <KpiTile label="sessions · 7d" value={String(project.sessions7d)} />
          <KpiTile label="spend · 7d" value={formatCostUsd(project.cost7dUsd)} />
        </div>

        <div>
          <StatRow
            label="path"
            value={<Mono style={{ color: tokens.textDim }}>{project.path}</Mono>}
          />
          <StatRow
            label="last seen"
            value={
              <span style={{ color: tokens.textDim }}>
                {formatRelativeTime(project.lastSeen)}
              </span>
            }
          />
          <StatRow
            label="runner mix"
            value={
              <span>
                <Mono style={{ color: tokens.claude }}>
                  {Math.round(project.runnerMix.claude * 100)}%
                </Mono>
                <span style={{ color: tokens.faint }}> · </span>
                <Mono style={{ color: tokens.codex }}>
                  {Math.round(project.runnerMix.codex * 100)}%
                </Mono>
              </span>
            }
          />
          <StatRow
            label="quiet signal"
            value={
              <span
                style={{ color: project.quiet ? tokens.warn : tokens.muted }}
              >
                {project.quiet ? 'flagged' : 'clear'}
              </span>
            }
          />
        </div>

        <div
          className="mt-6 flex items-start gap-2 rounded-md px-3 py-2.5 text-[11px]"
          style={{
            background: tokens.bg,
            border: `1px solid ${tokens.border}`,
            color: tokens.muted,
            lineHeight: 1.5,
          }}
        >
          <span
            aria-hidden="true"
            style={{ color: tokens.brand, flexShrink: 0, lineHeight: 1.5 }}
          >
            ●
          </span>
          <span>
            Passive observation only — no Resume, no Launch. Use your terminal or
            IDE for actions.
          </span>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: tokens.muted }}
      >
        {label}
      </div>
      <Mono
        className="mt-1.5 block"
        style={{
          color: tokens.text,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.3,
          lineHeight: 1,
        }}
      >
        {value}
      </Mono>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-2.5"
      style={{ borderTop: `1px solid ${tokens.divider}` }}
    >
      <span
        className="shrink-0 text-[10px] font-medium uppercase tracking-[0.10em]"
        style={{ color: tokens.muted }}
      >
        {label}
      </span>
      <span
        className="min-w-0 truncate text-right text-[12px]"
        style={{ color: tokens.text }}
      >
        {value}
      </span>
    </div>
  );
}
