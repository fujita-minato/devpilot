import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DEFAULT_HOST, DEFAULT_PORT } from './config.ts';
import { mapClaudeHookPayload } from './claude-hook.ts';
import { appendEvents } from './events.ts';

export interface HookReceiverOptions {
  host?: string;
  port?: number;
}

export async function startHookReceiver(options: HookReceiverOptions = {}): Promise<Server> {
  const activeSessions = new Set<string>();
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      respondJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/hook') {
      respondJson(response, 404, { ok: false, error: 'not_found' });
      return;
    }

    try {
      const payload = await readJsonBody(request);
      const events = mapClaudeHookPayload(payload, activeSessions);
      appendEvents(events);
      respondJson(response, 200, { ok: true, events: events.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      respondJson(response, 400, { ok: false, error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  return server;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    throw new Error('empty_request_body');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
}

function respondJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}
