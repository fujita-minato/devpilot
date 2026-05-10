import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/lib/db';
import { codeAuthorship, decisions, projects, sessions } from '@/lib/schema';
import { formatCostUsd } from '@/lib/pricing';

type ProjectRow = typeof projects.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

export interface WeeklyReportProject {
  id: string;
  name: string;
  sessions: number;
  costUsd: number;
  tokens: number;
  claudeSessions: number;
  codexSessions: number;
  latestAt: number | null;
}

export interface WeeklyReportModel {
  model: string;
  sessions: number;
  costUsd: number;
  tokens: number;
}

export interface WeeklyReportResult {
  week: string;
  from: number;
  to: number;
  filename: string;
  outputPath: string;
  markdown: string;
  metrics: {
    projectsTouched: number;
    sessions: number;
    costUsd: number;
    tokens: number;
    aiLines: number;
    mixedLines: number;
  };
  byProject: WeeklyReportProject[];
  byModel: WeeklyReportModel[];
}

function tokenTotal(session: SessionRow): number {
  return (session.tokensIn ?? 0) + (session.tokensOut ?? 0);
}

function weekStart(now: Date): Date {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function summarize(text: string | null | undefined): string {
  const cleaned = (text ?? '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' link ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'No summary captured.';
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function projectName(projectsById: Map<string, ProjectRow>, projectId: string | null): string {
  if (!projectId) return '(unknown)';
  return projectsById.get(projectId)?.name ?? '(unknown)';
}

function buildProjectSlices(
  weekSessions: SessionRow[],
  projectsById: Map<string, ProjectRow>,
): WeeklyReportProject[] {
  const byProject = new Map<string, WeeklyReportProject>();
  for (const session of weekSessions) {
    const id = session.projectId ?? 'unknown';
    const current = byProject.get(id) ?? {
      id,
      name: projectName(projectsById, session.projectId),
      sessions: 0,
      costUsd: 0,
      tokens: 0,
      claudeSessions: 0,
      codexSessions: 0,
      latestAt: null,
    };
    current.sessions += 1;
    current.costUsd += session.costUsd ?? 0;
    current.tokens += tokenTotal(session);
    if (session.source === 'claude') current.claudeSessions += 1;
    if (session.source === 'codex') current.codexSessions += 1;
    if (session.startedAt) current.latestAt = Math.max(current.latestAt ?? 0, session.startedAt);
    byProject.set(id, current);
  }
  return [...byProject.values()].sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);
}

function buildModelSlices(weekSessions: SessionRow[]): WeeklyReportModel[] {
  const byModel = new Map<string, WeeklyReportModel>();
  for (const session of weekSessions) {
    const model = session.model ?? '(unknown)';
    const current = byModel.get(model) ?? {
      model,
      sessions: 0,
      costUsd: 0,
      tokens: 0,
    };
    current.sessions += 1;
    current.costUsd += session.costUsd ?? 0;
    current.tokens += tokenTotal(session);
    byModel.set(model, current);
  }
  return [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd || b.sessions - a.sessions);
}

function renderProjectTable(projects: WeeklyReportProject[]): string {
  if (projects.length === 0) return '_No sessions captured this week._';
  const rows = projects.slice(0, 12).map((project) =>
    `| ${project.name} | ${project.sessions} | ${project.claudeSessions}/${project.codexSessions} | ${formatTokens(project.tokens)} | ${formatCostUsd(project.costUsd)} | ${project.latestAt ? formatDate(project.latestAt) : '—'} |`,
  );
  return [
    '| Project | Sessions | Claude/Codex | Tokens | Cost | Latest |',
    '|---|---:|---:|---:|---:|---|',
    ...rows,
  ].join('\n');
}

function renderModelTable(models: WeeklyReportModel[]): string {
  if (models.length === 0) return '_No model usage captured this week._';
  const rows = models.slice(0, 10).map((model) =>
    `| ${model.model} | ${model.sessions} | ${formatTokens(model.tokens)} | ${formatCostUsd(model.costUsd)} |`,
  );
  return [
    '| Model | Sessions | Tokens | Cost |',
    '|---|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

export function buildWeeklyReport(now = new Date()): WeeklyReportResult {
  const start = weekStart(now);
  const from = start.getTime();
  const to = now.getTime();
  const week = isoWeekLabel(start);
  const filename = `${week}.md`;
  const outputPath = join(process.cwd(), 'docs', 'weekly', filename);

  const allProjects = db.select().from(projects).all();
  const allSessions = db.select().from(sessions).all();
  const allDecisions = db.select().from(decisions).all();
  const authorshipRows = db.select().from(codeAuthorship).all();
  const projectsById = new Map(allProjects.map((project) => [project.id, project]));

  const weekSessions = allSessions
    .filter((session) => (session.startedAt ?? 0) >= from && (session.startedAt ?? 0) <= to)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

  const byProject = buildProjectSlices(weekSessions, projectsById);
  const byModel = buildModelSlices(weekSessions);
  const costUsd = weekSessions.reduce((sum, session) => sum + (session.costUsd ?? 0), 0);
  const tokens = weekSessions.reduce((sum, session) => sum + tokenTotal(session), 0);
  const aiLines = authorshipRows.filter((row) => row.author === 'ai-claude' || row.author === 'ai-codex').length;
  const mixedLines = authorshipRows.filter((row) => row.author === 'mixed').length;
  const decisionRows = allDecisions
    .filter((decision) => (decision.createdAt ?? 0) >= from && (decision.createdAt ?? 0) <= to)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 8);

  const recentWork = weekSessions.slice(0, 10).map((session) => {
    const runner = session.source === 'codex' ? 'Codex' : session.source === 'claude' ? 'Claude' : 'Unknown';
    return `- **${projectName(projectsById, session.projectId)}** · ${runner} · ${session.startedAt ? formatDate(session.startedAt) : '—'} — ${summarize(session.summary)}`;
  });

  const decisionsText =
    decisionRows.length > 0
      ? decisionRows
          .map((decision) => `- **${summarize(decision.title)}** — ${summarize(decision.reason ?? decision.status ?? 'recorded')}`)
          .join('\n')
      : '- No ADR/decision rows captured this week.';

  const attention =
    byProject.length > 0
      ? byProject
          .filter((project) => project.sessions >= 2 || project.costUsd > 1)
          .slice(0, 5)
          .map((project) => `- ${project.name}: ${project.sessions} sessions, ${formatCostUsd(project.costUsd)}, ${formatTokens(project.tokens)} tokens`)
          .join('\n')
      : '- No active project needs attention based on captured sessions.';

  const markdown = [
    `# Weekly Report ${week}`,
    '',
    `Generated: ${formatDate(to)}`,
    `Window: ${formatDate(from)} - ${formatDate(to)}`,
    '',
    '## Summary',
    '',
    `- Projects touched: ${byProject.length}`,
    `- Sessions: ${weekSessions.length}`,
    `- Token volume: ${formatTokens(tokens)}`,
    `- Estimated AI spend: ${formatCostUsd(costUsd)}`,
    `- Authorship snapshot: ${aiLines} AI lines, ${mixedLines} mixed lines`,
    '',
    '## Cost By Project',
    '',
    renderProjectTable(byProject),
    '',
    '## Model Mix',
    '',
    renderModelTable(byModel),
    '',
    '## Recent Work',
    '',
    recentWork.length > 0 ? recentWork.join('\n') : '- No session summaries captured this week.',
    '',
    '## Decisions',
    '',
    decisionsText,
    '',
    '## Attention',
    '',
    attention,
    '',
  ].join('\n');

  return {
    week,
    from,
    to,
    filename,
    outputPath,
    markdown,
    metrics: {
      projectsTouched: byProject.length,
      sessions: weekSessions.length,
      costUsd,
      tokens,
      aiLines,
      mixedLines,
    },
    byProject,
    byModel,
  };
}

export async function writeWeeklyReport(now = new Date()): Promise<WeeklyReportResult> {
  const report = buildWeeklyReport(now);
  await fs.mkdir(join(process.cwd(), 'docs', 'weekly'), { recursive: true });
  await fs.writeFile(report.outputPath, report.markdown, 'utf-8');
  return report;
}
