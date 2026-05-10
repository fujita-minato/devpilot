import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mapClaudeHookPayload } from './claude-hook.ts';

test('maps a Claude post-edit payload into session.start and tool.edit events', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'devpilot-hook-'));
  const filePath = join(tempDir, 'route.ts');
  const tracker = new Set<string>();

  try {
    writeFileSync(filePath, 'const a = 1;\nconst b = 2;\n', 'utf8');

    const events = mapClaudeHookPayload({
      hook_event_name: 'PostToolUse',
      session_id: 'session-1',
      cwd: tempDir,
      git_branch: 'main',
      model: 'claude-sonnet-4-6',
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'const b = 2;\n',
        new_string: 'const b = 3;\n',
      },
    }, tracker);

    assert.equal(events.length, 2);
    assert.equal(events[0]?.kind, 'session.start');
    assert.equal(events[1]?.kind, 'tool.edit');

    if (events[1]?.kind !== 'tool.edit') {
      throw new Error('expected tool.edit event');
    }

    assert.equal(events[1].file, filePath);
    assert.equal(events[1].lineStart, 2);
    assert.equal(events[1].lineEnd, 2);
    assert.equal(events[1].addedLines, 1);
    assert.equal(events[1].removedLines, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('maps a Claude stop payload into session.end and clears tracker state', () => {
  const tracker = new Set<string>(['session-2']);
  const events = mapClaudeHookPayload({
    hook_event_name: 'Stop',
    session_id: 'session-2',
    reason: 'timeout',
    usage: {
      input_tokens: 11,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 7,
      output_tokens: 5,
      reasoning_output_tokens: 2,
    },
    tool_calls: 4,
  }, tracker);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'session.end');

  if (events[0]?.kind !== 'session.end') {
    throw new Error('expected session.end event');
  }

  assert.equal(events[0].reason, 'timeout');
  assert.equal(events[0].tokensIn, 21);
  assert.equal(events[0].tokensOut, 7);
  assert.equal(events[0].toolCalls, 4);
  assert.equal(tracker.has('session-2'), false);
});
