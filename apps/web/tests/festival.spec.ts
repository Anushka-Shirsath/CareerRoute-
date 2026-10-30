import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOTHS, CHALLENGES, THEMES, canAddBooth, scoreFestival, RECORD_KEY, type BoothId } from '../src/screens/festival-rules';

test('all challenge themes are winnable with three stars and legal budgets', () => {
  // Exhaust the tiny choice space: future balance changes cannot make a day impossible.
  for (const challenge of CHALLENGES) for (const theme of THEMES) {
    let best = 0;
    for (let mask = 1; mask < 1 << BOOTHS.length; mask++) {
      const ids = BOOTHS.filter((_, index) => mask & (1 << index)).map((booth) => booth.id);
      const score = scoreFestival(ids, theme);
      if (ids.length <= 4 && score.spent <= challenge.budget) best = Math.max(best, score.total + 10);
    }
    expect(best, `${challenge.name}, ${theme}`).toBeGreaterThanOrEqual(challenge.goal + 6);
  }
  expect(scoreFestival([], 'Create').total).toBe(0);
  expect(scoreFestival(['mural', 'music'], 'Create')).toMatchObject({ spent: 5, base: 9, featured: 6, variety: 2, total: 22 });
  expect(canAddBooth(['robot', 'arcade', 'food'], 'music', 12)).toBe(false);
  expect(canAddBooth(['robot'], 'robot', 12)).toBe(false);
  expect(canAddBooth(['mural', 'music', 'garden', 'food'], 'robot', 20)).toBe(false);
});

test('three-day campaign scores correctly, saves a record, and can restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/compass/play');
  await page.getByRole('button', { name: /Let’s build a festival/ }).click();
  const lineups: BoothId[][] = [['robot', 'mural', 'food', 'music'], ['robot', 'mural', 'food', 'music'], ['robot', 'arcade', 'food', 'garden']];
  const totals = [48, 45, 53];
  for (let day = 0; day < 3; day++) {
    for (const id of lineups[day]) {
      const booth = BOOTHS.find(item => item.id === id)!;
      await page.getByRole('button', { name: new RegExp(`^Build ${booth.name},`) }).click();
    }
    await expect(page.getByRole('img', { name: /Your festival grounds with 4 of 4/ })).toBeVisible();
    await page.getByRole('button', { name: /Open the gates/ }).click();
    for (let visitor = 1; visitor <= 5; visitor++) await page.getByRole('button', { name: `Welcome visitor ${visitor} of 5, plus 2 visitors` }).click();
    await expect(page.getByTestId('festival-result')).toContainText('What a big day!');
    await expect(page.locator('.festival-result-number')).toHaveText(`${totals[day]}happy visitors`);
    await expect(page.locator('.festival-result-stars')).toHaveAttribute('aria-label', '3 of 3 stars');
    if (day < 2) await page.getByRole('button', { name: `On to day ${day + 2}` }).click();
  }
  await expect(page.getByText('Festival complete: 9 of 9 stars!')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), RECORD_KEY)).toEqual({ best: 53, festivals: 3 });
  await page.getByRole('button', { name: /Play a new festival/ }).click();
  await expect(page.locator('.festival-day-row')).toContainText('Day 1 of 3');
  await expect(page.getByTestId('festival-score')).toHaveText('0 / 30');
  await expect(page.locator('.festival-featured')).toContainText('Make attractions');
  await page.reload();
  await expect(page.locator('.festival-best')).toContainText('53 visitors');
  expect(errors).toEqual([]);
});

test('build limits, removal refunds, help and sound controls work', async ({ page }) => {
  await page.goto('/compass/play');
  await page.locator('.festival-help summary').click();
  await expect(page.getByText('A little planning. A big day out.')).toBeVisible();
  await page.locator('.festival-help summary').click();
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sound on' }).click();
  await page.getByRole('button', { name: /Let’s build a festival/ }).click();
  await expect(page.getByRole('button', { name: /Open the gates/ })).toBeDisabled();
  for (const name of ['Robot rally', 'Arcade tent', 'Food lab']) await page.getByRole('button', { name: new RegExp(`^Build ${name},`) }).click();
  await expect(page.locator('.festival-stat').first()).toContainText('1 / 12');
  await expect(page.getByRole('button', { name: /^Build Music stage/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Remove Robot rally/ }).click();
  await expect(page.locator('.festival-stat').first()).toContainText('5 / 12');
  await expect(page.getByRole('button', { name: /^Build Robot rally/ })).toHaveAttribute('aria-pressed', 'false');
  for (const name of ['Music stage', 'Green garden']) await page.getByRole('button', { name: new RegExp(`^Build ${name},`) }).click();
  await expect(page.locator('.festival-cell.revealed')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^Build Mural wall/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Remove Food lab/ }).click();
  await expect(page.getByRole('button', { name: /^Build Mural wall/ })).toBeEnabled();
});

test('rush works by keyboard, timeout resolves, and retry refunds the budget', async ({ page }) => {
  await page.goto('/compass/play');
  await page.getByRole('button', { name: /Let’s build a festival/ }).click();
  await page.getByRole('button', { name: /^Build Mural wall/ }).click();
  await page.getByRole('button', { name: /Open the gates/ }).click();
  for (let visitor = 1; visitor <= 5; visitor++) {
    await expect(page.getByRole('button', { name: `Welcome visitor ${visitor} of 5, plus 2 visitors` })).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('festival-result')).toContainText('A good start!');
  await expect(page.locator('.festival-result-number')).toHaveText('20happy visitors');
  await page.getByRole('button', { name: /Try this day again/ }).click();
  await expect(page.locator('.festival-stat').first()).toContainText('12 / 12');
  await page.getByRole('button', { name: /^Build Food lab/ }).click();
  await page.clock.install();
  await page.getByRole('button', { name: /Open the gates/ }).click();
  await page.clock.runFor(12100);
  await expect(page.getByTestId('festival-result')).toContainText('A good start!');
  await expect(page.locator('.festival-result-number')).toHaveText('7happy visitors');
  await expect(page.locator('.festival-visitor')).toHaveCount(0);
  await expect(page.locator('.festival-best')).toContainText('20 visitors');
});

test('mobile layout, reduced motion, storage recovery and accessibility', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(key => localStorage.setItem(key, '{invalid'), RECORD_KEY);
  await page.goto('/compass/play');
  await expect(page.getByRole('heading', { name: 'Big Day Festival' })).toBeVisible();
  const checkLayout = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('.festival-game').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);
  };
  await checkLayout();
  await page.getByRole('button', { name: /Let’s build a festival/ }).click();
  await page.getByRole('button', { name: /^Build Music stage/ }).click();
  await checkLayout();
  await page.getByRole('button', { name: /Open the gates/ }).click();
  await page.getByRole('button', { name: /Finish without more bonus/ }).click();
  await expect(page.getByTestId('festival-result')).toBeVisible();
  await checkLayout();
  for (const width of [320, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Viewport ${width}`).toBe(true);
  }
});
