import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's auto-cleanup only registers when a global `afterEach` exists at
// module-load time. This project runs with `test: { globals: false }` in
// vite.config.ts, so auto-cleanup never activates and DOM nodes (plus any
// live timers/effects they hold, e.g. polling intervals) leak between test
// files. Register cleanup explicitly so every test gets a fresh DOM.
afterEach(() => {
  cleanup();
});
