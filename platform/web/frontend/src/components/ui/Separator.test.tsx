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
