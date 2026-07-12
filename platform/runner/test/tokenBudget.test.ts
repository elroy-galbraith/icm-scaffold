import { describe, it, expect } from 'vitest';
import { TokenBudget, BudgetExceededError } from '../src/tokenBudget.js';

describe('TokenBudget', () => {
  it('tracks spend under budget without throwing', () => {
    const budget = new TokenBudget(100);
    budget.add(40);
    budget.add(40);
    expect(budget.spent).toBe(80);
    expect(budget.remaining).toBe(20);
  });

  it('throws BudgetExceededError once spend exceeds the budget', () => {
    const budget = new TokenBudget(100);
    budget.add(60);
    expect(() => budget.add(60)).toThrow(BudgetExceededError);
  });

  it('still records spend after exceeding the budget', () => {
    const budget = new TokenBudget(100);
    try {
      budget.add(150);
    } catch {
      // expected
    }
    expect(budget.spent).toBe(150);
  });

  it('floors remaining at 0 when over budget', () => {
    const budget = new TokenBudget(100);
    try {
      budget.add(150);
    } catch {
      // expected
    }
    expect(budget.remaining).toBe(0);
  });
});
