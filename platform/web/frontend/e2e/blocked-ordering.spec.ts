import { test, expect } from '@playwright/test';
import { resetWorkspace, waitForStageStatus } from './helpers.js';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('blocked stage ordering: a rejected lower stage blocks the next stage in the UI and the API', async ({
  page,
  request,
}) => {
  await page.goto('/');

  // Re-run the already-approved 02_analysis stage so it can be rejected.
  await page.getByTestId('stagecard-run-02_analysis').click();
  await waitForStageStatus(page, '02_analysis', 'awaiting_review');
  await page.getByTestId('gate-reject-comment-02_analysis').fill('Needs another pass.');
  await page.getByTestId('gate-reject-submit-02_analysis').click();
  await waitForStageStatus(page, '02_analysis', 'rejected');

  // 03_report's Run button is now disabled client-side, naming the blocking stage.
  const runButton = page.getByTestId('stagecard-run-03_report');
  await expect(runButton).toBeDisabled();
  await expect(runButton).toHaveAttribute('title', /02_analysis/);

  // A direct API call bypassing the disabled button is still rejected with 422.
  const res = await request.post('http://localhost:4000/api/stages/03_report/run');
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.blockingStage).toBe('02_analysis');
  expect(body.blockingStatus).toBe('rejected');
});
