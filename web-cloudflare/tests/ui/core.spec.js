import { test, expect, open, action, close, write, downloadText } from './fixtures.js';

test('CORE01 routes, history, default pages, Light/Dark theme persistence and manual create', async ({ page, ledger }) => {
  await open(page);
  for (const route of ['bills', 'stats', 'settings', 'subscriptions', 'record']) {
    await page.locator(`.mobile-nav [data-route="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${route}`));
    await expect(page.locator(`#main.page-${route}`)).toBeVisible();
  }
  await page.goBack();
  await expect(page.locator('.page-subscriptions')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.page-record')).toBeVisible();

  // Viewport default pages
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/stats/);
  await page.locator('.sidebar nav [data-route="settings"]').click();
  await action(page, 'toggle-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await action(page, 'settings-theme-light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/record/);

  // Manual create via unified toggle (switch back to text once to verify toggle too)
  await action(page, 'record-mode-manual').click();
  await expect(page.locator('#manual-form')).toBeVisible();
  await action(page, 'record-mode-text').click();
  await expect(page.locator('#record-text-raw')).toBeVisible();
  await action(page, 'record-mode-manual').click();
  await page.locator('#manual-form [data-action="manual-entry-type"]').filter({ hasText: '收入' }).click();
  await expect(page.locator('#manual-form')).toContainText('工资');
  await write(page, { amount: '1,234.56', note: '核心收入测试', date: '2026-08-31' });
  await expect(page.locator('#main')).toContainText('已入账');
  const rows = (await ledger.call('/entries?q=核心收入测试')).entries;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ amount_minor: 123456, type: 'income', category_id: 'salary' });
  await action(page, 'view-receipt').click();
  await expect(page.locator('.mobile-bills')).toContainText('核心收入测试');
});

test('CORE02 invalid manual inputs rejected and lost-response retry writes exactly once', async ({ page, ledger }) => {
  await open(page);
  await action(page, 'record-mode-manual').click();
  for (const amount of ['', '0', '-1', '1.234', '100000000', 'abc', '1,23']) {
    await write(page, { amount });
    await expect(page.locator('#manual-error')).not.toBeEmpty();
    await expect(page.locator('#manual-form [name="amount"]')).toHaveValue(amount);
  }
  await write(page, { amount: '15.00', date: '2099-01-01' });
  await expect(page.locator('#manual-error')).toContainText('今天');
  expect((await ledger.call('/entries')).totals.count).toBe(61);

  // Lost response after server write -> retry resolves same operation key without duplicating
  let writes = 0;
  await page.route('**/api/entries', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await write(page, { amount: '0.01', note: '失联单笔测试', date: '2026-09-14' });
  await expect(page.locator('#main')).toContainText('已入账');
  expect(writes).toBe(1);
  expect((await ledger.call('/entries?q=失联单笔测试')).entries).toHaveLength(1);
  await page.unroute('**/api/entries');
});

test('CORE03 delete, undo toast, trash restore, bills filters, pagination and CSV export', async ({ page, ledger }) => {
  await open(page, 'bills');
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await action(page, 'bills-page-next').click();
  await expect(page.locator('.pagination')).toContainText('第 2 / 2');
  await action(page, 'bills-page-prev').click();

  const detailBtn = page.locator('.mobile-bills [data-entry-id="demo-lunch"] [data-action="bill-open-detail"]');
  await detailBtn.click();
  await action(page, 'delete-entry').click();
  await action(page, 'confirm-delete').click();
  await expect(detailBtn).toHaveCount(0);
  await action(page, 'undo-toast').click();
  await expect(detailBtn).toBeVisible();

  await detailBtn.click();
  await action(page, 'delete-entry').click();
  await action(page, 'confirm-delete').click();
  await expect(detailBtn).toHaveCount(0);

  await page.locator('.mobile-nav [data-route="settings"]').click();
  await action(page, 'settings-trash').click();
  await expect(page.locator('#dialog')).toContainText('午餐');
  await page.locator('#dialog [data-action="trash-restore-entry"]').first().click();
  await close(page);
  expect((await ledger.call('/entries/demo-lunch')).entry.deleted_at).toBeNull();

  // Bills filters + CSV headers include 二级分类 & 归属人
  await page.locator('.mobile-nav [data-route="bills"]').click();
  await page.locator('[data-action="bills-filter-type"]').filter({ hasText: '收入' }).click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await page.locator('[data-action="bills-filter-type"]').filter({ hasText: '全部' }).click();

  await action(page, 'bills-open-filters').click();
  await page.locator('#dialog [name="from"]').fill('2026-09-01');
  await page.locator('#dialog [name="to"]').fill('2026-09-30');
  await page.locator('#dialog').getByLabel('搜索').fill('午餐');
  await page.locator('#dialog').getByLabel('收支类型').selectOption('expense');
  await page.locator('#dialog').getByLabel('大类').selectOption('food');
  await action(page, 'apply-filters').click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  const filteredCsv = await downloadText(page, action(page, 'bills-export-filter'));
  expect(filteredCsv).toContain('二级分类');
  expect(filteredCsv).toContain('归属人');
  expect(filteredCsv).toContain('午餐');
  expect(filteredCsv).not.toContain('工资');
  await action(page, 'bills-clear-all').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');

  // Empty bills state + new entry shortcut
  await action(page, 'previous-month').click();
  await expect(page.locator('.filter-summary')).toContainText('共 0 笔');
  await action(page, 'next-month').click();
});

test('CORE04 backup download, chunked restore, ledger switch, error recovery and logout', async ({ page, ledger }) => {
  await open(page, 'settings');
  await action(page, 'settings-backup').click();
  const downloaded = JSON.parse(await downloadText(page, action(page, 'backup-download-json')));
  expect(downloaded.entries).toHaveLength(61);

  await page.locator('#backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#dialog')).toContainText('无法读取');

  const candidateBackup = structuredClone(ledger.backup);
  candidateBackup.ledger.name = 'UI候选恢复测试';
  candidateBackup.entries = candidateBackup.entries.slice(0, 2);
  await page.locator('#backup-file').setInputFiles({
    name: 'valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(candidateBackup)),
  });
  await action(page, 'start-restore').click();
  await expect(action(page, 'activate-restored-ledger')).toBeVisible();
  const origLedgerId = (await ledger.call('/session')).ledger.id;
  await action(page, 'activate-restored-ledger').click();
  await expect(page.locator('.page-settings')).toContainText('UI候选恢复测试');

  await action(page, 'settings-ledgers').click();
  await page.locator('#dialog [data-action="activate-ledger"]').filter({ hasText: ledger.backup.ledger.name }).click();
  await expect(page.locator('.page-settings')).toContainText(ledger.backup.ledger.name);
  expect((await ledger.call('/session')).ledger.id).toBe(origLedgerId);

  // Logout clears caches and stays logged out until boot-login clicked
  await page.evaluate(() => sessionStorage.setItem('moneytalk:pending-module:test', 'x'));
  await action(page, 'settings-logout').click();
  await action(page, 'confirm-logout').click();
  await expect(page.locator('.boot-state')).toContainText('已退出当前会话');
  expect(await page.evaluate(() => sessionStorage.getItem('moneytalk:pending-module:test'))).toBeNull();
  await action(page, 'boot-login').click();
  await expect(page.locator('#main')).toBeVisible();

  // Boot 503 outage recovery & Stats 500 error recovery
  await page.route('**/api/stats?**', route => route.fulfill({ status: 500, json: { error: { message: '模拟统计故障', code: 'TEST' } } }));
  await page.locator('.mobile-nav [data-route="stats"]').click();
  await expect(page.locator('.error-panel')).toContainText('模拟统计故障');
  await expect(page.locator('#expense-chart')).toHaveCount(0);
  await page.unroute('**/api/stats?**');
  await action(page, 'refresh').click();
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
