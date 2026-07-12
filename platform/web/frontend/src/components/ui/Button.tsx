import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-canvas border-ink hover:bg-ink/90',
  secondary: 'bg-white text-ink border-border hover:bg-canvas',
  destructive: 'bg-white text-status-rejected border-status-rejected hover:bg-status-rejected-bg',
};

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
