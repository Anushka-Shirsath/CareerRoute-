import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('old login links open the guest demo without an account form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Your next chapter, your way.' })).toBeVisible();
  await expect(page.locator('main').getByText('Demo workspace')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
});
