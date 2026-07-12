import type { APIRequestContext, Page } from '@playwright/test';

export async function resetWorkspace(request: APIRequestContext): Promise<void> {
  const res = await request.post('http://localhost:4000/api/_reset');
  if (!res.ok()) {
    throw new Error(`Failed to reset workspace: ${res.status()}`);
  }
}

export async function waitForStageStatus(page: Page, stage: string, status: string): Promise<void> {
  await page.waitForFunction(
    ({ stage, status }) => {
      const el = document.querySelector(`[data-testid="stagecard-status-${stage}"]`);
      return el?.textContent?.trim() === status;
    },
    { stage, status },
    { timeout: 15000 }
  );
}
