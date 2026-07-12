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
