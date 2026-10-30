// Read-only visual smoke check against the running local demonstration.
const { chromium } = require('../apps/web/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://localhost:3000/colleges/dump%3A99357');
    await page.getByText('Government Polytechnic, Pune').first().waitFor({ timeout: 90000 });
    await page.getByRole('heading', { name: 'Historical Polytechnic allotments' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Ask mentor' }).click();
    await page.getByLabel('Message to the career mentor').waitFor();
    await page.screenshot({ path: 'D:/CareerQuest-Test-Work/master-live-desktop.png' });
    await page.getByRole('button', { name: 'Close mentor' }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'D:/CareerQuest-Test-Work/master-live-mobile.png' });
    console.log('Live master college detail and floating mentor: OK');
    console.log('Horizontal mobile overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
