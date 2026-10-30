import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

test('student can confirm marks, save offerings, compare costs and revoke a selected report', async ({ page, browser }) => {
  const failures: string[] = [];
  page.on('pageerror', e => failures.push(e.message));
  await page.goto('/');
  await page.getByRole('link', {name:'Review sample marks',exact:true}).click();
  await expect(page.getByRole('button', {name:'Confirm my result'})).toBeDisabled();
  await page.getByRole('checkbox', {name:/I have checked/}).check();
  await page.getByRole('button', {name:'Confirm my result'}).click();
  await expect(page.getByRole('heading',{name:'Your academic snapshot',exact:true})).toBeVisible();
  await page.goto('/colleges?pathway=polytechnic_diploma');
  await page.getByLabel('Filter by academic year').selectOption('2026-27');
  const rows = page.locator('.college-row');
  await expect(rows.first()).toBeVisible();
  for (let i=0;i<2;i++) {
    await rows.nth(i).getByRole('button', {name:/^Save /}).click();
    await rows.nth(i).getByRole('button',{name:'Compare',exact:true}).click();
  }
  await page.goto('/shortlist');
  await expect(page.locator('.saved-offering')).toHaveCount(2);
  await page.getByRole('textbox',{name:'A private note'}).first().fill('Private note from browser check');
  await page.getByRole('button',{name:'Save progress'}).first().click();
  await page.reload();
  await expect(page.getByRole('textbox',{name:'A private note'}).first()).toHaveValue('Private note from browser check');
  await page.goto('/compare');
  await page.getByRole('button',{name:'Calculate & save comparison'}).click();
  await expect(page.getByText('None verified',{exact:true}).first()).toBeVisible();
  const hostel = page.getByRole('spinbutton',{name:/Hostel \/ month for/});
  await hostel.nth(0).fill('2500');
  await hostel.nth(1).fill('3000');
  await page.getByRole('button',{name:'Calculate & save comparison'}).click();
  await expect(page.locator('.cost-card').first()).toContainText('25,000');
  await page.goto('/report/new');
  await page.getByRole('button',{name:'Create report & preview'}).click();
  const url = await page.getByLabel('Parent report share link',{exact:true}).inputValue();
  expect(url).toContain('/r/');
  const publicContext = await browser.newContext();
  const shared = await publicContext.newPage();
  await shared.goto(url);
  await expect(shared.getByRole('heading',{name:'A conversation about what comes next'})).toBeVisible();
  await expect(shared.getByRole('heading',{name:'Your confirmed subjects'})).toHaveCount(0);
  await expect(shared.getByText('Private note from browser check')).toHaveCount(0);
  await expect(shared.getByLabel('Shared report language')).toHaveCount(0);
  await page.getByRole('button',{name:/Revoke/}).first().click();
  await expect(page.getByText('Revoked',{exact:true}).first()).toBeVisible();
  await shared.reload();
  await expect(shared.getByText(/expired|revoked|unavailable/i).first()).toBeVisible();
  await publicContext.close();
  expect(failures).toEqual([]);
});

test('the whole Compass mission saves answers and returns a report', async ({page}) => {
  await page.goto('/compass/play');
  await page.getByRole('button', {name: /Continue to the career adventure/}).click();
  for (let step=1;step<=10;step++) {
    await expect(page.locator('.game-context')).toContainText(`${step} of 10`);
    const choices = page.locator('button.game-option');
    if (await choices.count()) await choices.first().click();
    else if (await page.getByRole('button',{name:'Enjoyment 4 of 5'}).count()) await page.getByRole('button',{name:'Enjoyment 4 of 5'}).click();
    await page.getByRole('button',{name:step===10?'See my Compass':'Continue',exact:true}).click();
  }
  await expect(page).toHaveURL(/compass\/report/);
  await expect(page.locator('.dimension-row')).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator('.dimension-row')).not.toHaveCount(0);
});

test('festival builder is playable and remains separate from career scoring', async ({page}) => {
  await page.goto('/compass/play');
  await page.getByRole('button', { name: /Let’s build a festival/ }).click();
  await page.getByRole('button', { name: /^Build Mural wall/ }).click();
  await page.getByRole('button', { name: /^Build Music stage/ }).click();
  await expect(page.locator('.festival-feedback')).toContainText('Art club combo!');
  await expect(page.getByTestId('festival-score')).toHaveText('22 / 30');
  await expect(page.locator('.festival-footer')).toContainText('Game scores don’t affect your career suggestions');
  await page.getByRole('button', { name: /Continue to the career adventure/ }).click();
  await expect(page.locator('.game-context')).toBeVisible();
});

test('floating mentor sends the current screen with the question', async ({page}) => {
  await page.route('**/api/v1/mentor/chat', async route => {
    const body = route.request().postDataJSON();
    expect(body.page_path).toBe('/explore');
    await route.fulfill({json:{data:{reply:'Check each pathway against your goals.',sources:[],fallback:false},warnings:[],request_id:'test'}});
  });
  await page.goto('/explore');
  await page.getByRole('button', {name:'Ask mentor'}).click();
  await page.getByLabel('Message to the career mentor').fill('Is this a good choice?');
  await page.getByRole('button', {name:'Send mentor message'}).click();
  await expect(page.getByText('Check each pathway against your goals.')).toBeVisible();
});

test('finder explains the missing district and can search statewide', async ({page}) => {
  await page.goto('/finder');
  await expect(page.getByRole('button',{name:'Search all districts'})).toBeVisible();
  await page.getByRole('button',{name:'Search all districts'}).click();
  await expect(page.locator('.college-row').first()).toBeVisible({timeout:45000});
  await page.locator('.college-row').first().getByRole('link',{name:/View details/}).click();
  await expect(page.getByRole('heading',{name:'What the sources tell us'})).toBeVisible();
  await expect(page.getByText('Not verified',{exact:true}).first()).toBeVisible();
});

test('mentor submits a question to the real backend and renders an answer', async ({page}) => {
  await page.goto('/mentor');
  await page.getByRole('textbox',{name:'Message to the career mentor'}).fill('Which fees are verified in this project?');
  await page.getByRole('button',{name:'Send mentor message'}).click();
  await expect(page.locator('.chat-message.assistant')).not.toHaveCount(0,{timeout:60000});
  await expect(page.locator('.chat-message.assistant').last()).not.toBeEmpty();
});

test('sample PDF creates a reviewable draft and mobile navigation works',async ({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto('/');
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('link',{name:'My marks',exact:true}).click();
  await page.getByRole('tab',{name:/PDF/}).click();
  await page.getByLabel('Sample PDF').setInputFiles(path.join(__dirname,'fixtures','sample.pdf'));
  await page.getByRole('button',{name:/Extract/}).click();
  await expect(page.getByRole('heading',{name:'Review your result'})).toBeVisible();
  await expect(page.getByLabel('Subject 1 obtained marks')).toHaveValue('84');
  await expect(page.getByRole('button',{name:'Confirm my result'})).toBeDisabled();
  const snapshot = await page.request.get('/api/v1/me/snapshot');
  expect((await snapshot.json()).data).toBeNull();
});

test('all working screens fit mobile, have one heading and pass serious accessibility checks', async ({ page }) => {
  const routes = ['/', '/start/review', '/snapshot', '/explore', '/explore/polytechnic_diploma', '/compass/play', '/compass/report', '/colleges', '/finder', '/shortlist', '/compare', '/mentor', '/report/new', '/data', '/privacy', '/settings/privacy'];
  await page.setViewportSize({width:390,height:844});
  for (const route of routes) {
    console.log('Checking',route);
    await page.goto(route);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main [aria-label="Loading"]')).toHaveCount(0);
    const wide = await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && !e.closest('table')).map(e=>({tag:e.tagName, cls:e.className,right:e.getBoundingClientRect().right,position:getComputedStyle(e).position})));
    if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) console.log(wide,await page.evaluate(()=>({doc:document.documentElement.scrollWidth,inner:innerWidth,wrap:[...document.querySelectorAll('.table-wrap,.panel,.grid')].map(e=>({cls:e.className,width:e.getBoundingClientRect().width,overflow:getComputedStyle(e).overflow,scroll:e.scrollWidth}))})));
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),{message:route}).toBe(true);
    const results = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect.soft(results.violations.filter(v=>['critical','serious'].includes(v.impact||'')),route).toEqual([]);
  }
});

