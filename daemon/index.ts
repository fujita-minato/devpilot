import { DEFAULT_HOST, DEFAULT_PORT } from './config.ts';
import { startHookReceiver } from './hook-receiver.ts';

export async function startDaemon(options: {
  host?: string;
  port?: number;
} = {}) {
  return startHookReceiver({
    host: options.host ?? DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
  });
}
