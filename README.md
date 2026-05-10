# devpilot

**AI 支援コーディングのための、ローカルファーストな可観測性ダッシュボード。**

devpilot は Claude Code と Codex の session log をローカルディスクから読み取り、手元の git 状態と結合して、「複数プロジェクトで自分が何をしてきたのか」を 1 つの画面で見えるようにする。データは外部へ送らない。

> AI が多くのコードを書く vibecoding workflow 向け。Claude / Codex が実際に何をしたのかを、プロジェクト単位で追跡するためのツール。

---

## 答えられること

Claude Code または Codex を使ったローカルプロジェクトごとに、次を確認できる。

1. **各プロジェクトはどの状態か** — branch、stage、最後に触った時刻、git status（uncommitted / ahead）
2. **Claude と Codex はそれぞれ何をしたか** — runner ごとの session 数、token 合計、最後の session summary
3. **実際に何が変わったか** — working tree の未 commit ファイルと、直近 20 commits で触ったファイル。言語アイコン付き
4. **いくら使ったか** — project × runner の token 合計と既知モデルの USD pricing
5. **どの branch が止まっているか** — 全 repo 横断の rule-based detection（`/api/quiet-branches`）
6. **どのコードを AI が書いたか** — ファイルごとの行単位 authorship view（`/project/[id]/authorship`）

外部 API 呼び出しなし。ログインなし。Telemetry なし。すべてローカルマシン上に残る。

---

## ホーム画面の構成

```text
┌─ TopNav ──────────────────────────────────────────────────────────┐
│ ◆ devpilot / project-name        22p · 5 active · 1.2M [↻]       │
├─────────────────┬─────────────────────────────────────────────────┤
│ Sidebar (Linear)│  Project hero (Vercel-style)                    │
│                 │   ├ name + status badge + branch · last         │
│  ACTIVE · 24h   │   └ KPI grid: Sessions / Tokens / Dirty / Last  │
│  ● web-app  2h  │                                                 │
│  ● api-core 5h  │  Claude vs Codex                                │
│                 │   ├ cc panel (orange) — sessions, tokens, last  │
│  RECENT · 7d    │   └ cx panel (steel)  — sessions, tokens, last  │
│  ○ docs     1d  │                                                 │
│                 │  ▸ Sessions     [collapsible · top 5 of N]      │
│  COLD · older   │  ▸ Files        [collapsible · with icons]      │
│  · cli      7d  │  ▸ Commits      [git log -3]                    │
│  · …            │                                                 │
└─────────────────┴─────────────────────────────────────────────────┘
```

- **Sidebar** は project を Active / Recent / Cold に分類する。行に hover すると時刻表示が `cc · cx · dirty` summary に切り替わる。
- **Detail panel** は Vercel 風の project page。大きな hero、4 つの KPI、runner 比較、sessions / files / commits の折りたたみ section を持つ。
- **File icons** は小さな色付き badge system（TS blue、JS yellow、MD gray など）。path list を素早く走査できる。

---

## 技術スタック

| 層 | 技術 |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict |
| Styling | Tailwind v4 (`@theme inline`) + design tokens (`src/components/observatory/tokens.ts`) |
| Storage | SQLite (WAL) via `better-sqlite3` + Drizzle ORM |
| Ingestion | `chokidar` watcher → Claude Code / Codex 向けの schema-drift-tolerant JSONL parsers |
| Git | `simple-git` + raw `spawnSync('git', …)` による porcelain status |
| Validation | `pnpm exec tsc --noEmit` + `eslint`（flat config, React 19 rules）+ `node --test` |

**Conventions:** kebab-case filenames · PascalCase components · Conventional Commits · 日本語ドキュメント + 英語の code/identifiers。

---

## アーキテクチャ

| Layer | Path | Role |
|---|---|---|
| ingest | `src/lib/ingest/` | `~/.claude/projects/<hash>/<uuid>.jsonl` と `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` を SQLite に増分保存する |
| brain | `src/lib/brain/` | tracks（session × git branch）、authorship、branch health、cost を派生する |
| graph | `src/lib/graph/` | projects · sessions · models · branches · files の relationship graph を作る |
| reports | `src/lib/reports/` | Weekly markdown report を生成する |
| API | `src/app/api/` | `monitor` · `cost` · `quiet-branches` · `projects/[id]/authorship` · `graph` · `reports` などの集約 query |
| dashboard | `src/app/page.tsx` + `src/components/observatory/` | Vibecoding journal homepage（master-detail） |
| project detail | `src/app/project/[id]/` | Project ごとの authorship view（行単位 AI attribution） |

---

## データソース

| Source | Format | 提供内容 |
|---|---|---|
| `~/.claude/projects/<hash>/<session-uuid>.jsonl` | JSONL | Claude Code session rollouts（tool calls, model, tokens, summaries） |
| `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL | Codex session rollouts |
| Local git repos | `git log` / `git blame` / `git status --porcelain` | Branch state、recent commits、uncommitted files |
| `~/.devpilot/events.jsonl` | JSONL | 任意。Claude Code hook receiver からの append-only event log |

---

## 実行方法

```bash
pnpm install
pnpm dev                 # http://localhost:3456
pnpm devpilot:daemon     # http://127.0.0.1:7312 — Claude Code hook receiver
pnpm devpilot:tail       # ~/.devpilot/events.jsonl を live tail する
```

### Claude Code を daemon に接続する（任意）

Claude Code settings に次を追加する。

```json
{
  "hooks": {
    "PreToolUse":  "curl -s -X POST http://127.0.0.1:7312/hook -d @-",
    "PostToolUse": "curl -s -X POST http://127.0.0.1:7312/hook -d @-",
    "Stop":        "curl -s -X POST http://127.0.0.1:7312/hook -d @-"
  }
}
```

### ルート

- `/` — vibecoding journal（homepage）
- `/graph` — 全データ横断の relationship graph / mindmap
- `/report` — weekly markdown report の preview と download
- `/project/[id]/authorship` — file tree + 行単位 AI authorship

---

## 検証

```bash
pnpm exec tsc --noEmit                 # 型チェック
pnpm lint                              # eslint (React 19 rules)
node --test src/lib/brain/*.test.ts    # unit tests
```

---

## 非目標

- AI agents を編成したり、review workflow を自動化したりしない。devpilot は観測するだけで駆動しない
- 複数マシンや cloud へ同期しない
- Login や外部 API key を要求しない
- Team collaboration tool ではない。単一ユーザーの local-first tool として設計する
