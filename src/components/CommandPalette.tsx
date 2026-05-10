'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShell } from './AppShell';

interface ProjectLite {
  id: string;
  name: string;
}

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  action: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { onSync } = useShell();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load projects only while the palette is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setProjects(
            data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const allCommands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [
      {
        id: 'nav-home',
        label: 'Mission Control',
        hint: '全プロジェクト概要',
        group: 'ナビゲーション',
        action: () => router.push('/'),
      },
      {
        id: 'nav-graph',
        label: 'Relationship Graph',
        hint: 'プロジェクト / セッション / モデル / 帰属グラフ',
        group: 'ナビゲーション',
        action: () => router.push('/graph'),
      },
      {
        id: 'nav-report',
        label: 'Weekly Report',
        hint: '週次 markdown レポート',
        group: 'ナビゲーション',
        action: () => router.push('/report'),
      },
      {
        id: 'action-sync',
        label: 'Sync now',
        hint: 'JSONL データを再解析',
        group: 'アクション',
        action: () => onSync(),
      },
    ];
    for (const p of projects) {
      cmds.push({
        id: `project-${p.id}`,
        label: p.name,
        hint: 'Project detail',
        group: 'Projects',
        action: () => router.push(`/project/${p.id}`),
      });
      cmds.push({
        id: `authorship-${p.id}`,
        label: `${p.name} — Authorship`,
        hint: '行単位 AI authorship',
        group: 'Authorship',
        action: () => router.push(`/project/${p.id}/authorship`),
      });
    }
    return cmds;
  }, [projects, router, onSync]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint?.toLowerCase().includes(q) ?? false) ||
        c.group.toLowerCase().includes(q),
    );
  }, [allCommands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const c of filtered) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setActiveIdx(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  const togglePalette = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        setQuery('');
        setActiveIdx(0);
      }
      return !wasOpen;
    });
  }, []);

  // 全局键盘:⌘K / Ctrl+K 切换,Esc 关闭,/ 打开
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA';

      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === 'Escape') {
        closePalette();
        return;
      }
      if (!isEditable && e.key === '/') {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, closePalette, togglePalette]);

  // 打开时聚焦输入(不 setState,只调 DOM)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const runActive = useCallback(() => {
    const cmd = filtered[activeIdx];
    if (!cmd) return;
    cmd.action();
    setOpen(false);
  }, [filtered, activeIdx]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <button
        aria-label="关闭"
        className="absolute inset-0 cursor-default"
        onClick={closePalette}
        type="button"
      />
      <div className="relative w-full max-w-xl rounded-xl border border-gray-800 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <span className="text-gray-500 text-sm" aria-hidden>⌕</span>
          <input
            className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-100 placeholder:text-gray-600"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="跳转或执行命令…"
            ref={inputRef}
            value={query}
          />
          <kbd className="text-[10px] text-gray-600 border border-gray-800 px-1.5 py-0.5 rounded">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {grouped.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-600">无匹配结果</div>
          ) : (
            grouped.map(([group, items]) => (
              <div className="py-1" key={group}>
                <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
                  {group}
                </div>
                {items.map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  const active = idx === activeIdx;
                  return (
                    <button
                      className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-850'
                      }`}
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setOpen(false);
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                      type="button"
                    >
                      <span className="truncate">{cmd.label}</span>
                      {cmd.hint ? (
                        <span className="text-xs text-gray-500 ml-3 flex-shrink-0">
                          {cmd.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-600 flex items-center gap-3">
          <span>
            <kbd className="text-gray-500">↑↓</kbd> 选择
          </span>
          <span>
            <kbd className="text-gray-500">↵</kbd> 触发
          </span>
          <span>
            <kbd className="text-gray-500">esc</kbd> 关闭
          </span>
          <span className="ml-auto">
            <kbd className="text-gray-500">⌘K</kbd> 切换
          </span>
        </div>
      </div>
    </div>
  );
}
