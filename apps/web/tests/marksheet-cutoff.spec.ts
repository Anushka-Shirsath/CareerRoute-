import { test, expect } from '@playwright/test';

test('a scanned result can be reviewed and compared with historical cutoffs', async ({ page }) => {
  page.setDefaultTimeout(15000);
  if (process.env.CQ_TEST_MOBILE) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/start');
  try {
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1050;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.font = '58px Arial';
      ctx.fillText('Subject             Maximum      Obtained', 90, 130);
      [['English', '75'], ['Marathi', '80'], ['Hindi', '85'], ['Mathematics', '90'], ['Science', '95']].forEach(([name, marks], i) => {
        const y = 260 + i * 130;
        ctx.fillText(name, 90, y);
        ctx.fillText('100', 800, y);
        ctx.fillText(marks, 1250, y);
      });
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByRole('tab', { name: 'Upload a file' }).click();
    await page.getByLabel('Sample marksheet file').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await page.getByRole('button', { name: 'Extract a draft' }).click();
    await expect(page.getByRole('heading', { name: 'Review your result' })).toBeVisible();
    await expect(page.getByLabel('Subject 1 obtained marks')).toHaveValue('75');
    await page.getByRole('checkbox', { name: /I have checked/ }).check();
    await page.getByRole('button', { name: 'Confirm my result' }).click();
    await expect(page.getByRole('heading', { name: 'Your academic snapshot' })).toBeVisible();
    if (process.env.CQ_UI_CAPTURE) await page.screenshot({ path: process.env.CQ_UI_CAPTURE, fullPage: true });
    await page.getByRole('link', { name: 'Compare marks with cutoffs' }).click();
    const explorer = page.locator('.cutoff-explorer');
    await expect(explorer.getByLabel('Your percentage')).toHaveValue('85');
    await explorer.getByLabel('Course').selectOption('fyjc_science');
    await explorer.getByLabel('District').selectOption('Pune');
    await explorer.getByRole('button', { name: 'Show colleges I could get into' }).click();
    await expect(explorer.locator('.recommend-band')).toHaveCount(3);
    await expect(explorer.locator('.marks-recommendations .cutoff-result').first()).toBeVisible();
    await explorer.getByText('Advanced: compare with one exact Polytechnic seat code').click();
    await expect(explorer.getByLabel('Your merit percentage')).toHaveValue('85.00');
    await explorer.getByLabel('Historical year').selectOption('2025-26');
    await explorer.getByLabel('CAP round').selectOption('I');
    await explorer.getByLabel('Stage').selectOption('Stage-I');
    await explorer.getByLabel('Published seat type').selectOption('NGOPENH');
    await explorer.getByRole('checkbox', { name: /I checked this percentage/ }).check();
    await explorer.getByRole('button', { name: 'Find historical matches' }).click();
    await expect(explorer.locator('.cutoff-result').first()).toBeVisible();
  } finally {
    await page.request.delete('/api/v1/me');
  }
});
