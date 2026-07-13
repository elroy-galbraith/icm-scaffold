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
