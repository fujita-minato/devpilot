/**
 * live-monitor.ts
 * 实时读取 ~/.devpilot/live/ 目录，发现所有 VS Code 窗口的 Claude Code 进程
 */

import { readdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface LiveSession {
  pid: number;
  status: string;       // thinking | idle | waiting | tool_use | notification
  project: string;
  projectName: string;
  branch: string;
  sessionId: string;
  lastTool: string;
  lastFile: string;
  updatedAt: number;
}

const LIVE_DIR = join(homedir(), '.devpilot', 'live');
const STALE_MS = 5 * 60 * 1000; // 5分钟没更新视为已死
let lastTickMs = Date.now();

export function getLiveMonitorLastTickMs(): number {
  return lastTickMs;
}

export function getLiveSessions(): LiveSession[] {
  lastTickMs = Date.now();

  let files: string[];
  try {
    files = readdirSync(LIVE_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const now = Date.now();
  const result: LiveSession[] = [];

  for (const f of files) {
    try {
      const raw = readFileSync(join(LIVE_DIR, f), 'utf-8');
      const data = JSON.parse(raw) as LiveSession;

      if (now - data.updatedAt > STALE_MS) {
        // 超时的文件清理掉
        try { unlinkSync(join(LIVE_DIR, f)); } catch {}
        continue;
      }

      result.push(data);
    } catch {
      // 文件损坏或正在写入，跳过
    }
  }

  return result;
}
