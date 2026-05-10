export type Runner = 'claude' | 'codex' | 'unknown';
export type Stage = 'think' | 'review' | 'build' | 'test' | 'done' | 'unknown';
export type SessionState = 'typing' | 'thinking' | 'idle' | 'ended';

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  branch: string | null;
  stage: Stage;
  lastSeen: number;
  sessions7d: number;
  cost7dUsd: number | null;
  runnerMix: { claude: number; codex: number };
  quiet: boolean;
}

export interface ActiveSession {
  sessionId: string;
  projectId: string;
  projectName: string;
  runner: Runner;
  model: string | null;
  state: SessionState;
  nowDoing: string | null;
  startedAt: number;
  tokensIn: number;
  tokensOut: number;
}

export type QuietSeverity = 'notice' | 'warn';

export interface QuietBranch {
  projectId: string;
  projectName: string;
  branch: string;
  stage: Stage;
  daysInStage: number;
  lastCommit: number | null;
  lastSession: number | null;
  reason: string;
  severity: QuietSeverity;
}

export interface RateLimitWindow {
  provider: 'claude' | 'codex';
  label: string;
  windowStart: number;
  windowEnd: number;
  usedPct: number;
  unknown?: boolean;
}

export type ActivityKind =
  | 'session.started'
  | 'session.ended'
  | 'session.error'
  | 'commit.pushed'
  | 'build.failed'
  | 'stalled.detected'
  | 'branch.switched';

export interface ActivityEvent {
  id: string;
  at: number;
  kind: ActivityKind;
  runner: Runner | null;
  projectId: string;
  projectName: string;
  text: string;
}

export type HeatmapMatrix = number[][];

export interface LastSignal {
  at: number;
  projectName: string;
  kind: ActivityKind;
}

export interface IngestHealth {
  lastTickMs: number;
  laggingSeconds: number;
  watchers: number;
}
