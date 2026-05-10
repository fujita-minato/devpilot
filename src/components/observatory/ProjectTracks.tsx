'use client';

// ProjectTracks — product-style project board.
// The first version was a dense table; this version groups work into lanes so
// the user can scan status by shape and position before reading details.

import { tokens } from './tokens';
import type { ProjectSummary, QuietBranch, Stage } from '@/lib/observatory/types';
import {
  formatRelativeTime,
  Mono,
  primaryRunner,
  runnerColor,
  runnerShort,
  stageColor,
} from './primitives/shared';

type ProjectCard = {
  project: ProjectSummary;
  attention?: QuietBranch;
};

type Lane = {
  id: string;
  title: string;
  color: string;
  items: ProjectCard[];
};

export function ProjectTracks({
  projects,
  quietBranches = [],
  onOpen,
}: {
  projects: ProjectSummary[];
  quietBranches?: QuietBranch[];
  onOpen: (p: ProjectSummary) => void;
}) {
  const attentionByProject = new Map(quietBranches.map((branch) => [branch.projectId, branch]));
  const cards = projects.map((project) => ({
    project,
    attention: attentionByProject.get(project.id),
  }));
  const lanes: Lane[] = [
    {
      id: 'review',
      title: 'Review',
      color: tokens.warn,
      items: cards.filter(({ project, attention }) => project.quiet || attention),
    },
    {
      id: 'active',
      title: 'Active',
      color: tokens.success,
      items: cards.filter(
        ({ project, attention }) => project.sessions7d > 0 && !project.quiet && !attention,
      ),
    },
    {
      id: 'progress',
      title: 'In progress',
      color: tokens.brand,
      items: cards.filter(
        ({ project, attention }) =>
          project.stage !== 'done' &&
          project.sessions7d === 0 &&
          !project.quiet &&
          !attention,
      ),
    },
    {
      id: 'done',
      title: 'Done / idle',
      color: tokens.success,
      items: cards.filter(
        ({ project, attention }) => project.stage === 'done' && !project.quiet && !attention,
      ),
    },
  ];

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: tokens.text }}>
            Project board
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: tokens.muted }}>
            Grouped by what you can act on.
          </p>
        </div>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {projects.length} projects
        </Mono>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {lanes.map((lane) => (
            <ProjectLane key={lane.id} lane={lane} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectLane({ lane, onOpen }: { lane: Lane; onOpen: (p: ProjectSummary) => void }) {
  return (
    <div
      className="p-3"
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full"
            style={{ background: lane.color }}
          />
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: tokens.text }}>
            {lane.title}
          </h3>
        </div>
        <Mono className="text-[11px]" style={{ color: tokens.muted }}>
          {lane.items.length}
        </Mono>
      </div>

      <div className="space-y-2">
        {lane.items.length === 0 ? (
          <div
            className="flex h-[70px] items-center justify-center text-[11px]"
            style={{ background: tokens.raised, color: tokens.dim }}
          >
            empty
          </div>
        ) : (
          lane.items.map((item) => (
            <ProjectTile
              item={item}
              key={item.project.id}
              laneColor={lane.color}
              onOpen={() => onOpen(item.project)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectTile({
  item,
  laneColor,
  onOpen,
}: {
  item: ProjectCard;
  laneColor: string;
  onOpen: () => void;
}) {
  const { project, attention } = item;
  const runner = primaryRunner(project.runnerMix);
  const runnerC = runnerColor(runner);
  const accent = attention || project.quiet ? tokens.warn : laneColor;

  return (
    <button
      className="dp-row w-full overflow-hidden p-3 text-left"
      onClick={onOpen}
      style={{ background: tokens.raised, border: `1px solid ${tokens.divider}` }}
      type="button"
    >
      <div className="flex items-start gap-3">
        <StatusGlyph color={accent} stage={project.stage} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-semibold" style={{ color: tokens.text }}>
              {project.name}
            </span>
            <Mono className="shrink-0 text-[10px]" style={{ color: tokens.muted }}>
              {formatRelativeTime(project.lastSeen)}
            </Mono>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stageColor(project.stage) }} />
            <span className="truncate text-[10px] uppercase tracking-[0.10em]" style={{ color: tokens.muted }}>
              {project.stage}
            </span>
            <Mono className="truncate text-[10px]" style={{ color: tokens.dim }}>
              {project.branch ?? 'no branch'}
            </Mono>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <SignalTicks color={project.sessions7d > 0 ? runnerC : tokens.faint} sessions={project.sessions7d} />
        <div className="flex items-center gap-2">
          <Mono className="text-[10px]" style={{ color: runnerC }}>
            {runner === 'unknown' ? 'none' : runnerShort(runner)}
          </Mono>
          <Mono className="text-[11px]" style={{ color: tokens.textDim }}>
            {project.sessions7d}
          </Mono>
        </div>
      </div>

      {attention ? (
        <div className="mt-3 h-1 w-full" style={{ background: tokens.warn }} />
      ) : null}
    </button>
  );
}

function StatusGlyph({ color, stage }: { color: string; stage: Stage }) {
  return (
    <div
      className="grid size-9 shrink-0 place-items-center rounded"
      style={{ background: tokens.surface, border: `1px solid ${color}` }}
    >
      <span
        className="block size-3 rounded-sm"
        style={{
          background: color,
          opacity: stage === 'done' ? 0.55 : 1,
          transform: stage === 'test' ? 'rotate(45deg)' : 'none',
        }}
      />
    </div>
  );
}

function SignalTicks({ color, sessions }: { color: string; sessions: number }) {
  const active = Math.min(8, sessions);
  return (
    <div className="flex h-7 items-end gap-1" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => {
        const filled = index < active;
        return (
          <span
            className="block w-1.5 rounded-sm"
            key={index}
            style={{
              background: filled ? color : tokens.faint,
              height: 6 + index * 2,
              opacity: filled ? 0.9 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="px-4 py-8 text-center text-[12px]"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        color: tokens.muted,
      }}
    >
      no projects observed yet
    </div>
  );
}
