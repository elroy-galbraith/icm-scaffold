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
