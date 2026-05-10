import type { Runner, SessionState, Stage } from './types';

export function toRunner(value: string | null | undefined): Runner {
  if (value === 'claude' || value === 'codex') return value;
  return 'unknown';
}

export function toStage(value: string | null | undefined): Stage {
  if (
    value === 'think' ||
    value === 'review' ||
    value === 'build' ||
    value === 'test' ||
    value === 'done'
  ) {
    return value;
  }
  return 'unknown';
}

export function toSessionState(nowDoing: string | null, startedAt: number | null, duration: number | null): SessionState {
  if (duration !== null) return 'ended';
  if (nowDoing) return 'typing';
  if (startedAt !== null && Date.now() - startedAt < 30 * 60 * 1000) return 'idle';
  return 'ended';
}
