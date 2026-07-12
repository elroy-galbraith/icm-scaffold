import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from './Sheet.js';

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onOpenChange={vi.fn()} title="Run log">
        <p>content</p>
      </Sheet>
    );
    expect(screen.queryByTestId('sheet-overlay')).not.toBeInTheDocument();
  });

  it('renders the title and children when open', () => {
    render(
      <Sheet open={true} onOpenChange={vi.fn()} title="Run log">
        <p>content</p>
      </Sheet>
    );
    expect(screen.getByText('Run log')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the close button is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.click(screen.getByTestId('sheet-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when the backdrop is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when Escape is pressed', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={true} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not listen for Escape while closed', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={false} onOpenChange={onOpenChange} title="Run log">
        <p>content</p>
      </Sheet>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
