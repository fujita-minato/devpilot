'use client';

// FileIcon — 16px 文件类型图标。
// 风格参考 GitHub language tag + VS Code:小圆角色块 + 2-3 字缩写。
// 不引入图标库;纯 inline 配色 + 文字。
//
// 一眼区分:.ts → TS蓝, .js → JS黄, .md → MD灰, image → 紫格子, folder → 文件夹形状
// 默认色块为半透明背景 + 高饱和文字色,冷淡风跟整体 warm-dark 主题协调。

type Kind =
  | { type: 'lang'; label: string; color: string }
  | { type: 'image' }
  | { type: 'folder' }
  | { type: 'config'; label: string; color: string }
  | { type: 'lock' }
  | { type: 'generic' };

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'bmp',
  'tiff',
]);

const SPECIAL_FILES: Record<string, Kind> = {
  // package mgmt
  'package.json': { type: 'lang', label: 'PKG', color: '#cb6470' },
  'package-lock.json': { type: 'lock' },
  'pnpm-lock.yaml': { type: 'lock' },
  'yarn.lock': { type: 'lock' },
  'bun.lockb': { type: 'lock' },
  // build / config
  Dockerfile: { type: 'lang', label: 'DK', color: '#4a90c8' },
  Makefile: { type: 'lang', label: 'MK', color: '#a48256' },
  'tsconfig.json': { type: 'lang', label: 'TS', color: '#3178c6' },
  'next.config.ts': { type: 'lang', label: 'N', color: '#9b9b9b' },
  'next.config.mjs': { type: 'lang', label: 'N', color: '#9b9b9b' },
  'vite.config.ts': { type: 'lang', label: 'V', color: '#a987d4' },
  'vite.config.js': { type: 'lang', label: 'V', color: '#a987d4' },
  'tailwind.config.ts': { type: 'lang', label: 'TW', color: '#5fb6c8' },
  'eslint.config.mjs': { type: 'lang', label: 'ES', color: '#7d7dc8' },
  '.eslintrc.json': { type: 'lang', label: 'ES', color: '#7d7dc8' },
  '.gitignore': { type: 'config', label: 'GI', color: '#c76b3f' },
  '.npmrc': { type: 'config', label: 'NPM', color: '#c76b6f' },
  '.env': { type: 'config', label: 'ENV', color: '#9e7dbb' },
  '.env.local': { type: 'config', label: 'ENV', color: '#9e7dbb' },
  'README.md': { type: 'lang', label: 'README', color: '#9aa3b8' },
};

function classify(rawPath: string): Kind {
  // strip leading "./"
  const path = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;

  // folders end with `/`(porcelain 形式)or look-like dir
  if (path.endsWith('/')) return { type: 'folder' };

  // extract base filename
  const base = path.includes('/')
    ? path.slice(path.lastIndexOf('/') + 1)
    : path;

  // exact match special files
  if (SPECIAL_FILES[base]) return SPECIAL_FILES[base];

  // dotfiles without extension
  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return { type: 'config', label: '·', color: '#7c7974' };
  }

  // by extension
  const dotIdx = base.lastIndexOf('.');
  const ext = dotIdx >= 0 ? base.slice(dotIdx + 1).toLowerCase() : '';

  if (IMAGE_EXTS.has(ext)) return { type: 'image' };

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return { type: 'lang', label: 'TS', color: '#3178c6' };
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return { type: 'lang', label: 'JS', color: '#d4b85a' };
    case 'json':
      return { type: 'lang', label: '{}', color: '#cb8e3a' };
    case 'md':
    case 'mdx':
      return { type: 'lang', label: 'MD', color: '#9aa3b8' };
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return { type: 'lang', label: 'CSS', color: '#c87cd6' };
    case 'html':
    case 'htm':
      return { type: 'lang', label: 'H', color: '#e07b4d' };
    case 'yaml':
    case 'yml':
      return { type: 'lang', label: 'Y', color: '#cb557a' };
    case 'toml':
      return { type: 'lang', label: 'T', color: '#a48256' };
    case 'go':
      return { type: 'lang', label: 'GO', color: '#5fbcd2' };
    case 'py':
      return { type: 'lang', label: 'PY', color: '#5b8dd6' };
    case 'rs':
      return { type: 'lang', label: 'RS', color: '#d2774a' };
    case 'rb':
      return { type: 'lang', label: 'RB', color: '#c76b6f' };
    case 'java':
      return { type: 'lang', label: 'JV', color: '#c8775f' };
    case 'kt':
    case 'kts':
      return { type: 'lang', label: 'KT', color: '#9e7dbb' };
    case 'swift':
      return { type: 'lang', label: 'SW', color: '#e07b4d' };
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return { type: 'lang', label: '$', color: '#7aa889' };
    case 'sql':
      return { type: 'lang', label: 'SQL', color: '#5b8dd6' };
    case 'svg':
      return { type: 'lang', label: 'S', color: '#a987d4' };
    case 'pdf':
      return { type: 'lang', label: 'PDF', color: '#c76b6f' };
    case 'xml':
      return { type: 'lang', label: 'X', color: '#7aa889' };
    case 'lock':
      return { type: 'lock' };
    default:
      return { type: 'generic' };
  }
}

const SIZE = 16;

function ImageGlyph({ color }: { color: string }) {
  return (
    <svg
      fill="none"
      height={SIZE}
      viewBox="0 0 16 16"
      width={SIZE}
    >
      <rect
        height="11"
        rx="2"
        stroke={color}
        strokeWidth="1.2"
        width="13"
        x="1.5"
        y="2.5"
      />
      <circle cx="5.5" cy="6.5" fill={color} r="1.2" />
      <path
        d="M2 12 L6 8 L10 11 L13 9"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function FolderGlyph({ color }: { color: string }) {
  return (
    <svg
      fill="none"
      height={SIZE}
      viewBox="0 0 16 16"
      width={SIZE}
    >
      <path
        d="M2 4.5 a1 1 0 0 1 1 -1 H6 L7.5 5 H13 a1 1 0 0 1 1 1 V12 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z"
        fill={color}
        opacity="0.18"
      />
      <path
        d="M2 4.5 a1 1 0 0 1 1 -1 H6 L7.5 5 H13 a1 1 0 0 1 1 1 V12 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z"
        stroke={color}
        strokeWidth="1.1"
      />
    </svg>
  );
}

function LockGlyph({ color }: { color: string }) {
  return (
    <svg
      fill="none"
      height={SIZE}
      viewBox="0 0 16 16"
      width={SIZE}
    >
      <rect
        fill={color}
        height="7"
        opacity="0.18"
        rx="1.5"
        width="10"
        x="3"
        y="7"
      />
      <rect
        height="7"
        rx="1.5"
        stroke={color}
        strokeWidth="1.1"
        width="10"
        x="3"
        y="7"
      />
      <path
        d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"
        stroke={color}
        strokeWidth="1.1"
      />
    </svg>
  );
}

function GenericGlyph({ color }: { color: string }) {
  return (
    <svg
      fill="none"
      height={SIZE}
      viewBox="0 0 16 16"
      width={SIZE}
    >
      <path
        d="M3 2.5 H9 L13 6.5 V13 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V3.5 a1 1 0 0 1 1 -1 Z"
        fill={color}
        opacity="0.14"
      />
      <path
        d="M3 2.5 H9 L13 6.5 V13 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V3.5 a1 1 0 0 1 1 -1 Z"
        stroke={color}
        strokeWidth="1.1"
      />
      <path d="M9 2.5 V6.5 H13" stroke={color} strokeWidth="1.1" />
    </svg>
  );
}

function LangBadge({ label, color }: { label: string; color: string }) {
  // 长 label(README/PDF/CSS/PKG…)字号缩小,确保 16px 容器内不溢出
  const fontSize = label.length >= 4 ? 6.5 : label.length === 3 ? 7.5 : 8.5;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: SIZE,
        height: SIZE,
        borderRadius: 3,
        background: `${color}22`, // ~13% alpha
        color,
        fontSize,
        fontWeight: 700,
        lineHeight: 1,
        fontFamily:
          "'JetBrains Mono', 'SFMono-Regular', ui-monospace, monospace",
        letterSpacing: label.length >= 3 ? '-0.04em' : 0,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function FileIcon({ path }: { path: string }) {
  const k = classify(path);

  if (k.type === 'image') {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-flex', flexShrink: 0 }}
      >
        <ImageGlyph color="#a987d4" />
      </span>
    );
  }
  if (k.type === 'folder') {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-flex', flexShrink: 0 }}
      >
        <FolderGlyph color="#cb8e3a" />
      </span>
    );
  }
  if (k.type === 'lock') {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-flex', flexShrink: 0 }}
      >
        <LockGlyph color="#c76b6f" />
      </span>
    );
  }
  if (k.type === 'generic') {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-flex', flexShrink: 0 }}
      >
        <GenericGlyph color="#7c7974" />
      </span>
    );
  }
  // lang / config
  return <LangBadge color={k.color} label={k.label} />;
}
