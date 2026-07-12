# Web UI Visual Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the currently-unstyled `platform/web/frontend` React app into the "Structured Editorial" visual direction pinned in `docs/superpowers/specs/2026-07-12-web-ui-visual-restyle-design.md`, with zero changes to API calls, TanStack Query usage, or existing test intent.

**Architecture:** Add Tailwind CSS as the styling layer. Build a small set of hand-authored, Tailwind-styled UI primitives in `src/components/ui/` (`Button`, `Badge`, `Card`, `Separator`, `Sheet`) that existing components adopt one at a time, preserving every `data-testid`, prop, and piece of rendered text so the existing Vitest/Testing-Library and Playwright suites keep passing untouched. The one behavior addition is the run-log `Sheet` gaining real open/close semantics (needed for a drawer to be dismissable at all), covered by a new test in Task 7.

**Tech Stack:** Tailwind CSS 3 + PostCSS + Autoprefixer, `@tailwindcss/typography` (for the sanitized-markdown viewer), `clsx` + `tailwind-merge` (a `cn()` class-merging helper). No Radix/shadcn CLI: primitives are hand-authored to keep the dependency footprint lean (per the design doc's own "lean dependency footprint" reasoning) and to avoid Radix's jsdom/pointer-event test friction.

## Global Constraints

- No API/behavior changes except the run-log drawer's open/close (Task 7) — this is a restyle-only pass.
- Every existing `data-testid` in every component must remain exactly as-is: same value, same element it's attached to. Do not rename, remove, or relocate them.
- Design tokens (from the design doc): page background `#faf9f7`, card background `#ffffff`, border `#e7e2da`, primary text `#1c1917`, secondary/muted text `#8a8378`. Status colors: muted green (approved), muted amber (awaiting review), muted red (rejected/error), warm gray (pending) — used identically for badges and diff line backgrounds.
- Typography: Georgia (system serif) for headings only (h1/h2/h3, stage names); system sans-serif for everything else. No webfont loading.
- Light mode only for this pass.
- Repo `engines` requires Node >=20 (`package.json`). TypeScript is `strict`; relative imports use explicit `.js` extensions (existing convention — keep it in every new file).
- Every new component gets its own colocated `*.test.tsx`/`*.test.ts` file following the existing Vitest + Testing Library conventions (see `src/setupTests.ts`, `src/components/StageCard.test.tsx`).

---

## File Structure

**New files:**
- `platform/web/frontend/tailwind.config.js` — Tailwind config: content globs, warm-neutral/status color tokens, Georgia serif font family, `@tailwindcss/typography` plugin.
- `platform/web/frontend/postcss.config.js` — PostCSS pipeline (`tailwindcss`, `autoprefixer`).
- `platform/web/frontend/src/index.css` — Tailwind directives + base body styling.
- `platform/web/frontend/src/lib/cn.ts` + `cn.test.ts` — `clsx` + `tailwind-merge` class-merging helper used by every styled component.
- `platform/web/frontend/src/components/ui/Button.tsx` + `.test.tsx` — styled `<button>` wrapper, forwards all native button props.
- `platform/web/frontend/src/components/ui/Badge.tsx` + `.test.tsx` — styled `<span>` wrapper with a `tone` prop for status coloring.
- `platform/web/frontend/src/components/ui/Card.tsx` + `.test.tsx` — styled `<div>` wrapper (bordered container).
- `platform/web/frontend/src/components/ui/Separator.tsx` + `.test.tsx` — styled `<hr>`.
- `platform/web/frontend/src/components/ui/Sheet.tsx` + `.test.tsx` — hand-rolled slide-over drawer (backdrop, Escape-to-close, close button), used for the run-log drawer.

**Modified files:**
- `platform/web/frontend/package.json` — new dependencies (via `npm install`, shown per-task).
- `platform/web/frontend/src/main.tsx` — import `./index.css`.
- `platform/web/frontend/src/components/StageCard.tsx` — adopt `Card`/`Badge`/`Button`.
- `platform/web/frontend/src/components/GateActions.tsx` — adopt `Button`, style the textarea.
- `platform/web/frontend/src/components/MarkdownViewer.tsx` — `prose` styling via `@tailwindcss/typography`.
- `platform/web/frontend/src/components/MarkdownEditor.tsx` — adopt `Button`, style the textarea.
- `platform/web/frontend/src/components/DiffView.tsx` — muted per-line-kind background colors.
- `platform/web/frontend/src/components/RunLogPanel.tsx` — adopt `Separator`, style content sections.
- `platform/web/frontend/src/pages/PipelineView.tsx` — full shell restyle: sidebar + stage rail + main content, run log moves into `Sheet`, toast stack restyled.
- `platform/web/frontend/src/pages/PipelineView.test.tsx` — one new test for the run-log drawer's close behavior.

---

### Task 1: Tailwind CSS setup and design tokens

**Files:**
- Create: `platform/web/frontend/tailwind.config.js`
- Create: `platform/web/frontend/postcss.config.js`
- Create: `platform/web/frontend/src/index.css`
- Modify: `platform/web/frontend/src/main.tsx`

**Interfaces:**
- Produces: Tailwind utility classes available to every `.tsx` file under `src/`, plus these token names used by every later task: colors `canvas`, `border`, `ink`, `muted`, `status-approved`, `status-approved-bg`, `status-review`, `status-review-bg`, `status-rejected`, `status-rejected-bg`, `status-pending`, `status-pending-bg`; font family `font-serif` (Georgia stack).

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd platform/web/frontend
npm install clsx@^2.1.1 tailwind-merge@^2.5.4
npm install -D tailwindcss@^3.4.14 postcss@^8.4.47 autoprefixer@^10.4.20 @tailwindcss/typography@^0.5.15
```

- [ ] **Step 2: Create the Tailwind config with design tokens**

Create `platform/web/frontend/tailwind.config.js`:

```js
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf9f7',
        border: '#e7e2da',
        ink: '#1c1917',
        muted: '#8a8378',
        status: {
          approved: '#3f6212',
          'approved-bg': '#dfead9',
          review: '#8a6d1a',
          'review-bg': '#fef3c7',
          rejected: '#8a1f1f',
          'rejected-bg': '#fde2e2',
          pending: '#8a8378',
          'pending-bg': '#f1efe9',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [typography],
};
```

- [ ] **Step 3: Create the PostCSS config**

Create `platform/web/frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create the global stylesheet**

Create `platform/web/frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-canvas text-ink;
}
```

- [ ] **Step 5: Import the stylesheet**

Modify `platform/web/frontend/src/main.tsx` — add as the first import:

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineView } from './pages/PipelineView.js';
```

(The rest of the file is unchanged.)

- [ ] **Step 6: Verify nothing regressed**

Run:
```bash
npm run typecheck
npm test
npm run build
```
Expected: all three succeed with no errors — this task only adds build tooling and one import, no component logic changed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tailwind.config.js postcss.config.js src/index.css src/main.tsx
git commit -m "build: add Tailwind CSS and design tokens for the visual restyle"
```

---

### Task 2: UI primitives — cn, Button, Badge, Card, Separator

**Files:**
- Create: `platform/web/frontend/src/lib/cn.ts`
- Test: `platform/web/frontend/src/lib/cn.test.ts`
- Create: `platform/web/frontend/src/components/ui/Button.tsx`
- Test: `platform/web/frontend/src/components/ui/Button.test.tsx`
- Create: `platform/web/frontend/src/components/ui/Badge.tsx`
- Test: `platform/web/frontend/src/components/ui/Badge.test.tsx`
- Create: `platform/web/frontend/src/components/ui/Card.tsx`
- Test: `platform/web/frontend/src/components/ui/Card.test.tsx`
- Create: `platform/web/frontend/src/components/ui/Separator.tsx`
- Test: `platform/web/frontend/src/components/ui/Separator.test.tsx`

**Interfaces:**
- Consumes: Tailwind tokens from Task 1 (`ink`, `canvas`, `border`, `muted`, `status-*`).
- Produces: `cn(...inputs: ClassValue[]): string`; `Button` (props: `React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'destructive' }`, default `variant='secondary'`); `Badge` (props: `React.HTMLAttributes<HTMLSpanElement> & { tone: 'approved' | 'review' | 'rejected' | 'pending' }`); `Card` (props: `React.HTMLAttributes<HTMLDivElement>`); `Separator` (props: `React.HTMLAttributes<HTMLHRElement>`). All four forward `data-testid`, `className`, and every native prop via spread — later tasks rely on this to keep existing tests passing unmodified.

- [ ] **Step 1: Write the failing tests**

Create `platform/web/frontend/src/lib/cn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('lets a later conflicting Tailwind class win over an earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
```

Create `platform/web/frontend/src/components/ui/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders children and forwards standard button props', () => {
    const onClick = vi.fn();
    render(
      <Button data-testid="btn" title="hint" onClick={onClick}>
        Run
      </Button>
    );
    const button = screen.getByTestId('btn');
    expect(button).toHaveTextContent('Run');
    expect(button).toHaveAttribute('title', 'hint');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('reflects the disabled prop', () => {
    render(
      <Button data-testid="btn" disabled>
        Run
      </Button>
    );
    expect(screen.getByTestId('btn')).toBeDisabled();
  });

  it('merges a caller-provided className with the variant classes', () => {
    render(
      <Button data-testid="btn" variant="primary" className="self-end">
        Save
      </Button>
    );
    expect(screen.getByTestId('btn')).toHaveClass('self-end');
  });
});
```

Create `platform/web/frontend/src/components/ui/Badge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge.js';

describe('Badge', () => {
  it('renders its children', () => {
    render(
      <Badge tone="approved" data-testid="badge">
        approved
      </Badge>
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('approved');
  });

  it('applies tone-specific classes', () => {
    render(
      <Badge tone="rejected" data-testid="badge">
        rejected
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('status-rejected');
  });
});
```

Create `platform/web/frontend/src/components/ui/Card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card.js';

describe('Card', () => {
  it('renders children inside a bordered container and merges className', () => {
    render(
      <Card data-testid="card" className="p-4">
        content
      </Card>
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('content');
    expect(card).toHaveClass('p-4');
    expect(card.className).toContain('border');
  });
});
```

Create `platform/web/frontend/src/components/ui/Separator.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './Separator.js';

describe('Separator', () => {
  it('renders an hr with border styling', () => {
    render(<Separator data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep.tagName).toBe('HR');
    expect(sep.className).toContain('border-t');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/cn.test.ts src/components/ui/Button.test.tsx src/components/ui/Badge.test.tsx src/components/ui/Card.test.tsx src/components/ui/Separator.test.tsx`
Expected: FAIL — none of the source files exist yet (`Cannot find module './cn.js'`, etc.)

- [ ] **Step 3: Implement the primitives**

Create `platform/web/frontend/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Create `platform/web/frontend/src/components/ui/Button.tsx`:

```tsx
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
```

Create `platform/web/frontend/src/components/ui/Badge.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type BadgeTone = 'approved' | 'review' | 'rejected' | 'pending';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  approved: 'bg-status-approved-bg text-status-approved',
  review: 'bg-status-review-bg text-status-review',
  rejected: 'bg-status-rejected-bg text-status-rejected',
  pending: 'bg-status-pending-bg text-status-pending',
};

export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
```

Create `platform/web/frontend/src/components/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded border border-border bg-white', className)} {...props} />;
}
```

Create `platform/web/frontend/src/components/ui/Separator.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-t border-border', className)} {...props} />;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/cn.test.ts src/components/ui/Button.test.tsx src/components/ui/Badge.test.tsx src/components/ui/Card.test.tsx src/components/ui/Separator.test.tsx`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cn.ts src/lib/cn.test.ts src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/Badge.tsx src/components/ui/Badge.test.tsx src/components/ui/Card.tsx src/components/ui/Card.test.tsx src/components/ui/Separator.tsx src/components/ui/Separator.test.tsx
git commit -m "feat: add cn helper and Button/Badge/Card/Separator UI primitives"
```

---

### Task 3: Sheet (slide-over drawer) primitive

**Files:**
- Create: `platform/web/frontend/src/components/ui/Sheet.tsx`
- Test: `platform/web/frontend/src/components/ui/Sheet.test.tsx`

**Interfaces:**
- Consumes: `cn` from Task 2 (`../../lib/cn.js`).
- Produces: `Sheet` component, props `{ open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }`. Renders nothing (`null`) when `open` is `false`. When open, renders a `data-testid="sheet-overlay"` container with a backdrop, a `data-testid="sheet-close"` close button, and `children` in a scrollable body. Calls `onOpenChange(false)` on: close-button click, backdrop click, and Escape keydown. Task 7 relies on exactly this contract to wrap `RunLogPanel`.

- [ ] **Step 1: Write the failing tests**

Create `platform/web/frontend/src/components/ui/Sheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from './Sheet.js';

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onOpenChange={vi.fn()} title="Run log">
        <p>content</p>
      </Sheet>
    );
    expect(screen.queryByTestId('sheet-overlay')).not.toBeInTheDocument();
  });

  it('renders the title and children when open', () => {
    render(
      <Sheet open={true} onOpenChange={vi.fn()} title="Run log">
        <p>content</p>
      </Sheet>
    );
    expect(screen.getByText('Run log')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the close button is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.click(screen.getByTestId('sheet-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when the backdrop is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when Escape is pressed', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not listen for Escape while closed', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={false} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/ui/Sheet.test.tsx`
Expected: FAIL — `Cannot find module './Sheet.js'`

- [ ] **Step 3: Implement Sheet**

Create `platform/web/frontend/src/components/ui/Sheet.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/ui/Sheet.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Sheet.tsx src/components/ui/Sheet.test.tsx
git commit -m "feat: add Sheet slide-over drawer primitive"
```

---

### Task 4: Restyle StageCard and GateActions

**Files:**
- Modify: `platform/web/frontend/src/components/StageCard.tsx`
- Modify: `platform/web/frontend/src/components/GateActions.tsx`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Button` from Task 2 (`./ui/Card.js`, `./ui/Badge.js`, `./ui/Button.js`).
- Produces: no prop/behavior changes to `StageCard` or `GateActions` — same exported component names, same props, same `data-testid` values. `src/components/StageCard.test.tsx` and `src/components/GateActions.test.tsx` are not modified by this task and must still pass.

- [ ] **Step 1: Confirm the existing tests still describe the intended behavior**

Run: `npm test -- src/components/StageCard.test.tsx src/components/GateActions.test.tsx`
Expected: PASS (these tests already exist and pass against the current unstyled components — this task must keep them green while changing only markup/classes)

- [ ] **Step 2: Restyle StageCard**

Replace the contents of `platform/web/frontend/src/components/StageCard.tsx`:

```tsx
import type { StageStatus, StageView } from '../api/client.js';
import { GateActions } from './GateActions.js';
import { Card } from './ui/Card.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';

export interface StageCardProps {
  stage: StageView;
  workspaceLocked: boolean;
  blockedBy?: { stage: string; status: StageStatus } | null;
  isRunPending?: boolean;
  isApprovePending?: boolean;
  isRejectPending?: boolean;
  onRun: (stage: string) => void;
  onApprove: (stage: string) => void;
  onReject: (stage: string, comment: string) => void;
  onViewRun?: (runId: string) => void;
}

const STATUS_TONE: Record<StageStatus, 'approved' | 'review' | 'rejected' | 'pending'> = {
  approved: 'approved',
  awaiting_review: 'review',
  rejected: 'rejected',
  pending: 'pending',
};

export function StageCard({
  stage,
  workspaceLocked,
  blockedBy,
  isRunPending = false,
  isApprovePending = false,
  isRejectPending = false,
  onRun,
  onApprove,
  onReject,
  onViewRun,
}: StageCardProps) {
  const failed =
    stage.status === 'pending' &&
    stage.lastRun != null &&
    (stage.lastRun.status === 'error' || stage.lastRun.status === 'aborted_budget');

  const runDisabled = workspaceLocked || stage.running || blockedBy != null || isRunPending;
  const runTitle = blockedBy
    ? `Blocked: ${blockedBy.stage} is ${blockedBy.status}, must be approved first.`
    : undefined;
  const gateDisabled = workspaceLocked || isApprovePending || isRejectPending;

  return (
    <Card data-testid={`stagecard-${stage.name}`} className="flex min-w-[220px] flex-1 flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-base font-bold text-ink">{stage.name}</h2>
        <Badge tone={STATUS_TONE[stage.status]} data-testid={`stagecard-status-${stage.name}`}>
          {stage.status}
        </Badge>
      </div>

      {stage.running && (
        <span data-testid={`stagecard-running-${stage.name}`} className="text-xs text-muted">
          {' '}
          Running…
        </span>
      )}

      {failed && stage.lastRun && (
        <p
          data-testid={`stagecard-failure-${stage.name}`}
          className="rounded bg-status-rejected-bg px-3 py-2 text-xs text-status-rejected"
        >
          Last run {stage.lastRun.status}: {stage.lastRun.errorMessage} ({stage.lastRun.tokensSpent}/
          {stage.lastRun.tokenBudget} tokens)
        </p>
      )}

      {stage.status === 'rejected' && stage.comment && (
        <p
          data-testid={`stagecard-comment-${stage.name}`}
          className="rounded bg-status-pending-bg px-3 py-2 text-xs text-ink"
        >
          Rejected: {stage.comment}
        </p>
      )}

      {stage.lastRun && onViewRun && (
        <Button
          type="button"
          variant="secondary"
          data-testid={`stagecard-viewrun-${stage.name}`}
          onClick={() => onViewRun(stage.lastRun!.runId)}
        >
          View last run
        </Button>
      )}

      {!stage.running && stage.status !== 'awaiting_review' && (
        <Button
          type="button"
          variant="primary"
          data-testid={`stagecard-run-${stage.name}`}
          disabled={runDisabled}
          title={runTitle}
          onClick={() => onRun(stage.name)}
        >
          Run
        </Button>
      )}

      {stage.status === 'awaiting_review' && (
        <GateActions stage={stage.name} disabled={gateDisabled} onApprove={onApprove} onReject={onReject} />
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Restyle GateActions**

Replace the contents of `platform/web/frontend/src/components/GateActions.tsx`:

```tsx
import { useState } from 'react';
import { Button } from './ui/Button.js';

export interface GateActionsProps {
  stage: string;
  disabled: boolean;
  onApprove: (stage: string) => void;
  onReject: (stage: string, comment: string) => void;
}

export function GateActions({ stage, disabled, onApprove, onReject }: GateActionsProps) {
  const [comment, setComment] = useState('');
  const canReject = comment.trim().length > 0;

  return (
    <div data-testid={`gate-actions-${stage}`} className="flex flex-col gap-2 border-t border-border pt-2">
      <Button
        type="button"
        variant="primary"
        data-testid={`gate-approve-${stage}`}
        disabled={disabled}
        onClick={() => onApprove(stage)}
      >
        Approve
      </Button>
      <textarea
        data-testid={`gate-reject-comment-${stage}`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Reason for rejecting"
        className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <Button
        type="button"
        variant="destructive"
        data-testid={`gate-reject-submit-${stage}`}
        disabled={disabled || !canReject}
        onClick={() => {
          onReject(stage, comment);
          setComment('');
        }}
      >
        Reject
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they still pass**

Run: `npm test -- src/components/StageCard.test.tsx src/components/GateActions.test.tsx`
Expected: PASS (all pre-existing assertions, unmodified)

- [ ] **Step 5: Commit**

```bash
git add src/components/StageCard.tsx src/components/GateActions.tsx
git commit -m "style: restyle StageCard and GateActions with UI primitives"
```

---

### Task 5: Restyle MarkdownViewer and MarkdownEditor

**Files:**
- Modify: `platform/web/frontend/src/components/MarkdownViewer.tsx`
- Modify: `platform/web/frontend/src/components/MarkdownEditor.tsx`

**Interfaces:**
- Consumes: `Button` from Task 2; `@tailwindcss/typography`'s `prose` classes from Task 1.
- Produces: no prop/behavior changes; `src/components/MarkdownViewer.test.tsx` and `src/components/MarkdownEditor.test.tsx` are not modified and must still pass.

- [ ] **Step 1: Confirm the existing tests still describe the intended behavior**

Run: `npm test -- src/components/MarkdownViewer.test.tsx src/components/MarkdownEditor.test.tsx`
Expected: PASS

- [ ] **Step 2: Restyle MarkdownViewer**

Replace the contents of `platform/web/frontend/src/components/MarkdownViewer.tsx`:

```tsx
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const rawHtml = marked.parse(content, { async: false }) as string;
  // marked does not sanitize its output; content originates from workspace files that may
  // have been LLM-generated or edited by a client, so untrusted markup (e.g. <script>,
  // onerror handlers) must be stripped before it reaches the DOM.
  const html = DOMPurify.sanitize(rawHtml);
  return (
    <div
      data-testid="markdown-viewer"
      className="prose prose-sm max-w-none text-ink prose-headings:font-serif prose-headings:text-ink prose-a:text-ink"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 3: Restyle MarkdownEditor**

Replace the contents of `platform/web/frontend/src/components/MarkdownEditor.tsx`:

```tsx
import { useState } from 'react';
import { Button } from './ui/Button.js';

export interface MarkdownEditorProps {
  path: string;
  initialContent: string;
  onSave: (content: string) => void;
  saving?: boolean;
}

export function MarkdownEditor({ path, initialContent, onSave, saving = false }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const dirty = content !== initialContent;

  return (
    <div data-testid="markdown-editor" className="flex flex-col gap-2">
      <textarea
        data-testid="markdown-editor-textarea"
        aria-label={`Edit ${path}`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[320px] w-full rounded border border-border bg-white p-3 font-mono text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <Button
        type="button"
        variant="primary"
        data-testid="markdown-editor-save"
        disabled={!dirty || saving}
        onClick={() => onSave(content)}
        className="self-end"
      >
        Save
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they still pass**

Run: `npm test -- src/components/MarkdownViewer.test.tsx src/components/MarkdownEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/MarkdownViewer.tsx src/components/MarkdownEditor.tsx
git commit -m "style: restyle MarkdownViewer and MarkdownEditor"
```

---

### Task 6: Restyle DiffView

**Files:**
- Modify: `platform/web/frontend/src/components/DiffView.tsx`

**Interfaces:**
- Consumes: nothing new (no UI primitives needed — plain divs with Tailwind classes).
- Produces: no prop/behavior changes; `src/components/DiffView.test.tsx` is not modified and must still pass, including its exact `diff-line-${kind}` test ids.

- [ ] **Step 1: Confirm the existing tests still describe the intended behavior**

Run: `npm test -- src/components/DiffView.test.tsx`
Expected: PASS

- [ ] **Step 2: Restyle DiffView**

Replace the contents of `platform/web/frontend/src/components/DiffView.tsx`:

```tsx
export interface DiffViewProps {
  diff: string;
  path: string;
}

type LineKind = 'added' | 'removed' | 'hunk' | 'meta' | 'context';

const META_PREFIXES = [
  '+++',
  '---',
  'diff --git',
  'new file mode ',
  'deleted file mode ',
  'index ',
  'old mode ',
  'new mode ',
  'similarity index ',
  'rename from ',
  'rename to ',
];

const LINE_CLASSES: Record<LineKind, string> = {
  added: 'bg-status-approved-bg text-status-approved',
  removed: 'bg-status-rejected-bg text-status-rejected',
  hunk: 'bg-status-pending-bg text-muted font-semibold',
  meta: 'text-muted',
  context: 'text-ink',
};

function classifyLine(line: string): LineKind {
  if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

export function DiffView({ diff, path }: DiffViewProps) {
  if (diff.trim().length === 0) {
    return (
      <div data-testid="diff-view">
        <p data-testid="diff-empty" className="text-sm text-muted">
          No changes for {path}.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="diff-view" className="overflow-x-auto rounded border border-border bg-white font-mono text-xs">
      {diff.split('\n').map((line, index) => {
        const kind = classifyLine(line);
        return (
          <div
            key={index}
            data-testid={`diff-line-${kind}`}
            className={`diff-line diff-line-${kind} whitespace-pre px-3 py-0.5 ${LINE_CLASSES[kind]}`}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run the tests to verify they still pass**

Run: `npm test -- src/components/DiffView.test.tsx`
Expected: PASS (all 4 pre-existing tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/DiffView.tsx
git commit -m "style: restyle DiffView with muted per-line-kind backgrounds"
```

---

### Task 7: Move RunLogPanel into the Sheet drawer

**Files:**
- Modify: `platform/web/frontend/src/components/RunLogPanel.tsx`
- Modify: `platform/web/frontend/src/pages/PipelineView.tsx` (only the run-log rendering block — full shell restyle is Task 8)
- Modify: `platform/web/frontend/src/pages/PipelineView.test.tsx` (one new test)

**Interfaces:**
- Consumes: `Sheet` from Task 3 (`../components/ui/Sheet.js`), `Separator` from Task 2.
- Produces: `RunLogPanel`'s props/behavior are unchanged (`{ runLog: RunLog }`, same `data-testid`s) — `src/components/RunLogPanel.test.tsx` is not modified and must still pass. `PipelineView` gains real dismiss behavior for the run-log drawer: clicking the `Sheet`'s close button (or backdrop, or Escape) now clears `selectedRunId`, closing the drawer. This is a necessary behavior addition (a drawer needs a way to close), not a restyle-only change — Global Constraints' "no behavior change" exception applies here.

- [ ] **Step 1: Confirm RunLogPanel's existing tests still describe the intended behavior**

Run: `npm test -- src/components/RunLogPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: Write the new failing PipelineView test for drawer close behavior**

Add to `platform/web/frontend/src/pages/PipelineView.test.tsx`, inside the existing `describe('PipelineView', ...)` block, after the `'shows the run log for the last run when "View last run" is clicked'` test:

```tsx
  it('closes the run log drawer when the close button is clicked', async () => {
    vi.mocked(getPipeline).mockResolvedValue({
      ...BASE_PIPELINE,
      stages: BASE_PIPELINE.stages.map((s) =>
        s.name === '01_research'
          ? {
              ...s,
              lastRun: {
                runId: 'run-1',
                status: 'completed',
                endedAt: '2026-07-12T09:00:00.000Z',
                tokensSpent: 800,
                tokenBudget: 200000,
              },
            }
          : s
      ),
    });
    vi.mocked(getTree).mockResolvedValue([]);
    vi.mocked(getRun).mockResolvedValue({
      runId: 'run-1',
      stage: '01_research',
      model: 'anthropic/claude-sonnet-5',
      startedAt: '2026-07-12T08:59:00.000Z',
      endedAt: '2026-07-12T09:00:00.000Z',
      status: 'completed',
      filesRead: [],
      filesWritten: [],
      toolCalls: [],
      tokensSpent: 800,
      tokenBudget: 200000,
    });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('stagecard-viewrun-01_research')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('stagecard-viewrun-01_research'));
    await waitFor(() => expect(screen.getByTestId('run-log-panel')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sheet-close'));
    expect(screen.queryByTestId('run-log-panel')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/pages/PipelineView.test.tsx`
Expected: FAIL — `sheet-close` doesn't exist yet; the run log has no close affordance.

- [ ] **Step 4: Restyle RunLogPanel**

Replace the contents of `platform/web/frontend/src/components/RunLogPanel.tsx`:

```tsx
import type { RunLog, ToolCallLogEntry } from '../api/client.js';
import { Separator } from './ui/Separator.js';

export interface RunLogPanelProps {
  runLog: RunLog;
}

/** Safely reads the `path` arg from a tool call, when present (read_file, write_file, list_dir). */
function toolCallPath(call: ToolCallLogEntry): string | undefined {
  const path = call.args?.path;
  return typeof path === 'string' ? path : undefined;
}

export function RunLogPanel({ runLog }: RunLogPanelProps) {
  return (
    <div data-testid="run-log-panel" className="flex flex-col gap-4 text-sm">
      <h3 className="font-serif text-base font-bold text-ink">Run {runLog.runId}</h3>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Stage</dt>
        <dd data-testid="run-log-stage" className="text-ink">
          {runLog.stage}
        </dd>
        <dt className="text-muted">Model</dt>
        <dd data-testid="run-log-model" className="text-ink">
          {runLog.model}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd data-testid="run-log-status" className="text-ink">
          {runLog.status}
        </dd>
        <dt className="text-muted">Tokens</dt>
        <dd data-testid="run-log-tokens" className="text-ink">
          {runLog.tokensSpent} / {runLog.tokenBudget}
        </dd>
      </dl>

      <Separator />

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Files read</h4>
        <ul data-testid="run-log-files-read" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.filesRead.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Files written</h4>
        <ul data-testid="run-log-files-written" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.filesWritten.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>

      <Separator />

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tool calls</h4>
        <ul data-testid="run-log-tool-calls" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.toolCalls.map((call, index) => {
            const path = toolCallPath(call);
            return (
              <li key={index} data-testid={`run-log-tool-call-${index}`}>
                {call.tool}
                {path ? ` (${path})` : ''} — {call.result}
                {call.errorMessage ? `: ${call.errorMessage}` : ''}
              </li>
            );
          })}
        </ul>
      </div>

      {runLog.gateSummary && (
        <p
          data-testid="run-log-gate-summary"
          className="rounded bg-status-approved-bg px-3 py-2 text-xs text-status-approved"
        >
          {runLog.gateSummary}
        </p>
      )}
      {runLog.errorMessage && (
        <p
          data-testid="run-log-error"
          className="rounded bg-status-rejected-bg px-3 py-2 text-xs text-status-rejected"
        >
          {runLog.errorMessage}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wrap the run log in a Sheet in PipelineView**

In `platform/web/frontend/src/pages/PipelineView.tsx`, add the import:

```tsx
import { Sheet } from '../components/ui/Sheet.js';
```

Replace this line:

```tsx
      {runLogQuery.data && <RunLogPanel runLog={runLogQuery.data} />}
```

with:

```tsx
      <Sheet
        open={selectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null);
        }}
        title="Run log"
      >
        {runLogQuery.data && <RunLogPanel runLog={runLogQuery.data} />}
      </Sheet>
```

(Leave everything else in the file untouched for now — the surrounding shell restyle is Task 8.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/components/RunLogPanel.test.tsx src/pages/PipelineView.test.tsx`
Expected: PASS (all pre-existing `PipelineView` tests plus the new close-drawer test)

- [ ] **Step 7: Commit**

```bash
git add src/components/RunLogPanel.tsx src/pages/PipelineView.tsx src/pages/PipelineView.test.tsx
git commit -m "feat: move the run log into a dismissable Sheet drawer"
```

---

### Task 8: Restyle the PipelineView shell — sidebar, stage rail, toasts

**Files:**
- Modify: `platform/web/frontend/src/pages/PipelineView.tsx`

**Interfaces:**
- Consumes: `Button` from Task 2. No new exports — `PipelineView` remains a zero-prop component.
- Produces: no prop/behavior changes; every existing `data-testid` (`pipeline-loading`, `pipeline-error`, `pipeline-locked`, `toast-list`, `toast-{id}`, `toast-dismiss-{id}`, `stage-list`, `file-tree`, `file-tree-entry-{path}`, `file-edit-toggle`) stays exactly where it is. `src/pages/PipelineView.test.tsx` is not modified further by this task (Task 7 already added the one new test) and all tests must still pass.

- [ ] **Step 1: Confirm the existing tests still describe the intended behavior**

Run: `npm test -- src/pages/PipelineView.test.tsx`
Expected: PASS (from Task 7)

- [ ] **Step 2: Restyle the shell**

Replace the contents of `platform/web/frontend/src/pages/PipelineView.tsx`:

```tsx
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPipeline,
  runStage,
  approveStage,
  rejectStage,
  getTree,
  getFile,
  putFile,
  getDiff,
  getRun,
  ApiError,
  type StageStatus,
} from '../api/client.js';
import { StageCard } from '../components/StageCard.js';
import { MarkdownViewer } from '../components/MarkdownViewer.js';
import { MarkdownEditor } from '../components/MarkdownEditor.js';
import { DiffView } from '../components/DiffView.js';
import { RunLogPanel } from '../components/RunLogPanel.js';
import { Sheet } from '../components/ui/Sheet.js';
import { Button } from '../components/ui/Button.js';

function addTo(set: Set<string>, name: string): Set<string> {
  const next = new Set(set);
  next.add(name);
  return next;
}

function removeFrom(set: Set<string>, name: string): Set<string> {
  const next = new Set(set);
  next.delete(name);
  return next;
}

export const POLL_INTERVAL_MS = 2000;

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as Record<string, unknown>;
    if (err.status === 409 && typeof body.runId === 'string') {
      return `Locked: run ${body.runId} is in progress on stage ${String(body.stage)}.`;
    }
    if (err.status === 409 && typeof body.status === 'string') {
      return `Stage ${String(body.stage)} is ${body.status}, not awaiting review.`;
    }
    if (err.status === 422 && typeof body.blockingStage === 'string') {
      return `Blocked: ${body.blockingStage} is ${String(body.blockingStatus)}, must be approved first.`;
    }
    if (err.status === 403 && typeof body.error === 'string') {
      return `Forbidden: ${body.error}`;
    }
    return `API error ${err.status}`;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

function computeBlockedBy(
  stages: Array<{ name: string; status: StageStatus }>,
  stageName: string
): { stage: string; status: StageStatus } | null {
  for (const s of stages) {
    if (s.name >= stageName) break;
    if (s.status !== 'approved') {
      return { stage: s.name, status: s.status };
    }
  }
  return null;
}

export function PipelineView() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline'],
    queryFn: getPipeline,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const treeQuery = useQuery({ queryKey: ['tree'], queryFn: getTree, refetchInterval: POLL_INTERVAL_MS });
  const fileQuery = useQuery({
    queryKey: ['file', selectedPath],
    queryFn: () => getFile(selectedPath as string),
    enabled: selectedPath !== null,
  });
  const diffQuery = useQuery({
    queryKey: ['diff', selectedPath],
    queryFn: () => getDiff(selectedPath as string),
    enabled: selectedPath !== null,
  });
  const runLogQuery = useQuery({
    queryKey: ['run', selectedRunId],
    queryFn: () => getRun(selectedRunId as string),
    enabled: selectedRunId !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipeline'] });

  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const nextToastId = useRef(0);
  const pushToast = (message: string) => {
    const id = nextToastId.current++;
    setToasts((t) => [...t, { id, message }]);
  };
  const dismissToast = (id: number) => setToasts((t) => t.filter((toast) => toast.id !== id));

  const [pendingRuns, setPendingRuns] = useState<Set<string>>(new Set());
  const [pendingApprovals, setPendingApprovals] = useState<Set<string>>(new Set());
  const [pendingRejections, setPendingRejections] = useState<Set<string>>(new Set());

  const runMutation = useMutation({
    mutationFn: (stage: string) => runStage(stage),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, stage) => setPendingRuns((prev) => removeFrom(prev, stage)),
  });
  const approveMutation = useMutation({
    mutationFn: (stage: string) => approveStage(stage),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, stage) => setPendingApprovals((prev) => removeFrom(prev, stage)),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ stage, comment }: { stage: string; comment: string }) => rejectStage(stage, comment),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, variables) => setPendingRejections((prev) => removeFrom(prev, variables.stage)),
  });
  const saveFileMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => putFile(path, content),
    onSuccess: (_data, variables) => {
      if (variables.path === selectedPath) {
        setEditing(false);
      }
      queryClient.invalidateQueries({ queryKey: ['file', variables.path] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (err) => pushToast(describeApiError(err)),
  });

  const handleRun = (stage: string) => {
    setPendingRuns((prev) => addTo(prev, stage));
    runMutation.mutate(stage);
  };
  const handleApprove = (stage: string) => {
    setPendingApprovals((prev) => addTo(prev, stage));
    approveMutation.mutate(stage);
  };
  const handleReject = (stage: string, comment: string) => {
    setPendingRejections((prev) => addTo(prev, stage));
    rejectMutation.mutate({ stage, comment });
  };

  if (isLoading) {
    return (
      <p data-testid="pipeline-loading" className="p-6 text-sm text-muted">
        Loading pipeline…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p data-testid="pipeline-error" className="p-6 text-sm text-status-rejected">
        Failed to load the pipeline.
      </p>
    );
  }

  const files = (treeQuery.data ?? []).filter((entry) => entry.type === 'file');

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      {toasts.length > 0 && (
        <div data-testid="toast-list" className="fixed right-4 top-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              data-testid={`toast-${toast.id}`}
              className="flex items-start justify-between gap-3 rounded border border-status-rejected bg-white px-4 py-3 text-xs text-status-rejected shadow-md"
            >
              <span>{toast.message}</span>
              <button
                type="button"
                data-testid={`toast-dismiss-${toast.id}`}
                onClick={() => dismissToast(toast.id)}
                className="font-semibold text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-2xl font-bold text-ink">ICM Pipeline</h1>
        {data.locked && (
          <p
            data-testid="pipeline-locked"
            className="mt-1 text-xs font-semibold uppercase tracking-wide text-status-review"
          >
            A run is in progress — actions are disabled workspace-wide.
          </p>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border px-4 py-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Files</h2>
          <ul data-testid="file-tree" className="space-y-1">
            {files.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  data-testid={`file-tree-entry-${entry.path}`}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setEditing(false);
                  }}
                  className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-white ${
                    selectedPath === entry.path ? 'bg-white font-semibold text-ink' : 'text-muted'
                  }`}
                >
                  {entry.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div data-testid="stage-list" className="flex flex-wrap gap-3">
            {data.stages.map((stage) => (
              <StageCard
                key={stage.name}
                stage={stage}
                workspaceLocked={data.locked}
                blockedBy={computeBlockedBy(data.stages, stage.name)}
                isRunPending={pendingRuns.has(stage.name)}
                isApprovePending={pendingApprovals.has(stage.name)}
                isRejectPending={pendingRejections.has(stage.name)}
                onRun={handleRun}
                onApprove={handleApprove}
                onReject={handleReject}
                onViewRun={(runId) => setSelectedRunId(runId)}
              />
            ))}
          </div>

          {selectedPath && fileQuery.data && (
            <section className="flex flex-1 flex-col gap-3 rounded border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-bold text-ink">{selectedPath}</h2>
                <Button type="button" variant="secondary" data-testid="file-edit-toggle" onClick={() => setEditing((e) => !e)}>
                  {editing ? 'View' : 'Edit'}
                </Button>
              </div>
              {editing ? (
                <MarkdownEditor
                  path={selectedPath}
                  initialContent={fileQuery.data.content}
                  saving={saveFileMutation.isPending}
                  onSave={(content) => saveFileMutation.mutate({ path: selectedPath, content })}
                />
              ) : (
                <MarkdownViewer content={fileQuery.data.content} />
              )}
              <DiffView diff={diffQuery.data?.diff ?? ''} path={selectedPath} />
            </section>
          )}
        </main>
      </div>

      <Sheet
        open={selectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null);
        }}
        title="Run log"
      >
        {runLogQuery.data && <RunLogPanel runLog={runLogQuery.data} />}
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 3: Run the full frontend test suite**

Run: `npm test`
Expected: PASS — every existing test file plus the new `Sheet`/`cn`/`Button`/`Badge`/`Card`/`Separator` tests and the Task 7 drawer-close test.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PipelineView.tsx
git commit -m "style: restyle the PipelineView shell into sidebar + stage rail + drawer layout"
```

---

### Task 9: Full regression pass and manual verification

**Files:** none (verification only).

**Interfaces:** none — this task consumes the finished app from Tasks 1–8 and produces no new code.

- [ ] **Step 1: Run the full automated suite**

Run:
```bash
cd platform/web/frontend
npm run typecheck
npm test
npm run build
```
Expected: all three pass with zero errors and zero test regressions.

- [ ] **Step 2: Run the Playwright E2E suite**

Run (from `platform/web/frontend/`):
```bash
npm run e2e
```
`playwright.config.ts` already declares a `webServer` block that starts the mock server (`npm run dev` in `../mock-server`, port 4000) and the frontend dev server (port 5173) itself — no manual server startup needed.
Expected: `golden-path.spec.ts`, `blocked-ordering.spec.ts`, `reject-with-comment.spec.ts`, and `smoke.spec.ts` all pass — these exercise the same `data-testid`s this plan was careful to preserve, so a failure here means a testid regressed somewhere in Tasks 4–8.

- [ ] **Step 3: Manual click-through**

Start the mock server (`npm run dev` in `platform/web/mock-server/`) and the frontend dev server (`npm run dev` in `platform/web/frontend/`), then in a browser walk through: load the pipeline (see the stage rail + sidebar), open a file from the sidebar, toggle Edit/View, approve a stage, reject a stage with a comment, click "View last run" and confirm the drawer opens and closes (button, backdrop click, and Escape all close it), and trigger a toast (e.g. click Run twice quickly to race a 409). Confirm the Structured Editorial look (warm background, serif headings, muted status colors) reads correctly and nothing regressed visually or functionally. Stop both dev servers once done.

No commit for this task — it's verification only. If Steps 1–3 reveal a regression, fix it as part of the task where it was introduced (amend that task's commit is not appropriate this late — make a small follow-up commit instead, e.g. `git commit -m "fix: <specific regression>"`).
