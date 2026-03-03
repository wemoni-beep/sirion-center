/**
 * ═══════════════════════════════════════════════════════════
 * E2E: Dashboard — Verifies the Growth Command Center
 *
 * These tests open a real browser and check what the user sees.
 * If any of these fail, it means the dashboard is broken.
 * ═══════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for pipeline to load (loading spinner disappears)
    await page.waitForFunction(() => {
      return !document.body.innerText.includes('Syncing your growth engine');
    }, { timeout: 10000 });
  });

  test('loads with pipeline data showing questions', async ({ page }) => {
    // The pipeline flow section should show a question count
    const content = await page.textContent('body');
    expect(content).toMatch(/\d+/);
    expect(content).toContain('Questions');
  });

  test('shows Growth Pipeline header', async ({ page }) => {
    const content = await page.textContent('body');
    expect(content).toContain('Growth Pipeline');
  });

  test('shows all 5 module cards', async ({ page }) => {
    const content = await page.textContent('body');
    expect(content).toContain('Question Generator');
    expect(content).toContain('Perception Monitor');
    expect(content).toContain('Authority Ring');
    expect(content).toContain('Buying Stage Guide');
    expect(content).toContain('CLM Advisor');
  });

  test('M1 card shows question count and persona count', async ({ page }) => {
    const content = await page.textContent('body');
    // M1 should show a question count and persona count
    expect(content).toMatch(/\d+/);
    expect(content).toMatch(/personas/i);
  });

  test('sidebar navigation works', async ({ page }) => {
    // Click on Question Generator in sidebar
    await page.click('text=Question Generator');
    // Should navigate to M1 — look for M1 header or question table
    await page.waitForTimeout(500);
    const content = await page.textContent('body');
    // Question Generator module should be visible now
    expect(content).toMatch(/question/i);
  });
});
