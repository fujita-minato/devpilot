import { NextResponse } from 'next/server';
import { buildWorkGraph } from '@/lib/graph/build-graph';

export async function GET() {
  try {
    return NextResponse.json(buildWorkGraph());
  } catch (error) {
    console.error('[GET /api/graph]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
