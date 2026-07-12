import { test, expect } from '@playwright/test';
import { resetWorkspace, waitForStageStatus } from './helpers.js';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('reject with comment: rejecting stores the comment and allows a re-run', async ({ page }) => {
  await page.goto('/');

  // Run the pending stage so it reaches awaiting_review.
  await page.getByTestId('stagecard-run-03_report').click();
  await waitForStageStatus(page, '03_report', 'awaiting_review');

  // Reject submit is disabled until a comment is entered.
  await expect(page.getByTestId('gate-reject-submit-03_report')).toBeDisabled();
  await page.getByTestId('gate-reject-comment-03_report').fill('Needs more supporting detail.');
  await expect(page.getByTestId('gate-reject-submit-03_report')).toBeEnabled();
  await page.getByTestId('gate-reject-submit-03_report').click();

  await waitForStageStatus(page, '03_report', 'rejected');
  await expect(page.getByTestId('stagecard-comment-03_report')).toContainText('Needs more supporting detail.');

  // A rejected stage can be re-run per contracts/state-machine.md.
  await expect(page.getByTestId('stagecard-run-03_report')).toBeEnabled();
  await page.getByTestId('stagecard-run-03_report').click();
  await waitForStageStatus(page, '03_report', 'awaiting_review');
});
