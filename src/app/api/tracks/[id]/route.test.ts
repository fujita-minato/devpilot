import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db.ts';
import { projects, tracks } from '../../../../lib/schema.ts';
import { PATCH } from './route.ts';

const sqlite = new Database('devpilot.db');
const PROJECT_ID = 'phase6a5-test-project';
const TRACK_ID = 'phase6a5-test-track';

function cleanup(): void {
  db.delete(tracks).where(eq(tracks.id, TRACK_ID)).run();
  db.delete(projects).where(eq(projects.id, PROJECT_ID)).run();
}

function seedTrack(): void {
  cleanup();

  db.insert(projects).values({
    id: PROJECT_ID,
    name: 'Phase 6A.5 Test Project',
    path: '/tmp/phase6a5-test-project',
    branch: 'main',
    lastActive: 1,
  }).run();

  sqlite.prepare(`
    INSERT INTO tracks (
      id,
      project_id,
      name,
      stage,
      nickname,
      avatar,
      status_text,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @projectId,
      @name,
      @stage,
      @nickname,
      @avatar,
      @statusText,
      @createdAt,
      @updatedAt
    )
  `).run({
    id: TRACK_ID,
    projectId: PROJECT_ID,
    name: 'phase6a5-test-track',
    stage: 'review',
    nickname: 'Scout',
    avatar: '🦊',
    statusText: 'reviewing schema',
    createdAt: 10,
    updatedAt: 10,
  });
}

async function patchTrack(
  id: string,
  body: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await PATCH(
    new Request('http://localhost/api/tracks/test', {
      method: 'PATCH',
      body,
    }),
    { params: Promise.resolve({ id }) },
  );

  return {
    status: response.status,
    json: await response.json() as Record<string, unknown>,
  };
}

test('tracks table has persona columns', () => {
  const columns = sqlite
    .prepare('PRAGMA table_info(tracks)')
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  assert.equal(names.has('nickname'), true);
  assert.equal(names.has('avatar'), true);
  assert.equal(names.has('status_text'), true);
});

test('PATCH returns 404 when the track does not exist', async () => {
  const result = await patchTrack(
    'phase6a5-missing-track',
    JSON.stringify({ nickname: 'Ghost' }),
  );

  assert.equal(result.status, 404);
  assert.equal(result.json.error, 'Track not found');
});

test('PATCH returns 400 for invalid JSON', async () => {
  const result = await patchTrack(TRACK_ID, '{not-json');

  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'Invalid JSON');
});

test('PATCH returns 400 for an empty patch body', async () => {
  const result = await patchTrack(TRACK_ID, JSON.stringify({}));

  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'No fields to update');
});

test('PATCH updates persona fields and returns the updated track', async () => {
  try {
    seedTrack();

    const result = await patchTrack(
      TRACK_ID,
      JSON.stringify({
        nickname: 'Navigator',
        avatar: '🦉',
        statusText: 'mapping agent state',
      }),
    );

    const row = sqlite
      .prepare('SELECT nickname, avatar, status_text FROM tracks WHERE id = ?')
      .get(TRACK_ID) as {
        nickname: string | null;
        avatar: string | null;
        status_text: string | null;
      };

    assert.equal(result.status, 200);
    assert.equal(result.json.id, TRACK_ID);
    assert.equal(result.json.nickname, 'Navigator');
    assert.equal(result.json.avatar, '🦉');
    assert.equal(result.json.statusText, 'mapping agent state');
    assert.equal(row.nickname, 'Navigator');
    assert.equal(row.avatar, '🦉');
    assert.equal(row.status_text, 'mapping agent state');
  } finally {
    cleanup();
  }
});

test('PATCH updates only supplied fields', async () => {
  try {
    seedTrack();

    const result = await patchTrack(
      TRACK_ID,
      JSON.stringify({
        statusText: 'waiting for review',
      }),
    );

    const row = sqlite
      .prepare('SELECT nickname, avatar, status_text FROM tracks WHERE id = ?')
      .get(TRACK_ID) as {
        nickname: string | null;
        avatar: string | null;
        status_text: string | null;
      };

    assert.equal(result.status, 200);
    assert.equal(result.json.nickname, 'Scout');
    assert.equal(result.json.avatar, '🦊');
    assert.equal(result.json.statusText, 'waiting for review');
    assert.equal(row.nickname, 'Scout');
    assert.equal(row.avatar, '🦊');
    assert.equal(row.status_text, 'waiting for review');
  } finally {
    cleanup();
  }
});
