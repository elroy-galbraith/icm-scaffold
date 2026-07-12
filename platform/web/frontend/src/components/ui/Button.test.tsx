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
