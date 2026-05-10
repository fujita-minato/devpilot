import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendEvents, getFileSize, readAppendedText, readTailLines, type Event } from './events.ts';

test('appends event jsonl and reads the newest lines back', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'devpilot-events-'));
  const eventsPath = join(tempDir, 'events.jsonl');

  try {
    const first: Event = {
      ts: 1,
      kind: 'session.start',
      sessionId: 's1',
      project: '/tmp/demo',
      runner: 'claude',
      model: 'claude-sonnet-4-6',
      branch: 'main',
    };
    const second: Event = {
      ts: 2,
      kind: 'tool.search',
      sessionId: 's1',
      query: 'route.ts',
      hits: 3,
    };

    appendEvents([first, second], eventsPath);

    const lines = readTailLines(2, eventsPath);
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? '', /"kind":"session.start"/);
    assert.match(lines[1] ?? '', /"kind":"tool.search"/);

    const size = getFileSize(eventsPath);
    assert.ok(size > 0);

    const appended = readAppendedText(0, eventsPath);
    assert.equal(appended.position, size);
    assert.match(appended.text, /"sessionId":"s1"/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
