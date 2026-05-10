'use client';

import type { ReactNode } from 'react';
import { tokens } from '../tokens';

interface ProgressRingProps {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  bg?: string;
  children?: ReactNode;
}

export function ProgressRing({
  pct,
  color,
  size = 64,
  stroke = 5,
  bg = tokens.raised,
  children,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(pct, 0), 100) / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ height: size, width: size }}>
      <svg height={size} style={{ transform: 'rotate(-90deg)' }} width={size}>
        <circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={bg} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={stroke}
          style={{ transition: 'stroke-dashoffset .3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
