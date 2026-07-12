export class BudgetExceededError extends Error {
  constructor(public readonly spent: number, public readonly budget: number) {
    super(`Token budget exceeded: spent ${spent} of ${budget}`);
    this.name = 'BudgetExceededError';
  }
}

export class TokenBudget {
  private spentTokens = 0;

  constructor(private readonly budget: number) {}

  add(tokens: number): void {
    this.spentTokens += tokens;
    if (this.spentTokens > this.budget) {
      throw new BudgetExceededError(this.spentTokens, this.budget);
    }
  }

  get spent(): number {
    return this.spentTokens;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.spentTokens);
  }
}
