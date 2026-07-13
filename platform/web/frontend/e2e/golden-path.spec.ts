import { test, expect } from '@playwright/test';
import { resetWorkspace, waitForStageStatus } from './helpers.js';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('golden path: run the pending stage, watch it complete, open the diff, edit a file, approve', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('stagecard-status-03_report')).toHaveText('pending');

  // Run the pending stage and watch it go running -> awaiting_review.
  await page.getByTestId('stagecard-run-03_report').click();
  await expect(page.getByTestId('stagecard-running-03_report')).toBeVisible();
  await waitForStageStatus(page, '03_report', 'awaiting_review');
  await expect(page.getByTestId('stagecard-running-03_report')).toHaveCount(0);

  // Open the diff for the file the run just wrote.
  await page.getByTestId('file-tree-entry-stages/03_report/output/report.md').click();
  await expect(page.getByTestId('diff-view')).toBeVisible();

  // Edit a different file and save it. It's a workspace-level file, not a stage output,
  // so it lives in the collapsed-by-default Workspace group — expand that first.
  await page.getByTestId('workspace-group-toggle').click();
  await page.getByTestId('file-tree-entry-shared/client-brief.md').click();
  await expect(page.getByTestId('markdown-viewer')).toBeVisible();
  await page.getByTestId('file-edit-toggle').click();
  await page.getByTestId('markdown-editor-textarea').fill('An edited client brief.');
  await page.getByTestId('markdown-editor-save').click();
  await expect(page.getByTestId('markdown-viewer')).toContainText('An edited client brief.');

  // Approve the stage now awaiting review.
  await page.getByTestId('gate-approve-03_report').click();
  await expect(page.getByTestId('stagecard-status-03_report')).toHaveText('approved');
});
