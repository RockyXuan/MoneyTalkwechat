import { test, expect, open, compose, close, textAction } from './fixtures.js';
import { parseTextRecords } from '../../shared/text-records.js';

test.use({ seed: 'empty' });
const candidate = page => page.locator('.text-candidate').first();
const confirm = page => candidate(page).locator('.confirm-one');
const feedback = page => candidate(page).locator('.candidate-feedback');

for (const width of [360, 1440]) test(`RECUR01 ${width}px legacy unknown charge day can explicitly become monthly records`, async ({ page, ledger }, testInfo) => {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  const items = parseTextRecords('从2025年10月开始每月合成订阅0.01元，补记到2026年1月', '2026-10-11');
  delete items[0].date_precision; // Existing drafts predate the precision field.
  items[0].charge_day = null;
  items[0].questions = ['扣款日未知'];
  const batch = (await ledger.call('/text-batches', { original_text: '合成旧循环验收', items })).batch;
  await open(page);
  await page.locator(`.batch-history-row[data-batch-id="${batch.id}"]`).click();
  await confirm(page).click();
  await expect(feedback(page)).toContainText('扣款日待确认');
  await expect(feedback(page)).toContainText('只记月份');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  const a = await feedback(page).boundingBox(), b = await confirm(page).boundingBox();
  expect(Math.abs(a.y + a.height - b.y)).toBeLessThan(170);
  expect(a.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(width < 768 ? 844 : 1000);
  await testInfo.attach(`recurring-missing-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await textAction(page, 'month-only').click();
  await expect(candidate(page).locator('[data-field=cycle_precision]')).toHaveValue('month');
  await expect(candidate(page).locator('[data-field=charge_day]')).toHaveCount(0);
  await expect(feedback(page)).toContainText('4 笔 · 只记月份');
  await expect(feedback(page)).not.toHaveClass(/has-error/);
  await expect(confirm(page)).toBeFocused();
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  await textAction(page, 'save').click();
  await expect(page.locator('#text-status')).toContainText('草稿已保存');
  await expect(confirm(page)).toBeEnabled();
  await close(page); await page.reload(); await page.waitForLoadState('networkidle');
  await page.locator(`.batch-history-row[data-batch-id="${batch.id}"]`).click();
  await expect(candidate(page).locator('[data-field=cycle_precision]')).toHaveValue('month');
  await confirm(page).click();
  await expect(page.locator('.flow-success')).toContainText('4 笔');
  const entries = (await ledger.call('/entries')).entries;
  expect(entries.map(e => e.occurred_on).sort()).toEqual(['2025-10', '2025-11', '2025-12', '2026-01']);
  expect(entries.every(e => e.amount_minor === 1)).toBe(true);
  expect((await ledger.call('/backup')).version).toBe(3);
});

test('RECUR02 choosing month precision never waives unknown start or contradictory range', async ({ page, ledger }) => {
  await open(page); await compose(page, '每月合成服务0.01元，补记到2026年1月');
  await candidate(page).locator('[data-field=cycle_precision]').selectOption('day');
  await expect(feedback(page)).toContainText('起始月待确认');
  await expect(feedback(page)).toContainText('扣款日待确认');
  await textAction(page, 'month-only').click();
  await confirm(page).click();
  await expect(feedback(page)).toContainText('起始月待确认');
  await expect(feedback(page)).not.toContainText('扣款日');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  await candidate(page).locator('[data-field=start_month]').fill('2026-02');
  await confirm(page).click();
  await expect(feedback(page)).toContainText('起始月晚于截止月');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  await candidate(page).locator('[data-field=start_month]').fill('2025-12');
  await candidate(page).locator('[data-field=cycle_precision]').selectOption('day');
  await expect(candidate(page).locator('[data-field=charge_day]')).toHaveValue('');
  await candidate(page).locator('[data-field=charge_day]').fill('32');
  await confirm(page).click();
  await expect(feedback(page)).toContainText('1–31');
  await textAction(page, 'month-only').click(); // Invalid day does not block the explicit decision to omit it.
  await expect(feedback(page)).toContainText('2 笔 · 只记月份');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
});

test('RECUR03 invalid amount and unavailable saving are explained next to the affected confirm button', async ({ page, ledger }) => {
  await open(page); await compose(page, '从2026年8月开始每月合成服务0.01元，补记到2026年9月');
  await candidate(page).locator('[data-field=amount_minor]').fill('abc');
  await confirm(page).click();
  await expect(feedback(page)).toHaveClass(/has-error/);
  await expect(feedback(page)).toContainText('金额');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  await candidate(page).locator('[data-field=amount_minor]').fill('0.01');
  await page.route('**/api/text-batches/*/confirm', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '测试：保存服务暂时不可用，请重试' } }) }));
  await confirm(page).click();
  await expect(feedback(page)).toContainText('保存服务暂时不可用');
  await expect(textAction(page, 'retry')).toBeVisible();
  await expect(candidate(page).locator('[data-field=amount_minor]')).toHaveValue('0.01');
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  await page.unroute('**/api/text-batches/*/confirm');
  await textAction(page, 'retry').click();
  await expect(page.locator('#text-status')).toContainText('不会重复入账');
  expect((await ledger.call('/entries')).totals.count).toBe(2);
});
