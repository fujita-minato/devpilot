import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEVPILOT_HOME = join(homedir(), '.devpilot');
export const EVENTS_PATH = join(DEVPILOT_HOME, 'events.jsonl');
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 7312;
export const DEFAULT_TAIL_LINES = 50;
