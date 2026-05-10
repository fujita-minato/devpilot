import { existsSync, readFileSync } from 'node:fs';
import type { Event, SessionEndReason } from './events.ts';

type JsonObject = Record<string, unknown>;

interface EditChunk {
  oldString: string;
  newString: string;
}

interface EditLocation {
  lineStart: number;
  lineEnd: number;
  addedLines: number;
  removedLines: number;
}

const EDIT_TOOLS = new Set(['edit', 'write', 'multiedit']);
const READ_TOOLS = new Set(['read', 'ls']);
const SEARCH_TOOLS = new Set(['grep', 'glob', 'search', 'websearch']);
const BASH_TOOLS = new Set(['bash', 'execcommand']);

export function mapClaudeHookPayload(payload: unknown, activeSessions: Set<string>): Event[] {
  const body = asRecord(payload);
  if (!body) {
    return [];
  }

  const sessionId = readString(body, ['session_id', 'sessionId']);
  if (!sessionId) {
    return [];
  }

  const ts = getTimestamp(body);
  const hookEventName = readString(body, ['hook_event_name', 'hookEventName', 'event']) ?? '';
  const project = readString(body, ['cwd', 'project', 'project_path', 'projectPath']) ?? 'unknown';
  const model = readModel(body);
  const branch = readString(body, ['git_branch', 'gitBranch', 'branch']) ?? '';
  const events: Event[] = [];

  if (hookEventName !== 'Stop' && !activeSessions.has(sessionId)) {
    activeSessions.add(sessionId);
    events.push({
      ts,
      kind: 'session.start',
      sessionId,
      project,
      runner: 'claude',
      model,
      branch,
    });
  }

  if (hookEventName === 'Stop') {
    activeSessions.delete(sessionId);
    events.push({
      ts,
      kind: 'session.end',
      sessionId,
      reason: readStopReason(body),
      tokensIn: readInputTokens(body),
      tokensOut: readOutputTokens(body),
      toolCalls: readNumber(body, ['tool_calls', 'toolCalls']) ?? 0,
    });
    events.push(...readRateLimitEvents(body, ts));
    return events;
  }

  const shouldEmitToolEvent = hookEventName === '' || hookEventName === 'PostToolUse' || hookEventName === 'Notification';
  if (!shouldEmitToolEvent) {
    events.push(...readRateLimitEvents(body, ts));
    return events;
  }

  const toolRecord = readRecord(body, ['tool']);
  const toolName = normalizeToolName(
    readString(body, ['tool_name', 'toolName', 'name']) ??
      (toolRecord ? readString(toolRecord, ['name']) : undefined) ??
      '',
  );
  const toolInput =
    readRecord(body, ['tool_input', 'toolInput', 'input']) ??
    (toolRecord ? readRecord(toolRecord, ['input']) : undefined) ??
    {};

  if (toolName) {
    if (EDIT_TOOLS.has(toolName)) {
      const filePath = readFilePath(body, toolInput);
      if (filePath) {
        const location = locateEdit(filePath, toolInput);
        events.push({
          ts,
          kind: 'tool.edit',
          sessionId,
          file: filePath,
          lineStart: location.lineStart,
          lineEnd: location.lineEnd,
          addedLines: location.addedLines,
          removedLines: location.removedLines,
        });
      }
    } else if (BASH_TOOLS.has(toolName)) {
      events.push({
        ts,
        kind: 'tool.bash',
        sessionId,
        cmd: readString(toolInput, ['command', 'cmd']) ?? readString(body, ['command', 'cmd']) ?? '',
        exit:
          readNumber(readRecord(body, ['tool_response', 'toolResponse']) ?? {}, ['exit_code', 'exitCode', 'exit']) ??
          readNumber(body, ['exit_code', 'exitCode', 'exit']) ??
          0,
        durMs: readNumber(body, ['duration_ms', 'durationMs', 'durMs']) ?? 0,
      });
    } else if (SEARCH_TOOLS.has(toolName)) {
      events.push({
        ts,
        kind: 'tool.search',
        sessionId,
        query:
          readString(toolInput, ['query', 'pattern', 'term', 'path']) ??
          readString(body, ['query', 'pattern']) ??
          toolName,
        hits:
          readNumber(readRecord(body, ['tool_response', 'toolResponse']) ?? {}, ['hits', 'count']) ??
          readNumber(body, ['hits', 'count']) ??
          0,
      });
    } else if (READ_TOOLS.has(toolName)) {
      const filePath = readFilePath(body, toolInput);
      if (filePath) {
        events.push({
          ts,
          kind: 'tool.read',
          sessionId,
          file: filePath,
        });
      }
    }
  }

  events.push(...readRateLimitEvents(body, ts));
  return events;
}

function locateEdit(filePath: string, toolInput: JsonObject): EditLocation {
  const chunks = readEditChunks(toolInput);
  if (chunks.length === 0) {
    return {
      lineStart: 1,
      lineEnd: 1,
      addedLines: 0,
      removedLines: 0,
    };
  }

  let lineStart = Number.MAX_SAFE_INTEGER;
  let lineEnd = 1;
  let addedLines = 0;
  let removedLines = 0;

  for (const chunk of chunks) {
    const location = locateChunk(filePath, chunk);
    lineStart = Math.min(lineStart, location.lineStart);
    lineEnd = Math.max(lineEnd, location.lineEnd);
    addedLines += location.addedLines;
    removedLines += location.removedLines;
  }

  return {
    lineStart: Number.isFinite(lineStart) ? lineStart : 1,
    lineEnd,
    addedLines,
    removedLines,
  };
}

function locateChunk(filePath: string, chunk: EditChunk): EditLocation {
  const addedLines = countLines(chunk.newString);
  const removedLines = countLines(chunk.oldString);

  if (!chunk.oldString || !existsSync(filePath)) {
    return {
      lineStart: 1,
      lineEnd: Math.max(1, removedLines),
      addedLines,
      removedLines,
    };
  }

  const raw = readFileSync(filePath, 'utf8');
  const index = raw.indexOf(chunk.oldString);
  if (index === -1) {
    return {
      lineStart: 1,
      lineEnd: Math.max(1, removedLines),
      addedLines,
      removedLines,
    };
  }

  const before = raw.slice(0, index);
  const lineStart = before.split('\n').length;
  return {
    lineStart,
    lineEnd: lineStart + Math.max(removedLines, 1) - 1,
    addedLines,
    removedLines,
  };
}

function readEditChunks(toolInput: JsonObject): EditChunk[] {
  const directOld = readString(toolInput, ['old_string', 'oldString']);
  const directNew = readString(toolInput, ['new_string', 'newString']);
  if (directOld !== undefined || directNew !== undefined) {
    return [{
      oldString: directOld ?? '',
      newString: directNew ?? '',
    }];
  }

  const edits = toolInput.edits;
  if (!Array.isArray(edits)) {
    return [];
  }

  return edits
    .map((item) => asRecord(item))
    .filter((item): item is JsonObject => item !== null)
    .map((item) => ({
      oldString: readString(item, ['old_string', 'oldString']) ?? '',
      newString: readString(item, ['new_string', 'newString']) ?? '',
    }));
}

function readRateLimitEvents(body: JsonObject, ts: number): Event[] {
  const rateLimits = readRecord(body, ['rate_limits', 'rateLimits']);
  if (!rateLimits) {
    return [];
  }

  const events: Event[] = [];
  const windows: Array<{ key: '5h' | 'weekly'; source: string[] }> = [
    { key: '5h', source: ['five_hour', 'fiveHour'] },
    { key: 'weekly', source: ['weekly'] },
  ];

  for (const window of windows) {
    const details = readRecord(rateLimits, window.source);
    if (!details) {
      continue;
    }

    const usedPct = readNumber(details, ['used_percentage', 'usedPct']) ?? 0;
    const tokensUsed = readNumber(details, ['tokens_used', 'tokensUsed']) ?? 0;
    const tokensLimit = readNumber(details, ['tokens_limit', 'tokensLimit']) ?? 0;
    const resetAt = readTimestamp(details, ['resets_at', 'resetAt']) ?? ts;

    events.push({
      ts,
      kind: 'rate.limit',
      provider: 'claude',
      window: window.key,
      usedPct,
      tokensUsed,
      tokensLimit,
      resetAt,
    });
  }

  return events;
}

function readFilePath(body: JsonObject, toolInput: JsonObject): string | undefined {
  return (
    readString(toolInput, ['file_path', 'filePath', 'path']) ??
    readString(body, ['file_path', 'filePath', 'path'])
  );
}

function readInputTokens(body: JsonObject): number {
  const usage = readRecord(body, ['usage']) ?? {};
  return (
    readNumber(usage, ['input_tokens', 'inputTokens']) ??
    0
  ) + (
    readNumber(usage, ['cache_creation_input_tokens', 'cacheCreationInputTokens']) ??
    0
  ) + (
    readNumber(usage, ['cache_read_input_tokens', 'cacheReadInputTokens']) ??
    0
  );
}

function readOutputTokens(body: JsonObject): number {
  const usage = readRecord(body, ['usage']) ?? {};
  return (
    readNumber(usage, ['output_tokens', 'outputTokens']) ??
    0
  ) + (
    readNumber(usage, ['reasoning_output_tokens', 'reasoningOutputTokens']) ??
    0
  );
}

function readModel(body: JsonObject): string {
  const model = body.model;
  if (typeof model === 'string' && model.trim()) {
    return model;
  }

  const modelRecord = asRecord(model);
  if (modelRecord) {
    return (
      readString(modelRecord, ['display_name', 'displayName', 'id', 'name']) ??
      'unknown'
    );
  }

  return 'unknown';
}

function readStopReason(body: JsonObject): SessionEndReason {
  const value =
    readString(body, ['reason', 'stop_reason', 'stopReason']) ??
    (body.error ? 'error' : 'user');

  if (value === 'timeout') {
    return 'timeout';
  }
  if (value === 'error') {
    return 'error';
  }
  return 'user';
}

function getTimestamp(body: JsonObject): number {
  return readTimestamp(body, ['timestamp', 'ts']) ?? Date.now();
}

function readTimestamp(record: JsonObject, keys: string[]): number | undefined {
  const raw = readValue(record, keys);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readString(record: JsonObject, keys: string[]): string | undefined {
  const raw = readValue(record, keys);
  if (typeof raw === 'string') {
    return raw;
  }
  return undefined;
}

function readNumber(record: JsonObject, keys: string[]): number | undefined {
  const raw = readValue(record, keys);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readRecord(record: JsonObject, keys: string[]): JsonObject | undefined {
  const raw = readValue(record, keys);
  return asRecord(raw) ?? undefined;
}

function readValue(record: JsonObject, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }
  const lines = value.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.length;
}

function asRecord(value: unknown): JsonObject | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}
