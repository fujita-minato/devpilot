'use client';

import { useState } from 'react';

type PersonaState = {
  nickname: string | null;
  avatar: string | null;
  statusText: string | null;
};

type Props = {
  trackId: string;
  initial: PersonaState;
  onSaved?: (next: Props['initial']) => void;
  onCancel?: () => void;
};

type PatchResponse = PersonaState & {
  error?: string;
};

const AVATARS = ['🦊', '🐼', '🦉', '🐙', '🦄', '🐢', '🐝', '🦅'];

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function AgentAvatarPicker({
  trackId,
  initial,
  onSaved,
  onCancel,
}: Props) {
  const [nickname, setNickname] = useState(initial.nickname ?? '');
  const [avatar, setAvatar] = useState(initial.avatar ?? '');
  const [statusText, setStatusText] = useState(initial.statusText ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    const next = {
      nickname: normalizeOptionalText(nickname),
      avatar: normalizeOptionalText(avatar),
      statusText: normalizeOptionalText(statusText),
    };

    try {
      const response = await fetch(`/api/tracks/${encodeURIComponent(trackId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(next),
      });
      const body = await response.json() as PatchResponse;

      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const saved = {
        nickname: body.nickname ?? null,
        avatar: body.avatar ?? null,
        statusText: body.statusText ?? null,
      };

      onSaved?.(saved);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : 'Failed to save agent';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-gray-800 bg-gray-900/90 p-3 shadow-xl">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            Nickname
          </span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={24}
            placeholder="Scout"
            className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-700 focus:border-indigo-600"
          />
        </label>

        <label className="block sm:w-24">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            Avatar
          </span>
          <input
            value={avatar}
            onChange={(event) => setAvatar(event.target.value)}
            maxLength={12}
            placeholder="🦊"
            className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-center text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-700 focus:border-indigo-600"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {AVATARS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setAvatar(option)}
            className={`rounded-lg border px-2.5 py-1.5 text-base transition-colors ${
              avatar === option
                ? 'border-indigo-500 bg-indigo-950/70'
                : 'border-gray-800 bg-gray-950 hover:border-gray-700'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Status
        </span>
        <input
          value={statusText}
          onChange={(event) => setStatusText(event.target.value)}
          maxLength={80}
          placeholder="reviewing schema"
          className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-700 focus:border-indigo-600"
        />
      </label>

      {error && (
        <div className="mt-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-700 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-700"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
