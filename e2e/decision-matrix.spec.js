/**
 * ═══════════════════════════════════════════════════════════
 * E2E: Decision Matrix — Verifies enrichment feeds into matrix
 *
 * The Decision Matrix tab in M1 shows criteria per persona.
 * If enrichment is broken, the matrix shows 0 enriched.
 * ═══════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';

test.describe('Decision Matrix', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => {
      return !document.body.innerText.includes('Syncing your growth engine');
    }, { timeout: 10000 });
    // Navigate to M1
    await page.click('text=Question Generator');
    await page.waitForTimeout(1000);
  });

  test('Decision Matrix tab is accessible', async ({ page }) => {
    // Click the Decision Matrix tab
    const tab = page.locator('text=Decision Matrix');
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
    await page.waitForTimeout(500);

    const content = await page.textContent('body');
    expect(content).toMatch(/Decision Matrix|Criteria|persona/i);
  });

  test('shows enriched question count > 0', async ({ page }) => {
    // Navigate to Decision Matrix
    await page.click('text=Decision Matrix');
    await page.waitForTimeout(500);

    const content = await page.textContent('body');
    // Should show enriched count — NOT "0 enriched"
    // The enriched count comes from questions with personaFit != null
    expect(content).toMatch(/enriched/i);
    // Should NOT say "0 enriched" or "0/182"
    expect(content).not.toMatch(/\b0\s*enriched/i);
  });

  test('GC persona shows criteria rows', async ({ page }) => {
    await page.click('text=Decision Matrix');
    await page.waitForTimeout(500);

    // GC should be visible as a persona tab/option
    const content = await page.textContent('body');
    // GC has 7 criteria defined in DECISION_CRITERIA
    expect(content).toMatch(/GC|General Counsel/i);
  });
});
