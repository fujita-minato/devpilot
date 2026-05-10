'use client';

import type { CSSProperties } from 'react';

export type IconName =
  | 'alert'
  | 'arrow-right'
  | 'check'
  | 'chevron-right'
  | 'circle'
  | 'clock'
  | 'close'
  | 'git-branch'
  | 'git-commit'
  | 'network'
  | 'radar'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'target'
  | 'trend-down'
  | 'trend-up'
  | 'x-circle';

interface IconProps {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 16,
  style,
  className,
  strokeWidth = 2,
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      style={style}
      viewBox="0 0 24 24"
      width={size}
    >
      {renderIcon(name)}
    </svg>
  );
}

function renderIcon(name: IconName) {
  switch (name) {
    case 'alert':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
        </>
      );
    case 'arrow-right':
      return (
        <>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </>
      );
    case 'check':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m8 12 2.6 2.6L16.5 9" />
        </>
      );
    case 'chevron-right':
      return <path d="m9 18 6-6-6-6" />;
    case 'circle':
      return <circle cx="12" cy="12" r="8" />;
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      );
    case 'git-branch':
      return (
        <>
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M6 9v6" />
          <path d="M9 6h9" />
        </>
      );
    case 'git-commit':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M1.5 12h6.5" />
          <path d="M16 12h6.5" />
        </>
      );
    case 'network':
      return (
        <>
          <rect height="6" rx="1.5" width="6" x="3" y="3" />
          <rect height="6" rx="1.5" width="6" x="15" y="3" />
          <rect height="6" rx="1.5" width="6" x="9" y="15" />
          <path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9" />
          <path d="M12 13v2" />
        </>
      );
    case 'radar':
      return (
        <>
          <path d="M19.1 4.9A10 10 0 1 1 12 2" />
          <path d="M12 12 21 3" />
          <path d="M15 12a3 3 0 1 1-3-3" />
          <path d="M12 6a6 6 0 1 0 6 6" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M21 12a9 9 0 0 1-15.4 6.4" />
          <path d="M3 12A9 9 0 0 1 18.4 5.6" />
          <path d="M18 2v4h4" />
          <path d="M6 22v-4H2" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 0 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case 'target':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </>
      );
    case 'trend-down':
      return (
        <>
          <path d="m22 17-8.5-8.5-5 5L2 7" />
          <path d="M16 17h6v-6" />
        </>
      );
    case 'trend-up':
      return (
        <>
          <path d="m22 7-8.5 8.5-5-5L2 17" />
          <path d="M16 7h6v6" />
        </>
      );
    case 'x-circle':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </>
      );
  }
}
