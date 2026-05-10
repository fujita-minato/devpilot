import process from 'node:process';
import { DEFAULT_HOST, DEFAULT_PORT, DEFAULT_TAIL_LINES, EVENTS_PATH } from './config.ts';
import { ensureEventsFile, getFileSize, readAppendedText, readTailLines } from './events.ts';
import { startDaemon } from './index.ts';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command = 'help', ...rest] = argv;

  switch (command) {
    case 'daemon':
      await runDaemon(rest);
      return;
    case 'tail':
      await runTail(rest);
      return;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      printHelp();
      process.exitCode = 1;
  }
}

async function runDaemon(argv: string[]): Promise<void> {
  const port = readFlagNumber(argv, '--port') ?? DEFAULT_PORT;
  const host = readFlagString(argv, '--host') ?? DEFAULT_HOST;
  const server = await startDaemon({ host, port });

  console.log(`devpilot daemon listening on http://${host}:${port}`);

  await new Promise<void>((resolve, reject) => {
    server.on('close', () => resolve());
    server.on('error', reject);
  });
}

async function runTail(argv: string[]): Promise<void> {
  const follow = !argv.includes('--no-follow');
  const lines = readFlagNumber(argv, '--lines') ?? readFlagNumber(argv, '-n') ?? DEFAULT_TAIL_LINES;

  ensureEventsFile();

  for (const line of readTailLines(lines, EVENTS_PATH)) {
    console.log(line);
  }

  if (!follow) {
    return;
  }

  let position = getFileSize(EVENTS_PATH);
  let buffered = '';

  const flush = () => {
    const next = readAppendedText(position, EVENTS_PATH);
    position = next.position;
    if (!next.text) {
      return;
    }

    buffered += next.text;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';

    for (const line of lines) {
      if (line) {
        console.log(line);
      }
    }
  };

  const timer = setInterval(flush, 400);

  await new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(timer);
      flush();
      resolve();
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

function readFlagString(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function readFlagNumber(argv: string[], name: string): number | undefined {
  const raw = readFlagString(argv, name);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`invalid value for ${name}: ${raw}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`Usage:
  devpilot daemon [--host 127.0.0.1] [--port 7312]
  devpilot tail [-n 50] [--no-follow]`);
}
