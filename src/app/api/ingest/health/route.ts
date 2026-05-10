import { NextResponse } from 'next/server';
import { getLiveMonitorLastTickMs, getLiveSessions } from '@/lib/ingest/live-monitor';
import type { IngestHealth } from '@/lib/observatory/types';

export async function GET() {
  try {
    const liveSessions = getLiveSessions();
    const lastTickMs = getLiveMonitorLastTickMs();
    const response: IngestHealth = {
      lastTickMs,
      laggingSeconds: Math.max(0, Math.floor((Date.now() - lastTickMs) / 1000)),
      watchers: liveSessions.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/ingest/health]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
