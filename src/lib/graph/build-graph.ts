import { db } from '@/lib/db';
import { codeAuthorship, projects, sessions } from '@/lib/schema';

export type WorkGraphNodeType =
  | 'workspace'
  | 'project'
  | 'session'
  | 'model'
  | 'runner'
  | 'branch'
  | 'file';

export interface WorkGraphNode {
  id: string;
  type: WorkGraphNodeType;
  label: string;
  subtitle: string | null;
  description: string | null;
  size: number;
  href: string | null;
  metrics: Record<string, number | string | null>;
}

export interface WorkGraphLink {
  id: string;
  source: string;
  target: string;
  type: 'contains' | 'used' | 'ran' | 'modeled' | 'branched' | 'authored';
  label: string | null;
  weight: number;
}

export interface WorkGraphResponse {
  generatedAt: number;
  totals: {
    projects: number;
    sessions: number;
    tokens: number;
    costUsd: number;
    aiLines: number;
    mixedLines: number;
  };
  nodes: WorkGraphNode[];
  links: WorkGraphLink[];
}

type ProjectRow = typeof projects.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type AuthorshipRow = typeof codeAuthorship.$inferSelect;

interface ProjectStats {
  sessions: number;
  tokens: number;
  costUsd: number;
  latestAt: number | null;
  claudeSessions: number;
  codexSessions: number;
  aiLines: number;
  mixedLines: number;
}

interface FileStats {
  projectId: string | null;
  file: string;
  aiLines: number;
  mixedLines: number;
  humanLines: number;
  sessionIds: Map<string, number>;
}

const MAX_SESSION_NODES = 48;
const MAX_FILE_NODES = 42;
const MAX_BRANCH_NODES = 36;

function tokenTotal(s: SessionRow): number {
  return (s.tokensIn ?? 0) + (s.tokensOut ?? 0);
}

function projectNodeId(id: string) {
  return `project:${id}`;
}

function sessionNodeId(id: string) {
  return `session:${id}`;
}

function modelNodeId(model: string) {
  return `model:${model || 'unknown'}`;
}

function runnerNodeId(runner: string) {
  return `runner:${runner || 'unknown'}`;
}

function branchNodeId(projectId: string, branch: string) {
  return `branch:${projectId}:${branch || 'unknown'}`;
}

function fileNodeId(projectId: string, file: string) {
  return `file:${projectId}:${file}`;
}

function addLink(
  links: WorkGraphLink[],
  seen: Set<string>,
  link: Omit<WorkGraphLink, 'id'>,
) {
  const id = `${link.type}:${link.source}->${link.target}:${link.label ?? ''}`;
  if (seen.has(id)) return;
  seen.add(id);
  links.push({ ...link, id });
}

function basename(file: string): string {
  const parts = file.split('/');
  return parts[parts.length - 1] || file;
}

function cleanText(text: string | null | undefined, max = 340): string | null {
  const cleaned = (text ?? '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' link ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function summarizeProjectStats(project: ProjectRow, projectSessions: SessionRow[]): ProjectStats {
  const tokens = projectSessions.reduce((sum, s) => sum + tokenTotal(s), 0);
  const costUsd = projectSessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  const latestAt = projectSessions.reduce<number | null>((max, s) => {
    if (!s.startedAt) return max;
    return max === null ? s.startedAt : Math.max(max, s.startedAt);
  }, project.lastActive ?? null);
  return {
    sessions: projectSessions.length,
    tokens,
    costUsd,
    latestAt,
    claudeSessions: projectSessions.filter((s) => s.source === 'claude').length,
    codexSessions: projectSessions.filter((s) => s.source === 'codex').length,
    aiLines: 0,
    mixedLines: 0,
  };
}

function buildFileStats(rows: AuthorshipRow[]): FileStats[] {
  const byFile = new Map<string, FileStats>();
  for (const row of rows) {
    const projectId = row.projectId;
    if (!projectId) continue;
    const key = `${projectId}:${row.file}`;
    const stat = byFile.get(key) ?? {
      projectId,
      file: row.file,
      aiLines: 0,
      mixedLines: 0,
      humanLines: 0,
      sessionIds: new Map<string, number>(),
    };
    if (row.author === 'ai-claude' || row.author === 'ai-codex') {
      stat.aiLines += 1;
      if (row.sessionId) {
        stat.sessionIds.set(row.sessionId, (stat.sessionIds.get(row.sessionId) ?? 0) + 1);
      }
    } else if (row.author === 'mixed') {
      stat.mixedLines += 1;
    } else if (row.author === 'human') {
      stat.humanLines += 1;
    }
    byFile.set(key, stat);
  }
  return [...byFile.values()].sort((a, b) => {
    const aw = a.aiLines * 2 + a.mixedLines;
    const bw = b.aiLines * 2 + b.mixedLines;
    return bw - aw;
  });
}

export function buildWorkGraph(): WorkGraphResponse {
  const allProjects = db.select().from(projects).all();
  const allSessions = db.select().from(sessions).all();
  const authorshipRows = db.select().from(codeAuthorship).all();

  const sessionsByProject = new Map<string, SessionRow[]>();
  for (const s of allSessions) {
    if (!s.projectId) continue;
    const list = sessionsByProject.get(s.projectId) ?? [];
    list.push(s);
    sessionsByProject.set(s.projectId, list);
  }
  for (const list of sessionsByProject.values()) {
    list.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  const projectStats = new Map<string, ProjectStats>();
  for (const project of allProjects) {
    projectStats.set(project.id, summarizeProjectStats(project, sessionsByProject.get(project.id) ?? []));
  }

  for (const row of authorshipRows) {
    if (!row.projectId) continue;
    const stats = projectStats.get(row.projectId);
    if (!stats) continue;
    if (row.author === 'ai-claude' || row.author === 'ai-codex') stats.aiLines += 1;
    if (row.author === 'mixed') stats.mixedLines += 1;
  }

  const nodes = new Map<string, WorkGraphNode>();
  const links: WorkGraphLink[] = [];
  const linkSeen = new Set<string>();

  const totalTokens = allSessions.reduce((sum, s) => sum + tokenTotal(s), 0);
  const totalCost = allSessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  const totalAiLines = authorshipRows.filter((r) => r.author === 'ai-claude' || r.author === 'ai-codex').length;
  const totalMixedLines = authorshipRows.filter((r) => r.author === 'mixed').length;
  const maxProjectTokens = Math.max(1, ...[...projectStats.values()].map((s) => s.tokens));

  nodes.set('workspace', {
    id: 'workspace',
    type: 'workspace',
    label: 'devpilot',
    subtitle: 'local AI development graph',
    description: 'Projects, sessions, models, branches, and AI-authored files from local logs.',
    size: 46,
    href: '/',
    metrics: {
      projects: allProjects.length,
      sessions: allSessions.length,
      tokens: totalTokens,
      costUsd: totalCost,
      aiLines: totalAiLines,
    },
  });

  for (const runner of ['claude', 'codex']) {
    const runnerSessions = allSessions.filter((s) => s.source === runner);
    const id = runnerNodeId(runner);
    nodes.set(id, {
      id,
      type: 'runner',
      label: runner,
      subtitle: runner === 'claude' ? 'Claude Code' : 'Codex',
      description: `${runnerSessions.length} sessions captured from ${runner}.`,
      size: 28 + Math.min(18, runnerSessions.length * 0.8),
      href: null,
      metrics: {
        sessions: runnerSessions.length,
        tokens: runnerSessions.reduce((sum, s) => sum + tokenTotal(s), 0),
        costUsd: runnerSessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
      },
    });
    addLink(links, linkSeen, {
      source: 'workspace',
      target: id,
      type: 'ran',
      label: 'runner',
      weight: Math.max(1, runnerSessions.length),
    });
  }

  const sortedProjects = [...allProjects].sort((a, b) => {
    const as = projectStats.get(a.id);
    const bs = projectStats.get(b.id);
    return (bs?.tokens ?? 0) - (as?.tokens ?? 0);
  });

  for (const project of sortedProjects) {
    const stats = projectStats.get(project.id);
    if (!stats) continue;
    const id = projectNodeId(project.id);
    nodes.set(id, {
      id,
      type: 'project',
      label: project.name,
      subtitle: project.branch ?? 'no branch',
      description: project.path,
      size: 18 + Math.sqrt(stats.tokens / maxProjectTokens) * 36,
      href: `/project/${project.id}`,
      metrics: {
        sessions: stats.sessions,
        tokens: stats.tokens,
        costUsd: stats.costUsd,
        aiLines: stats.aiLines,
        mixedLines: stats.mixedLines,
        latestAt: stats.latestAt,
      },
    });
    addLink(links, linkSeen, {
      source: 'workspace',
      target: id,
      type: 'contains',
      label: 'project',
      weight: Math.max(1, stats.sessions),
    });
    if (stats.claudeSessions > 0) {
      addLink(links, linkSeen, {
        source: id,
        target: runnerNodeId('claude'),
        type: 'ran',
        label: 'claude',
        weight: stats.claudeSessions,
      });
    }
    if (stats.codexSessions > 0) {
      addLink(links, linkSeen, {
        source: id,
        target: runnerNodeId('codex'),
        type: 'ran',
        label: 'codex',
        weight: stats.codexSessions,
      });
    }
  }

  const modelGroups = new Map<string, SessionRow[]>();
  for (const session of allSessions) {
    const model = session.model || '(unknown model)';
    const list = modelGroups.get(model) ?? [];
    list.push(session);
    modelGroups.set(model, list);
  }
  for (const [model, modelSessions] of [...modelGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const id = modelNodeId(model);
    const costUsd = modelSessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
    nodes.set(id, {
      id,
      type: 'model',
      label: model,
      subtitle: `${modelSessions.length} sessions`,
      description: 'Pricing and model mix relationship.',
      size: 17 + Math.min(24, Math.sqrt(modelSessions.length) * 6),
      href: null,
      metrics: {
        sessions: modelSessions.length,
        costUsd,
        tokens: modelSessions.reduce((sum, s) => sum + tokenTotal(s), 0),
      },
    });
    addLink(links, linkSeen, {
      source: 'workspace',
      target: id,
      type: 'modeled',
      label: 'model',
      weight: modelSessions.length,
    });
  }

  const sessionNodes = allSessions
    .filter((s) => s.startedAt !== null)
    .sort((a, b) => {
      const ac = a.costUsd ?? 0;
      const bc = b.costUsd ?? 0;
      if (bc !== ac) return bc - ac;
      return (b.startedAt ?? 0) - (a.startedAt ?? 0);
    })
    .slice(0, MAX_SESSION_NODES);
  const includedSessionIds = new Set(sessionNodes.map((s) => s.id));

  for (const session of sessionNodes) {
    const id = sessionNodeId(session.id);
    const runner = session.source === 'codex' ? 'codex' : session.source === 'claude' ? 'claude' : 'unknown';
    nodes.set(id, {
      id,
      type: 'session',
      label: cleanText(session.summary, 58) ?? session.id.slice(0, 8),
      subtitle: runner,
      description: cleanText(session.summary),
      size: 11 + Math.min(20, Math.sqrt(tokenTotal(session) / 12_000)),
      href: session.projectId ? `/project/${session.projectId}` : null,
      metrics: {
        startedAt: session.startedAt,
        duration: session.duration,
        tokens: tokenTotal(session),
        costUsd: session.costUsd,
        model: session.model,
      },
    });
    if (session.projectId && nodes.has(projectNodeId(session.projectId))) {
      addLink(links, linkSeen, {
        source: projectNodeId(session.projectId),
        target: id,
        type: 'used',
        label: 'session',
        weight: Math.max(1, Math.log10(tokenTotal(session) + 10)),
      });
    }
    if (nodes.has(runnerNodeId(runner))) {
      addLink(links, linkSeen, {
        source: id,
        target: runnerNodeId(runner),
        type: 'ran',
        label: runner,
        weight: 1,
      });
    }
    if (session.model && nodes.has(modelNodeId(session.model))) {
      addLink(links, linkSeen, {
        source: id,
        target: modelNodeId(session.model),
        type: 'modeled',
        label: session.model,
        weight: 1,
      });
    }
  }

  const branchCounts = new Map<string, { projectId: string; branch: string; sessions: number }>();
  for (const project of allProjects) {
    if (project.branch && project.branch !== 'HEAD') {
      branchCounts.set(`${project.id}:${project.branch}`, { projectId: project.id, branch: project.branch, sessions: 0 });
    }
  }
  for (const session of allSessions) {
    if (!session.projectId || !session.gitBranch || session.gitBranch === 'HEAD') continue;
    const key = `${session.projectId}:${session.gitBranch}`;
    const stat = branchCounts.get(key) ?? { projectId: session.projectId, branch: session.gitBranch, sessions: 0 };
    stat.sessions += 1;
    branchCounts.set(key, stat);
  }
  for (const branch of [...branchCounts.values()].sort((a, b) => b.sessions - a.sessions).slice(0, MAX_BRANCH_NODES)) {
    const id = branchNodeId(branch.projectId, branch.branch);
    nodes.set(id, {
      id,
      type: 'branch',
      label: branch.branch,
      subtitle: allProjects.find((p) => p.id === branch.projectId)?.name ?? null,
      description: 'Git branch observed through sessions or current project state.',
      size: 12 + Math.min(16, branch.sessions * 2),
      href: `/project/${branch.projectId}`,
      metrics: { sessions: branch.sessions },
    });
    addLink(links, linkSeen, {
      source: projectNodeId(branch.projectId),
      target: id,
      type: 'branched',
      label: 'branch',
      weight: Math.max(1, branch.sessions),
    });
  }

  const fileStats = buildFileStats(authorshipRows).slice(0, MAX_FILE_NODES);
  for (const file of fileStats) {
    if (!file.projectId) continue;
    const id = fileNodeId(file.projectId, file.file);
    nodes.set(id, {
      id,
      type: 'file',
      label: basename(file.file),
      subtitle: file.file,
      description: 'Tracked file with AI-authored or mixed lines.',
      size: 11 + Math.min(22, Math.sqrt(file.aiLines + file.mixedLines) * 1.4),
      href: `/project/${file.projectId}/authorship`,
      metrics: {
        aiLines: file.aiLines,
        mixedLines: file.mixedLines,
        humanLines: file.humanLines,
      },
    });
    addLink(links, linkSeen, {
      source: projectNodeId(file.projectId),
      target: id,
      type: 'authored',
      label: 'authorship',
      weight: Math.max(1, file.aiLines + file.mixedLines),
    });
    for (const [sessionId, count] of [...file.sessionIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
      if (!includedSessionIds.has(sessionId)) continue;
      addLink(links, linkSeen, {
        source: id,
        target: sessionNodeId(sessionId),
        type: 'authored',
        label: 'wrote',
        weight: Math.max(1, count),
      });
    }
  }

  return {
    generatedAt: Date.now(),
    totals: {
      projects: allProjects.length,
      sessions: allSessions.length,
      tokens: totalTokens,
      costUsd: totalCost,
      aiLines: totalAiLines,
      mixedLines: totalMixedLines,
    },
    nodes: [...nodes.values()],
    links,
  };
}
