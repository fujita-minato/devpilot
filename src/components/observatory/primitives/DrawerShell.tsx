'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { tokens } from '../tokens';
import { IconButton } from './shared';

interface DrawerShellProps {
  open: boolean;
  title: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}

export function DrawerShell({ open, title, width = 520, onClose, children }: DrawerShellProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute('disabled'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          backdropFilter: 'blur(4px)',
          background: tokens.overlay,
          inset: 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          position: 'fixed',
          transition: 'opacity .2s ease',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
      />
      <aside
        aria-hidden={!open}
        aria-label={title}
        ref={panelRef}
        role="dialog"
        style={{
          background: tokens.surface,
          borderLeft: `1px solid ${tokens.border}`,
          bottom: 0,
          boxShadow: tokens.shadow3,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '100vw',
          position: 'fixed',
          right: 0,
          top: 0,
          transform: open ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform .25s cubic-bezier(.2,.8,.2,1)',
          width,
          zIndex: 50,
        }}
      >
        <div
          className="flex items-center justify-between px-5"
          style={{ background: 'transparent', borderBottom: `1px solid ${tokens.border}`, flexShrink: 0, height: 56 }}
        >
          <h3 className="text-[14px] font-bold tracking-tight" style={{ color: tokens.text }}>
            {title}
          </h3>
          <IconButton icon="close" onClick={onClose} title="Close" />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
