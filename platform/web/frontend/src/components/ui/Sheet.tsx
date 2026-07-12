import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div data-testid="sheet-overlay" className="fixed inset-0 z-50 flex justify-end">
      <div
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-ink/30"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative flex h-full w-full max-w-md flex-col border-l border-border bg-canvas shadow-xl')}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-ink">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            data-testid="sheet-close"
            className="text-muted hover:text-ink"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
