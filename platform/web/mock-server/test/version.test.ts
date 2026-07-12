import { describe, it, expect } from 'vitest';
import { MOCK_SERVER_VERSION } from '../src/version.js';

describe('scaffolding smoke test', () => {
  it('exposes a version string', () => {
    expect(MOCK_SERVER_VERSION).toBe('0.1.0');
  });
});
