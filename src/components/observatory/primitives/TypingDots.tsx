'use client';

export function TypingDots({ color }: { color: string }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            animation: `dp-typing 1.4s ease-in-out ${index * 0.18}s infinite`,
            background: color,
            borderRadius: 99,
            height: 4,
            width: 4,
          }}
        />
      ))}
    </span>
  );
}
