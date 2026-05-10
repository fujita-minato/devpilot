import { getLiveSessions } from '@/lib/ingest/live-monitor';

export async function GET() {
  return Response.json(getLiveSessions());
}
