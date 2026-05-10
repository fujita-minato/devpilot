import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EVENTS_PATH } from './config.ts';

export type Runner = 'claude' | 'codex';
export type SessionEndReason = 'user' | 'error' | 'timeout';
export type RateLimitWindow = '5h' | 'weekly';

export type Event =
  | {
      ts: number;
      kind: 'session.start';
      sessionId: string;
      project: string;
      runner: Runner;
      model: string;
      branch: string;
    }
  | {
      ts: number;
      kind: 'session.end';
      sessionId: string;
      reason: SessionEndReason;
      tokensIn: number;
      tokensOut: number;
      toolCalls: number;
    }
  | {
      ts: number;
      kind: 'tool.edit';
      sessionId: string;
      file: string;
      lineStart: number;
      lineEnd: number;
      addedLines: number;
      removedLines: number;
    }
  | {
      ts: number;
      kind: 'tool.read';
      sessionId: string;
      file: string;
    }
  | {
      ts: number;
      kind: 'tool.bash';
      sessionId: string;
      cmd: string;
      exit: number;
      durMs: number;
    }
  | {
      ts: number;
      kind: 'tool.search';
      sessionId: string;
      query: string;
      hits: number;
    }
  | {
      ts: number;
      kind: 'rate.limit';
      provider: Runner;
      window: RateLimitWindow;
      usedPct: number;
      tokensUsed: number;
      tokensLimit: number;
      resetAt: number;
    }
  | {
      ts: number;
      kind: 'git.commit';
      project: string;
      sha: string;
      author: 'human' | 'claude' | 'codex';
      msg: string;
    }
  | {
      ts: number;
      kind: 'git.branch';
      project: string;
      branch: string;
    }
  | {
      ts: number;
      kind: 'human.edit';
      project: string;
      file: string;
      lineStart: number;
      lineEnd: number;
    }
  | {
      ts: number;
      kind: 'human.todo';
      project: string;
      file: string;
      line: number;
      text: string;
    };

export function ensureEventsFile(filePath = EVENTS_PATH): string {
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '', 'utf8');
  }
  return filePath;
}

export function appendEvents(events: Event[], filePath = EVENTS_PATH): void {
  if (events.length === 0) {
    return;
  }

  ensureEventsFile(filePath);
  const payload = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  appendFileSync(filePath, payload, 'utf8');
}

export function readTailLines(lineCount: number, filePath = EVENTS_PATH): string[] {
  ensureEventsFile(filePath);
  const raw = readFileSync(filePath, 'utf8');
  return raw.split('\n').filter(Boolean).slice(-lineCount);
}

export function getFileSize(filePath = EVENTS_PATH): number {
  ensureEventsFile(filePath);
  return statSync(filePath).size;
}

export function readAppendedText(fromPosition: number, filePath = EVENTS_PATH): {
  text: string;
  position: number;
} {
  ensureEventsFile(filePath);
  const size = statSync(filePath).size;
  const safePosition = size < fromPosition ? 0 : fromPosition;

  if (size === safePosition) {
    return { text: '', position: size };
  }

  const raw = readFileSync(filePath, 'utf8');
  return {
    text: raw.slice(safePosition),
    position: size,
  };
}
