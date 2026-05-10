'use client';

interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, color, width = 70, height = 22 }: SparklineProps) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const barWidth = (width - (safeValues.length - 1) * 2) / safeValues.length;

  return (
    <svg aria-hidden="true" height={height} width={width}>
      {safeValues.map((value, index) => {
        const barHeight = Math.max(2, (value / max) * height);
        const x = index * (barWidth + 2);
        const y = height - barHeight;
        const isLast = index === safeValues.length - 1;

        return (
          <rect
            fill={color}
            height={barHeight}
            key={`${value}-${index}`}
            opacity={isLast ? 1 : 0.4 + (index / safeValues.length) * 0.35}
            rx={1}
            width={barWidth}
            x={x}
            y={y}
          />
        );
      })}
    </svg>
  );
}
