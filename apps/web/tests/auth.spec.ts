import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Sign-in is a server setting: off locally, on in the hosted demo. The login
// route has to do the right thing in both modes, so the test asks the server.
test('the login route matches the server sign-in setting', async ({ page, request }) => {
  const status = await request.get('/api/v1/auth/status');
  expect(status.ok()).toBeTruthy();
  const { enabled } = (await status.json()).data as { enabled: boolean };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  if (enabled) {
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/ })).toBeVisible();
    await expect(page.getByText('Continue as a guest')).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Your next chapter, your way.' })).toBeVisible();
    await expect(page.locator('main').getByText('Demo workspace')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
});
