import { test, expect, open, action, textAction, compose, close } from './fixtures.js';

test('TEXT01–06 parse monthly dates, preview/edit, confirm receipt and cross-month refresh', async ({ page, ledger }) => {
  await open(page);
  await compose(page, 'UI虚构服务每月 0.01 元，从 2026 年 8 月到 2026 年 9 月，每月 15 日扣款');
  await expect(page.locator('.text-candidate')).toHaveCount(1);
  await expect(page.locator('[data-field="amount_minor"]')).toHaveValue('0.01');
  await expect(page.locator('[data-field="start_month"]')).toHaveValue('2026-08');
  await expect(page.locator('[data-field="through_month"]')).toHaveValue('2026-09');
  await expect(page.locator('[data-field="charge_day"]')).toHaveValue('15');
  await textAction(page, 'preview').click();
  await expect(page.locator('.text-preview-card')).toContainText('将新增 2 笔');
  await expect(page.locator('.text-preview-card')).toContainText('0.02');
  await textAction(page, 'edit').click();
  await expect(page.locator('.text-candidate')).toBeVisible();
  await textAction(page, 'preview').click();
  await textAction(page, 'confirm').click();
  await expect(page.locator('.flow-success')).toContainText('2 笔');
  await expect(page.locator('.flow-success')).toContainText('2026-08-15 至 2026-09-15');
  await textAction(page, 'view-bills').click();
  // The date range correctly includes the 61 existing fixture records as well.
  await expect(page.locator('.filter-summary')).toContainText('63 笔');
  await expect(page.locator('.mobile-bills')).toContainText('UI虚构服务');
  await page.reload();
  await expect(page.locator('.filter-summary')).toContainText('63 笔');
  const entries = (await ledger.call('/entries?q=UI虚构服务')).entries;
  expect(entries.map(e => e.occurred_on).sort()).toEqual(['2026-08-15', '2026-09-15']);
  expect(entries.reduce((sum, e) => sum + e.amount_minor, 0)).toBe(2);
});

test('TEXT07–10 unknown start stays draft, reopen, delete cancel and confirm', async ({ page, ledger }) => {
  await open(page);
  await compose(page, 'UI虚构云存储每月 68 元，先补记到 2026 年 1 月，起始月待确认');
  await textAction(page, 'save').click();
  await expect(page.locator('#text-status')).toContainText('0 笔入账');
  expect((await ledger.call('/entries')).totals.count).toBe(61);
  await textAction(page, 'new').click();
  await expect(page.locator('.text-batch-row')).toContainText('UI虚构云存储');
  await textAction(page, 'open').click();
  await expect(page.locator('[data-field="start_month"]')).toHaveValue('');
  await textAction(page, 'delete').click();
  await textAction(page, 'cancel-delete').click();
  await expect(page.locator('.text-candidate')).toBeVisible();
  await textAction(page, 'delete').click();
  await textAction(page, 'confirm-delete').click();
  await expect(page.locator('#text-status')).toContainText('草稿已删除');
  await expect(page.locator('.text-batch-row')).toHaveCount(0);
  expect((await ledger.call('/text-batches')).batches).toHaveLength(0);
});

test('TEXT08 continuing rule, details editing, pause/resume and new batch', async ({ page, ledger }) => {
  await open(page);
  await compose(page, 'UI虚构订阅每月 0.01 元，从 2026 年 9 月到 2026 年 9 月，每月 15 日扣款');
  await page.locator('.text-candidate summary').click();
  await page.locator('[data-field="title"]').fill('UI修改订阅');
  await page.locator('[data-field="title"]').blur();
  await page.locator('[data-field="range_mode"]').selectOption('ongoing');
  await expect(page.locator('[data-field="through_month"]')).toHaveCount(0);
  await textAction(page, 'preview').click();
  await textAction(page, 'confirm').click();
  await expect(page.locator('.flow-success')).toContainText('1 笔');
  await textAction(page, 'new').click();
  await textAction(page, 'open').click();
  await expect(page.locator('.text-candidate [data-field="amount_minor"]')).toBeDisabled();
  await textAction(page, 'pause').click();
  await expect(page.locator('#text-status')).toContainText('已暂停');
  expect((await ledger.call('/text-batches')).batches[0].status).toBe('paused');
  await textAction(page, 'resume').click();
  await expect(page.locator('#text-status')).toContainText('已恢复');
  await textAction(page, 'new').click();
  await expect(page.locator('#text-raw')).toHaveValue('');
});

test('TEXT11 duplicate warning requires explicit acknowledgement', async ({ page, ledger }) => {
  await open(page);
  await compose(page, '2026 年 9 月 14 日午餐 35 元');
  await textAction(page, 'preview').click();
  await expect(page.locator('#text-ack-duplicates')).toBeVisible();
  await textAction(page, 'confirm').click();
  await expect(page.locator('#text-status')).not.toBeEmpty();
  expect((await ledger.call('/entries')).totals.count).toBe(61);
  await page.locator('#text-ack-duplicates').check();
  await textAction(page, 'confirm').click();
  await expect(page.locator('.flow-success')).toContainText('1 笔');
  expect((await ledger.call('/entries')).totals.count).toBe(62);
});

test('TEXT12 failed save is retryable with same operation and exact record count', async ({ page, ledger }) => {
  await open(page);
  await compose(page, '2026 年 8 月 15 日 UI虚构咖啡 0.01 元');
  await page.route('**/api/text-batches', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await textAction(page, 'save').click();
  await expect(textAction(page, 'retry')).toBeVisible();
  await expect(page.locator('[data-field="amount_minor"]')).toHaveValue('0.01');
  expect((await ledger.call('/text-batches')).batches).toHaveLength(0);
  await page.unroute('**/api/text-batches');
  await textAction(page, 'retry').click();
  await expect(page.locator('#text-status')).toContainText('草稿已保存');
  expect((await ledger.call('/text-batches')).batches).toHaveLength(1);
  expect((await ledger.call('/entries')).totals.count).toBe(61);
});

test('TEXT13 failed saved-list load has an explicit retry', async ({ page }) => {
  await open(page);
  await page.route('**/api/text-batches', route => route.fulfill({ status: 500, json: { error: { message: '模拟列表故障', code: 'TEST' } } }));
  await action(page, 'text-records').click();
  await expect(textAction(page, 'list-retry')).toBeVisible();
  await expect(page.locator('#text-batch-list')).toContainText('模拟列表故障');
  await page.unroute('**/api/text-batches');
  await textAction(page, 'list-retry').click();
  await expect(textAction(page, 'list-retry')).toHaveCount(0);
});

test('TEXT14 multi-entry separation, selection and unsaved text refresh', async ({ page }) => {
  await open(page);
  await action(page, 'text-records').click();
  await page.locator('#text-raw').fill('2026 年 8 月 15 日午餐 18 元；2026 年 8 月 16 日打车 25 元');
  await close(page);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await action(page, 'text-records').click();
  await expect(page.locator('#text-raw')).toContainText('打车 25 元');
  await textAction(page, 'parse').click();
  await expect(page.locator('.text-candidate')).toHaveCount(2);
  await page.locator('.text-candidate').last().locator('summary').click();
  await page.locator('.text-candidate').last().locator('[data-field="selected"]').uncheck();
  await textAction(page, 'preview').click();
  await expect(page.locator('.text-preview-card')).toContainText('将新增 1 笔');
  await expect(page.locator('.text-preview-card')).toContainText('18.00');
});

for (const width of [360, 390, 430, 768, 1440, 1920]) {
  test(`LAY01–06 ${width}px all routes, no overflow, main controls visible`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const route of ['record', 'bills', 'stats', 'settings']) {
      await open(page, route);
      const layout = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth }));
      expect(layout.body, `${route} horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
      if (width < 768) {
        const nav = await page.locator('.mobile-nav').boundingBox();
        const tools = await page.locator('.mobile-tools').boundingBox();
        expect(nav.y).toBeGreaterThan(700);
        expect(tools.y).toBeGreaterThan(600);
        expect(tools.y + tools.height).toBeLessThanOrEqual(nav.y + 1);
        const controls = await page.locator('.mobile-tools button').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
        expect(controls.every(h => h >= 44)).toBe(true);
        if (route === 'record') {
          const recent = await page.locator('.record-layout > .recent-card').boundingBox();
          const entry = await page.locator('.record-layout > .entry-card').boundingBox();
          expect(Math.abs(recent.x - entry.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(recent.width - entry.width), 'cards must align regardless of note length').toBeLessThanOrEqual(1);
        }
      } else {
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('.mobile-nav')).not.toBeVisible();
      }
      if ([390, 1440].includes(width)) await testInfo.attach(`${route}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });
}

test.describe('empty ledger and short screen', () => {
  test.use({ seed: 'empty' });
  test('STAT07–08 zero expense and income only never render a fake chart', async ({ page, ledger }) => {
    await open(page, 'stats');
    await expect(page.locator('#expense-chart')).toHaveCount(0);
    await expect(page.locator('.chart-card')).toContainText('还没有支出');
    await action(page, 'new-entry').click();
    await expect(page).toHaveURL(/record/);
    await ledger.call('/entries', { type: 'income', amount_minor: 999, category_id: 'salary', occurred_on: '2026-09-01', note: '仅收入测试' });
    await open(page, 'stats');
    await expect(page.locator('#expense-chart')).toHaveCount(0);
    await expect(page.locator('.mobile-stat-hero')).toContainText('9.99');
  });
  test('LAY07 long amounts, note limit and compact height', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 568 });
    await open(page);
    await page.locator('#amount-main').fill('99,999,999.99');
    await page.locator('#note-main').fill('长备注'.repeat(66));
    expect(await page.locator('#note-main').inputValue()).toHaveLength(198);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(page.locator('.record-tools button[type="submit"]')).toBeInViewport();
    await action(page, 'text-records').click();
    const bounds = await page.locator('#dialog').boundingBox();
    expect(bounds.height).toBeLessThanOrEqual(568);
    await close(page);
  });
});

test.describe('trash pagination', () => {
  test.use({ seed: 'trash' });
  test('EDIT08 trash paging, restore from list preserves totals', async ({ page, ledger }) => {
    await open(page, 'settings');
    await action(page, 'trash').click();
    await expect(page.locator('.trash-list .record-row')).toHaveCount(50);
    await page.locator('#dialog [data-action="trash-page"][data-offset="50"]').click();
    await expect(page.locator('.trash-list .record-row')).toHaveCount(11);
    await expect(page.locator('#dialog [data-action="trash-page"][data-offset="100"]')).toBeDisabled();
    await page.locator('#dialog [data-action="trash-page"][data-offset="0"]').click();
    await action(page, 'restore-entry').click();
    await expect(page.locator('#dialog')).toContainText('删除的 60 笔');
    expect((await ledger.call('/entries')).totals.count).toBe(1);
  });
});
