import { test, expect } from '@playwright/test';
import { resetWorkspace } from './helpers.js';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('loads the pipeline view with all three Meridian stages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ICM Pipeline' })).toBeVisible();
  await expect(page.getByTestId('stagecard-01_research')).toBeVisible();
  await expect(page.getByTestId('stagecard-02_analysis')).toBeVisible();
  await expect(page.getByTestId('stagecard-03_report')).toBeVisible();
  await expect(page.getByTestId('stagecard-status-01_research')).toHaveText('approved');
  await expect(page.getByTestId('stagecard-status-03_report')).toHaveText('pending');
});
