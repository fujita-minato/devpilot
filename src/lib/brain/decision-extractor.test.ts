import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFromSummary } from './decision-extractor.ts';

test('extractFromSummary extracts local decision signals without remote calls', () => {
  const result = extractFromSummary(`
    - Decided to use SQLite for local persistence.
    - Decided to use SQLite for local persistence.
    - Dropped Redis because localhost does not need a queue.
    - Fixed copy and updated docs.
    - Updated docs because they are useful.
  `);

  assert.deepEqual(result, [
    {
      title: 'Decided to use SQLite for local persistence.',
      reason: '',
      status: 'accepted',
    },
    {
      title: 'Dropped Redis because localhost does not need a queue.',
      reason: '',
      status: 'deprecated',
    },
  ]);
});
