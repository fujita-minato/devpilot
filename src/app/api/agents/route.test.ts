import test from 'node:test';
import assert from 'node:assert/strict';
import { inArray } from 'drizzle-orm';
import { db } from '../../../lib/db.ts';
import { projects, tracks } from '../../../lib/schema.ts';
import { GET } from './route.ts';

const PROJECT_IDS = ['phase6a5-agent-project-a', 'phase6a5-agent-project-b'];
const TRACK_IDS = [
  'phase6a5-agent-track-active',
  'phase6a5-agent-track-named-done',
  'phase6a5-agent-track-hidden',
];
const UPDATED_AT_BASE = 9_000_000_000_000;

function cleanup(): void {
  db.delete(tracks).where(inArray(tracks.id, TRACK_IDS)).run();
  db.delete(projects).where(inArray(projects.id, PROJECT_IDS)).run();
}

function seedAgents(): void {
  cleanup();

  db.insert(projects).values([
    {
      id: PROJECT_IDS[0],
      name: 'Agent Project A',
      path: '/tmp/agent-project-a',
      branch: 'main',
      lastActive: 1,
    },
    {
      id: PROJECT_IDS[1],
      name: 'Agent Project B',
      path: '/tmp/agent-project-b',
      branch: 'main',
      lastActive: 1,
    },
  ]).run();

  db.insert(tracks).values([
    {
      id: TRACK_IDS[0],
      projectId: PROJECT_IDS[0],
      name: 'active-agent-track',
      stage: 'review',
      nickname: null,
      avatar: null,
      statusText: null,
      createdAt: 10,
      updatedAt: UPDATED_AT_BASE + 30,
    },
    {
      id: TRACK_IDS[1],
      projectId: PROJECT_IDS[1],
      name: 'named-done-track',
      stage: 'done',
      nickname: 'Finisher',
      avatar: '🐼',
      statusText: 'documenting closure',
      createdAt: 10,
      updatedAt: UPDATED_AT_BASE + 40,
    },
    {
      id: TRACK_IDS[2],
      projectId: PROJECT_IDS[1],
      name: 'hidden-done-track',
      stage: 'done',
      nickname: null,
      avatar: null,
      statusText: null,
      createdAt: 10,
      updatedAt: UPDATED_AT_BASE + 50,
    },
  ]).run();
}

test('GET /api/agents returns named agents and active tracks only, newest first', async () => {
  try {
    seedAgents();

    const response = await GET(new Request('http://localhost/api/agents?limit=12'));
    const json = await response.json() as Array<Record<string, unknown>>;

    assert.equal(response.status, 200);

    const ids = json.map((agent) => agent.id);
    const namedIndex = ids.indexOf('phase6a5-agent-track-named-done');
    const activeIndex = ids.indexOf('phase6a5-agent-track-active');

    assert.notEqual(namedIndex, -1);
    assert.notEqual(activeIndex, -1);
    assert.equal(namedIndex < activeIndex, true);
    assert.equal(ids.includes('phase6a5-agent-track-hidden'), false);

    const named = json.find((agent) => agent.id === 'phase6a5-agent-track-named-done');
    assert.equal(named?.projectId, PROJECT_IDS[1]);
    assert.equal(named?.projectName, 'Agent Project B');
    assert.equal(named?.nickname, 'Finisher');
    assert.equal(named?.avatar, '🐼');
    assert.equal(named?.statusText, 'documenting closure');
    assert.equal(named?.stage, 'done');
    assert.equal(named?.updatedAt, UPDATED_AT_BASE + 40);
  } finally {
    cleanup();
  }
});
