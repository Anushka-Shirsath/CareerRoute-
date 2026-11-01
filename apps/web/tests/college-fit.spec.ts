import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('College Fit finds and saves colleges without uploading or confirming marks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.CQ_TEST_MOBILE) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/finder');
  try {
    const fit = page.getByRole('region', { name: 'College Fit', exact: true });
    await expect(fit).toBeVisible({ timeout: 15000 });
    await expect(fit.getByLabel('Your percentage')).toHaveValue('');
    await expect(fit.getByRole('button', { name: 'Find my college fit', exact: true })).toBeDisabled();
    await fit.getByLabel('Your percentage').fill('101');
    await expect(fit.getByRole('button', { name: 'Find my college fit', exact: true })).toBeDisabled();
    await fit.getByLabel('Your percentage').fill('85');
    await fit.getByLabel('City / district').selectOption('Pune');
    await fit.getByRole('combobox', { name: 'Course', exact: true }).selectOption('fyjc_science');
    const request = page.waitForRequest(r => r.url().endsWith('/api/v1/recommendations') && r.method() === 'POST');
    await fit.getByRole('button', { name: 'Find my college fit', exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ percent: 85, districts: ['Pune'], pathway_id: 'fyjc_science' });
    await expect(fit.getByRole('heading', { name: 'Your college fit at 85%' })).toBeVisible();
    const first = fit.locator('.college-fit-match').first();
    await expect(first).toBeVisible();
    await expect(first).toContainText(/Pune/i);
    await expect(first).toContainText(/percentage points|Same as/);
    await first.getByRole('button', { name: /^Save / }).click();
    await expect(first.getByRole('button', { name: /^Remove / })).toBeVisible();
    await first.getByRole('button', { name: /^Remove / }).click();
    await expect(first.getByRole('button', { name: /^Save / })).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).include('.college-fit').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.CQ_UI_CAPTURE) await fit.screenshot({ path: process.env.CQ_UI_CAPTURE });
    const detail = first.getByRole('link', { name: /View college details/ });
    await detail.click();
    await expect(page.getByRole('heading', { name: 'The course at a glance' })).toBeVisible();
    await page.goto('/finder');
    await fit.getByLabel('Your percentage').fill('85');
    await fit.getByLabel('City / district').selectOption('Pune');
    await fit.getByRole('button', { name: 'Find my college fit', exact: true }).click();
    await expect(fit.getByRole('heading', { name: 'Your college fit at 85%' })).toBeVisible();
    await fit.getByLabel('Your percentage').fill('70');
    await expect(fit.getByRole('heading', { name: 'Your college fit at 85%' })).toHaveCount(0);
    const snapshot = await page.request.get('/api/v1/me/snapshot');
    expect((await snapshot.json()).data).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await page.request.delete('/api/v1/me');
  }
});

test('College Fit explains no matches and recovers after a failed request', async ({ page }) => {
  let fail = false;
  await page.route('**/api/v1/recommendations', route => fail
    ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Please try again shortly.' } } })
    : route.fulfill({ json: { data: { percent: 0, category_used: 'GENERAL (default)', counts: { safe: 0, possible: 0, reach: 0 }, counts_capped: false, groups: { safe: [], possible: [], reach: [] }, notice: 'Past cutoffs are not a guarantee of admission.' } } }));
  await page.goto('/finder');
  try {
    const fit = page.getByRole('region', { name: 'College Fit', exact: true });
    await fit.getByLabel('Your percentage').fill('0');
    await fit.getByLabel('City / district').selectOption('Pune');
    await fit.getByRole('button', { name: 'Find my college fit', exact: true }).click();
    await expect(fit.getByText('No historical matches for these choices.')).toBeVisible();
    fail = true;
    await fit.getByRole('button', { name: 'Search all districts', exact: true }).click();
    await expect(fit.getByText('Please try again shortly.')).toBeVisible();
    await expect(fit.getByRole('heading', { name: /Your college fit at/ })).toHaveCount(0);
    fail = false;
    await fit.getByRole('button', { name: 'Find my college fit', exact: true }).click();
    await expect(fit.getByText('No historical matches for these choices.')).toBeVisible();
  } finally {
    await page.request.delete('/api/v1/me');
  }
});
