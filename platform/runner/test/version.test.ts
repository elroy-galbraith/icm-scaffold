import { describe, it, expect } from 'vitest';
import { RUNNER_VERSION } from '../src/version.js';

describe('scaffolding smoke test', () => {
  it('exposes a version string', () => {
    expect(RUNNER_VERSION).toBe('0.1.0');
  });
});
