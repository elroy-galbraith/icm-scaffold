import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GateActions } from './GateActions.js';

describe('GateActions', () => {
  it('calls onApprove with the stage name', () => {
    const onApprove = vi.fn();
    render(<GateActions stage="02_analysis" disabled={false} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByTestId('gate-approve-02_analysis'));
    expect(onApprove).toHaveBeenCalledWith('02_analysis');
  });

  it('disables Reject submit until a comment is entered, then calls onReject and clears the field', () => {
    const onReject = vi.fn();
    render(<GateActions stage="02_analysis" disabled={false} onApprove={vi.fn()} onReject={onReject} />);

    const submit = screen.getByTestId('gate-reject-submit-02_analysis');
    expect(submit).toBeDisabled();

    const textarea = screen.getByTestId('gate-reject-comment-02_analysis');
    fireEvent.change(textarea, { target: { value: 'too shallow' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(onReject).toHaveBeenCalledWith('02_analysis', 'too shallow');
    expect(textarea).toHaveValue('');
  });

  it('disables both Approve and Reject submit when disabled is true', () => {
    render(<GateActions stage="02_analysis" disabled={true} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByTestId('gate-approve-02_analysis')).toBeDisabled();
    fireEvent.change(screen.getByTestId('gate-reject-comment-02_analysis'), { target: { value: 'x' } });
    expect(screen.getByTestId('gate-reject-submit-02_analysis')).toBeDisabled();
  });
});
