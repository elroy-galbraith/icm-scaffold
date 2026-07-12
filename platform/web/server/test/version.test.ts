import { describe, it, expect } from 'vitest';
import { ICM_WEB_SERVER_VERSION } from '../src/version.js';

describe('scaffolding smoke test', () => {
  it('exposes a version string', () => {
    expect(ICM_WEB_SERVER_VERSION).toBe('0.1.0');
  });
});
