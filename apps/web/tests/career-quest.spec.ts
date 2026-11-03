import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CAREERS, GUESSES, MYTHS, ROUND_PLAN, SCENARIOS, VERSUS, buildQuest, emptyTally, interestProfile, matchCareers, QUEST_STORAGE_NAME } from '../src/screens/career-quest-data';

test('question bank is consistent and every game is a fresh, complete mix', () => {
  const careerNames = new Set(CAREERS.map(c => c.name));
  for (const q of [...SCENARIOS, ...VERSUS]) for (const option of q.options) expect(careerNames, `${q.id}: ${option.career}`).toContain(option.career);
  for (const q of GUESSES) expect(q.answer).toBeLessThan(q.options.length);
  const ids = [...SCENARIOS, ...VERSUS, ...MYTHS, ...GUESSES].map(q => q.kind + q.id);
  expect(new Set(ids).size).toBe(ids.length);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const quest = buildQuest(random);
  expect(quest.map(q => q.kind)).toEqual(ROUND_PLAN);
  expect(new Set(quest.map(q => q.id)).size).toBe(quest.length);
  for (const q of quest) if (q.kind === 'guess') {
    const original = GUESSES.find(g => g.id === q.id)!;
    expect(q.options[q.answer]).toBe(original.options[original.answer]);
  }
  const tally = emptyTally();
  tally.CR = { picked: 4, offered: 4 }; tally.AN = { picked: 2, offered: 5 }; tally.SO = { picked: 0, offered: 4 };
  const profile = interestProfile(tally);
  expect(profile[0].dim).toBe('CR');
  expect(matchCareers(profile)[0].career.dims[0]).toBe('CR');
});

test('a full quest scores rounds, teaches facts and ends with career guidance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/compass/play');
  await page.getByRole('button', { name: /Start the quest/ }).click();
  for (let round = 1; round <= 12; round++) {
    await expect(page.getByRole('progressbar', { name: 'Round' })).toHaveAttribute('aria-valuenow', String(round));
    const answers = page.getByRole('group', { name: 'Answers' }).getByRole('button');
    await answers.first().click();
    await expect(page.locator('.quest-feedback')).toContainText('XP');
    await expect(answers.first()).toBeDisabled();
    await page.getByRole('button', { name: round === 12 ? /See my career map/ : /Next round/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Your career map' })).toBeVisible();
  await expect(page.locator('.quest-career')).toHaveCount(4);
  await expect(page.locator('.quest-routes li')).not.toHaveCount(0);
  await expect(page.locator('.quest-try li')).toHaveCount(2);
  const xp = Number((await page.locator('.quest-score dd').first().textContent()) || 0);
  expect(xp).toBeGreaterThanOrEqual(12 * 5);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), QUEST_STORAGE_NAME)).toMatchObject({ best: xp, plays: 1 });
  const ask = page.getByRole('link', { name: /Talk it through with Kompas/ });
  await expect(ask).toHaveAttribute('href', /\/mentor\?q=My%20Career%20Quest%20result/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const accessibility = await new AxeBuilder({ page }).include('.quest').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
  await page.getByRole('button', { name: /Save it to my Compass/ }).click();
  await expect(page.getByRole('heading', { name: 'The Innovation Festival' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('knowledge rounds mark the right answer and the intro remembers past games', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ best: 140, plays: 2, top: 'CR' })), QUEST_STORAGE_NAME);
  await page.goto('/compass/play');
  await expect(page.getByText('Played 2 times · best 140 XP · last result: The Spark')).toBeVisible();
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: /Sound on/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Start the quest/ }).click();
  for (let round = 1; round <= 4; round++) {
    await page.getByRole('group', { name: 'Answers' }).getByRole('button').first().click();
    if (round === 4) {
      // Round 4 is always a myth round: one option is shown as the right answer.
      await expect(page.locator('.quest-badge')).toHaveText('Myth or fact?');
      await expect(page.locator('.quest-option.right, .quest-option.picked')).toHaveCount(1);
    }
    await page.getByRole('button', { name: /Next round/ }).click();
  }
  await page.getByRole('button', { name: 'Quit quest' }).click();
  await expect(page.getByRole('button', { name: /Start the quest/ })).toBeVisible();
});
