import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractClaudeEdits,
  extractCodexEdits,
  parseUnifiedPatch,
} from './tool-call-parser.ts';

async function writeJsonl(name: string, lines: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devpilot-authorship-'));
  const file = join(dir, name);
  await writeFile(
    file,
    lines
      .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
      .join('\n'),
    'utf-8',
  );
  return file;
}

test('extractClaudeEdits extracts Edit, Write, and MultiEdit tool calls', async () => {
  const file = await writeJsonl('claude.jsonl', [
    {
      type: 'assistant',
      timestamp: '2026-04-20T10:00:00.000Z',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Edit',
            input: {
              file_path: '/repo/src/app.ts',
              old_string: 'const oldValue = 1;',
              new_string: 'const newValue = 2;',
            },
          },
          {
            type: 'tool_use',
            name: 'Write',
            input: {
              file_path: '/repo/src/new.ts',
              content: 'export const created = true;\n',
            },
          },
          {
            type: 'tool_use',
            name: 'MultiEdit',
            input: {
              file_path: '/repo/src/multi.ts',
              edits: [
                {
                  old_string: 'alpha',
                  new_string: 'bravo',
                },
                {
                  old_string: 'charlie',
                  new_string: 'delta',
                },
              ],
            },
          },
        ],
      },
    },
  ]);

  const edits = await extractClaudeEdits(file, 'claude-session');

  assert.equal(edits.length, 4);
  assert.deepEqual(
    edits.map((edit) => edit.tool),
    ['Edit', 'Write', 'MultiEdit', 'MultiEdit'],
  );
  assert.equal(edits[0].filePath, '/repo/src/app.ts');
  assert.equal(edits[0].newText, 'const newValue = 2;');
  assert.equal(edits[1].oldText, null);
  assert.equal(edits[2].newText, 'bravo');
  assert.equal(edits[3].newText, 'delta');
  assert.ok(edits.every((edit) => edit.sessionId === 'claude-session'));
  assert.ok(edits.every((edit) => edit.timestamp === Date.UTC(2026, 3, 20, 10)));
});

test('extractClaudeEdits skips malformed JSON and incomplete tool calls', async () => {
  const file = await writeJsonl('claude-bad.jsonl', [
    '{bad json',
    {
      type: 'assistant',
      timestamp: '2026-04-20T10:00:00.000Z',
      message: {
        content: [
          { type: 'tool_use', name: 'Edit', input: { new_string: 'missing path' } },
          { type: 'tool_use', name: 'Write', input: { file_path: '/repo/empty.ts' } },
          { type: 'tool_use', name: 'Read', input: { file_path: '/repo/read.ts' } },
        ],
      },
    },
    {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Edit',
            input: {
              file_path: '/repo/no-timestamp.ts',
              new_string: 'const missingTimestamp = true;',
            },
          },
        ],
      },
    },
  ]);

  const edits = await extractClaudeEdits(file, 'bad-claude-session');

  assert.deepEqual(edits, []);
});

test('parseUnifiedPatch extracts update and add hunks while skipping deletes', () => {
  const hunks = parseUnifiedPatch(`*** Begin Patch
*** Update File: src/app.ts
@@
-const oldValue = 1;
+const newValue = 2;
*** Add File: src/new.ts
+export const created = true;
+export const secondLine = true;
*** Delete File: src/deleted.ts
-remove me
*** End Patch`);

  assert.equal(hunks.length, 2);
  assert.equal(hunks[0].file, 'src/app.ts');
  assert.equal(hunks[0].op, 'update');
  assert.equal(hunks[0].oldLines, 'const oldValue = 1;');
  assert.equal(hunks[0].newLines, 'const newValue = 2;');
  assert.equal(hunks[1].file, 'src/new.ts');
  assert.equal(hunks[1].op, 'add');
  assert.equal(
    hunks[1].newLines,
    'export const created = true;\nexport const secondLine = true;',
  );
});

test('extractCodexEdits extracts apply_patch arguments from Codex rollout JSONL', async () => {
  const patch = `*** Begin Patch
*** Update File: src/app.ts
@@
-const oldValue = 1;
+const newValue = 2;
*** Add File: src/new.ts
+export const created = true;
*** End Patch`;

  const file = await writeJsonl('codex.jsonl', [
    {
      type: 'response_item',
      timestamp: '2026-04-21T08:30:00.000Z',
      payload: {
        type: 'function_call',
        name: 'apply_patch',
        arguments: JSON.stringify({ input: patch }),
      },
    },
  ]);

  const edits = await extractCodexEdits(file, 'codex-session');

  assert.equal(edits.length, 2);
  assert.deepEqual(
    edits.map((edit) => edit.filePath),
    ['src/app.ts', 'src/new.ts'],
  );
  assert.ok(edits.every((edit) => edit.tool === 'apply_patch'));
  assert.equal(edits[0].oldText, 'const oldValue = 1;');
  assert.equal(edits[0].newText, 'const newValue = 2;');
  assert.equal(edits[1].oldText, null);
  assert.equal(edits[1].newText, 'export const created = true;');
});

test('extractCodexEdits skips malformed or incomplete apply_patch calls', async () => {
  const file = await writeJsonl('codex-bad.jsonl', [
    '{bad json',
    {
      type: 'response_item',
      timestamp: '2026-04-21T08:30:00.000Z',
      payload: {
        type: 'function_call',
        name: 'shell',
        arguments: JSON.stringify({ input: 'cat file' }),
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-04-21T08:30:00.000Z',
      payload: {
        type: 'function_call',
        name: 'apply_patch',
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'apply_patch',
        arguments: JSON.stringify({ input: '*** Begin Patch\n*** End Patch' }),
      },
    },
  ]);

  const edits = await extractCodexEdits(file, 'bad-codex-session');

  assert.deepEqual(edits, []);
});
