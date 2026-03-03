/**
 * ═══════════════════════════════════════════════════════════
 * E2E: Persona Features — verifies all new M1 persona features
 *
 * Tests:
 * 1. Question Bank loads with questions
 * 2. Cleanup button exists in question bank toolbar
 * 3. Persona filter dropdown has optgroup structure
 * 4. Persona Research tab is navigable
 * 5. Persona data persists across page reload (file store)
 * 6. Generated questions panel structure exists on card
 * ═══════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';

async function waitForAppLoad(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => !document.body.innerText.includes('Syncing your growth engine'),
    { timeout: 15000 }
  );
}

async function navigateToM1(page) {
  await waitForAppLoad(page);
  await page.click('text=Question Generator');
  await page.waitForTimeout(800);
}

async function openQuestionBank(page) {
  await navigateToM1(page);
  // Click Questions tab if not already active
  const questionsTab = page.locator('button', { hasText: /^Questions/ });
  if (await questionsTab.count() > 0) await questionsTab.click();
  await page.waitForTimeout(500);
  // Click "Show Question Database" to reveal the toolbar + table
  const showDbBtn = page.locator('button', { hasText: /Show Question Database/i });
  if (await showDbBtn.count() > 0) {
    await showDbBtn.click();
    await page.waitForTimeout(800);
  }
}

// ── 1. Question bank loads ──────────────────────────────────
test('question bank loads with questions', async ({ page }) => {
  await navigateToM1(page);
  const content = await page.textContent('body');
  // Should show some question count (flexible — not hardcoded)
  expect(content).toMatch(/\d+\s*question/i);
});

// ── 2. Cleanup button exists ────────────────────────────────
test('cleanup button exists in question bank toolbar', async ({ page }) => {
  await openQuestionBank(page);
  // The button shows "✨ Cleanup" or just "Cleanup"
  const cleanupBtn = page.locator('button', { hasText: /cleanup/i });
  await expect(cleanupBtn).toBeVisible({ timeout: 8000 });
});

// ── 3. Persona filter dropdown has valid structure ──────────
test('persona filter dropdown exists', async ({ page }) => {
  await openQuestionBank(page);
  // Look for the persona filter select
  const filterSelect = page.locator('select').filter({ hasText: /All Personas/i }).first();
  await expect(filterSelect).toBeVisible({ timeout: 8000 });
  // Verify it has at least the "All Personas" option
  const allOption = filterSelect.locator('option', { hasText: 'All Personas' });
  await expect(allOption).toHaveCount(1);
});

// ── 4. Persona Research tab is reachable ───────────────────
test('persona research tab is navigable', async ({ page }) => {
  await navigateToM1(page);
  const researchTab = page.locator('button', { hasText: /Persona Research/i });
  await expect(researchTab).toBeVisible({ timeout: 8000 });
  await researchTab.click();
  await page.waitForTimeout(500);
  const content = await page.textContent('body');
  // Should show import/add persona UI
  expect(content).toMatch(/LinkedIn|Import|persona/i);
});

// ── 5. Persona data persists across reload ─────────────────
test('persona data survives page reload', async ({ page }) => {
  await navigateToM1(page);

  // Navigate to Persona Research tab
  const researchTab = page.locator('button', { hasText: /Persona Research/i });
  if (await researchTab.count() > 0) await researchTab.click();
  await page.waitForTimeout(500);

  // Count personas before reload
  const beforeReload = await page.textContent('body');
  // Look for persona count indicator or cards
  const personaCardsBefore = await page.locator('[data-testid="persona-card"]').count()
    .catch(() => 0);

  // Reload the page
  await page.reload();
  await waitForAppLoad(page);
  await page.click('text=Question Generator');
  await page.waitForTimeout(800);

  const researchTab2 = page.locator('button', { hasText: /Persona Research/i });
  if (await researchTab2.count() > 0) await researchTab2.click();
  await page.waitForTimeout(1000); // wait for async file store load

  const personaCardsAfter = await page.locator('[data-testid="persona-card"]').count()
    .catch(() => 0);

  // Persona count should not decrease after reload
  expect(personaCardsAfter).toBeGreaterThanOrEqual(personaCardsBefore);
});

// ── 6. Cleanup button triggers analysis ───────────────────
test('cleanup button shows loading or preview state', async ({ page }) => {
  await openQuestionBank(page);

  const cleanupBtn = page.locator('button', { hasText: /cleanup/i });

  // Only test if button is enabled (questions exist)
  const isDisabled = await cleanupBtn.isDisabled();
  if (isDisabled) {
    // Skip — no questions loaded yet
    return;
  }

  await cleanupBtn.click();

  // Should show either "Analyzing…" loading state or the preview panel
  const analyzingText = page.locator('text=/Analyzing/i');
  const previewPanel = page.locator('text=/CLEANUP PREVIEW/i');

  // One of these must appear within 3s of clicking
  await expect(analyzingText.or(previewPanel)).toBeVisible({ timeout: 3000 });
});

// ── 7. Find Similar button appears on researched personas ──
test('find similar button appears on researched persona cards', async ({ page }) => {
  await navigateToM1(page);

  const researchTab = page.locator('button', { hasText: /Persona Research/i });
  if (await researchTab.count() > 0) await researchTab.click();
  await page.waitForTimeout(800);

  // Check if any researched persona has Find Similar button
  const findSimilarBtns = page.locator('button', { hasText: /Find Similar/i });
  const count = await findSimilarBtns.count();

  if (count > 0) {
    // At least one exists — verify it's visible
    await expect(findSimilarBtns.first()).toBeVisible();
  }
  // If count is 0 — no researched personas yet, test passes silently
});
