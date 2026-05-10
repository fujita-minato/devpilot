import { NextResponse } from 'next/server.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db.ts';
import { tracks } from '../../../../lib/schema.ts';

type PatchBody = {
  nickname?: string | null;
  avatar?: string | null;
  statusText?: string | null;
};

type TrackPatch = Partial<Pick<
  typeof tracks.$inferInsert,
  'nickname' | 'avatar' | 'statusText' | 'updatedAt'
>>;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: PatchBody;

  try {
    body = await req.json() as PatchBody;
  } catch (err) {
    console.error('[PATCH /api/tracks/:id] invalid json', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: TrackPatch = {};
  if ('nickname' in body) patch.nickname = body.nickname ?? null;
  if ('avatar' in body) patch.avatar = body.avatar ?? null;
  if ('statusText' in body) patch.statusText = body.statusText ?? null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  patch.updatedAt = Date.now();

  try {
    const updated = db
      .update(tracks)
      .set(patch)
      .where(eq(tracks.id, id))
      .returning()
      .all();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[PATCH /api/tracks/:id] db error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
