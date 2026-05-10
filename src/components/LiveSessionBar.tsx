'use client';

import { useEffect, useState } from 'react';
import type { LiveSession } from '@/lib/ingest/live-monitor';

function statusColor(status: string): string {
  if (status === 'thinking' || status === 'tool_use') return 'bg-emerald-400';
  if (status === 'notification') return 'bg-yellow-400';
  return 'bg-gray-500';
}

function statusLabel(s: LiveSession): string {
  if (s.lastFile) return `${s.status} · ${s.lastFile.split('/').pop()}`;
  if (s.lastTool) return `${s.status} · ${s.lastTool}`;
  return s.status;
}

export function LiveSessionBar() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/live');
        if (res.ok) setSessions(await res.json());
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Live Sessions
        </span>
        <span className="text-xs text-gray-600">({sessions.length})</span>
      </div>
      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.pid} className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(s.status)}`}
            />
            <span className="text-white text-sm font-medium min-w-[120px]">
              {s.projectName}
            </span>
            <span className="text-gray-400 text-xs truncate">
              {statusLabel(s)}
            </span>
            {s.branch && (
              <span className="ml-auto flex-shrink-0 text-indigo-400 font-mono text-xs bg-indigo-950/50 px-2 py-0.5 rounded">
                {s.branch}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
