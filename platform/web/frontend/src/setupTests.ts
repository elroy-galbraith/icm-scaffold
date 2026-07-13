import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout engine and doesn't implement scrollIntoView at all
// (not even as a no-op), so any component that calls it throws in tests.
// Stub it globally rather than mocking per-test.
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// RTL's auto-cleanup only registers when a global `afterEach` exists at
// module-load time. This project runs with `test: { globals: false }` in
// vite.config.ts, so auto-cleanup never activates and DOM nodes (plus any
// live timers/effects they hold, e.g. polling intervals) leak between test
// files. Register cleanup explicitly so every test gets a fresh DOM.
afterEach(() => {
  cleanup();
});
