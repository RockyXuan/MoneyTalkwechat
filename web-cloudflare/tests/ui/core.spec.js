import { test, expect, open, action, close, write, downloadText } from './fixtures.js';

test('NAV01–06 four routes, history, deep links, resize and defaults', async ({ page }) => {
  await open(page);
  for (const route of ['bills', 'stats', 'settings', 'record']) {
    await page.locator(`.mobile-nav [data-route="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${route}`));
    await expect(page.locator(`#main.page-${route}`)).toBeVisible();
  }
  await page.goBack();
  await expect(page.locator('.page-settings')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.page-record')).toBeVisible();
  await open(page, 'bills');
  await page.reload();
  await expect(page).toHaveURL(/bills\?month=2026-09/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.page-bills')).toBeVisible();
  await page.locator('.sidebar nav [data-route="stats"]').click();
  await expect(page.locator('.quick-entry')).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/stats/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/record/);
});

test('REC01–08 chips, independent income, draft refresh, real save and receipt', async ({ page, ledger }) => {
  await open(page);
  await action(page, 'expand-categories').click();
  await expect(page.locator('.category-chips.expanded')).toBeVisible();
  await page.locator('[data-action="entry-category"][data-id="other"]').click();
  await action(page, 'expand-categories').click();
  await expect(page.locator('[data-id="other"].chip')).toBeVisible();
  await page.locator('[data-action="entry-type"][data-value="income"]').click();
  await expect(page.locator('[data-id="salary"].chip')).toBeVisible();
  await expect(page.locator('[data-id="food"].chip')).toHaveCount(0);
  await page.locator('#amount-main').fill('1,234.56');
  await page.locator('#note-main').fill('收入测试');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#amount-main')).toHaveValue('1,234.56');
  await write(page, { amount: '1,234.56', note: '收入测试', date: '2026-08-31' });
  await expect(page.locator('.save-receipt')).toContainText('2026-08-31');
  await expect(page.locator('.save-receipt')).toContainText('1 笔');
  const rows = (await ledger.call('/entries?q=收入测试')).entries;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ amount_minor: 123456, type: 'income', category_id: 'salary' });
  await action(page, 'view-receipt').click();
  await expect(page.locator('.mobile-bills')).toContainText('收入测试');
  await page.reload();
  await expect(page.locator('.mobile-bills')).toContainText('收入测试');
});

test('REC09–10 invalid amounts and future date never write or silently truncate', async ({ page, ledger }) => {
  await open(page);
  for (const amount of ['', '0', '-1', '1.234', '100000000', 'abc', '1,23']) {
    await write(page, { amount });
    await expect(page.locator('#entry-error-main')).not.toBeEmpty();
    await expect(page.locator('#amount-main')).toHaveValue(amount);
  }
  await write(page, { date: '2099-01-01' });
  await expect(page.locator('#entry-error-main')).toContainText('今天');
  expect((await ledger.call('/entries')).totals.count).toBe(61);
});

test('REC11–14 double click, interrupted response, retry and server readback', async ({ page, ledger }) => {
  await open(page);
  let writes = 0;
  await page.route('**/api/entries', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('failed'); // server wrote, browser did not receive its response
  });
  await page.locator('#amount-main').fill('0.01');
  await page.locator('#note-main').fill('失联响应');
  await page.locator('.record-tools button[type="submit"]').dblclick();
  await expect(page.locator('.save-receipt')).toContainText('已入账');
  expect(writes).toBe(1);
  expect((await ledger.call('/entries?q=失联响应')).entries).toHaveLength(1);
  await page.unroute('**/api/entries');
  await page.route('**/api/entries', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await write(page, { amount: '0.02', note: '未写入重试' });
  await expect(page.locator('#entry-error-main')).not.toBeEmpty();
  await expect(page.locator('#amount-main')).toHaveValue('0.02');
  await expect(page.locator('.record-tools')).toContainText('核对并重试');
  expect((await ledger.call('/entries?q=未写入重试')).entries).toHaveLength(0);
  await page.unroute('**/api/entries');
  await page.locator('.record-tools button[type="submit"]').click();
  await expect(page.locator('.save-receipt')).toContainText('已入账');
  expect((await ledger.call('/entries?q=未写入重试')).entries).toHaveLength(1);
});

test('EDIT01–03 details, dirty editing, keep, discard and save', async ({ page, ledger }) => {
  await open(page, 'bills');
  const entry = page.locator('.mobile-bills [data-action="entry"][data-id="demo-lunch"]');
  await entry.click();
  await expect(page.locator('#dialog')).toContainText('账单详情');
  await page.locator('#note-dialog').fill('未保存修改');
  await action(page, 'close-dialog', page.locator('#dialog')).click();
  await expect(page.locator('#dialog')).toContainText('放弃修改');
  await action(page, 'keep-editing').click();
  await expect(page.locator('#note-dialog')).toHaveValue('未保存修改');
  await page.keyboard.press('Escape');
  await action(page, 'discard-editing').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  await entry.click();
  await expect(page.locator('#note-dialog')).toHaveValue('午餐');
  await page.locator('#amount-dialog').fill('36.01');
  await page.locator('#entry-form-dialog button[type="submit"]').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await ledger.call('/entries/demo-lunch')).entry.amount_minor).toBe(3601);
  await page.reload();
  await expect(page.locator('.mobile-bills')).toContainText('36.01');
});

test('EDIT04–05 cancel delete, delete, undo, trash details and restore', async ({ page, ledger }) => {
  await open(page, 'bills');
  const entry = page.locator('.mobile-bills [data-id="demo-lunch"]');
  await entry.click();
  await action(page, 'delete-entry').click();
  await expect(page.locator('#dialog')).toContainText('35.00');
  await close(page);
  expect((await ledger.call('/entries/demo-lunch')).entry.deleted_at).toBeNull();
  await entry.click();
  await action(page, 'delete-entry').click();
  await action(page, 'confirm-delete').click();
  await expect(entry).toHaveCount(0);
  await action(page, 'undo-toast').click();
  await expect(entry).toBeVisible();
  await entry.click();
  await action(page, 'delete-entry').click();
  await action(page, 'confirm-delete').click();
  await expect(entry).toHaveCount(0);
  await page.locator('.mobile-nav [data-route="settings"]').click();
  await action(page, 'trash').click();
  await page.locator('.trash-list [data-action="entry"][data-id="demo-lunch"]').click();
  await expect(page.locator('#dialog')).toContainText('已删除的记录');
  await action(page, 'restore-entry').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await ledger.call('/entries/demo-lunch')).entry.deleted_at).toBeNull();
});

test('EDIT06–07 concurrent edit reports conflict, explicit reload gets latest', async ({ page, ledger }) => {
  await open(page, 'bills');
  await page.locator('.mobile-bills [data-id="demo-lunch"]').click();
  const old = (await ledger.call('/entries/demo-lunch')).entry;
  await ledger.call('/entries/demo-lunch', { type: old.type, amount_minor: 4000, category_id: old.category_id, occurred_on: old.occurred_on, note: '第二台设备', version: old.version }, 'PATCH');
  await page.locator('#note-dialog').fill('第一台设备');
  await page.locator('#entry-form-dialog button[type="submit"]').click();
  await expect(page.locator('#entry-error-dialog')).not.toBeEmpty();
  await expect(action(page, 'reload-entry')).toBeVisible();
  expect((await ledger.call('/entries/demo-lunch')).entry.note).toBe('第二台设备');
  await action(page, 'reload-entry').click();
  await expect(page.locator('#note-dialog')).toHaveValue('第二台设备');
  await expect(page.locator('#amount-dialog')).toHaveValue('40.00');
});

test('BILL01–07 months, range validation, filter/clear, pagination and backdate', async ({ page }) => {
  await open(page, 'bills');
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await action(page, 'page-next').click();
  await expect(page.locator('.pagination')).toContainText('第 2 / 2');
  await expect(action(page, 'page-next')).toBeDisabled();
  await action(page, 'page-prev').click();
  await expect(page.locator('.pagination')).toContainText('第 1 / 2');
  await action(page, 'previous-month').click();
  await expect(page.locator('.filter-summary')).toContainText('共 0 笔');
  await action(page, 'next-month').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await action(page, 'filters').click();
  await page.locator('#dialog [name="from"]').fill('2026-09-30');
  await page.locator('#dialog [name="to"]').fill('2026-09-01');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.locator('#filters-error')).toContainText('不能晚于');
  await page.locator('#dialog [name="from"]').fill('2026-09-01');
  await page.locator('#dialog [name="to"]').fill('2026-09-30');
  await page.locator('#dialog [name="q"]').fill('午餐');
  await page.locator('#dialog [name="type"]').selectOption('expense');
  await page.locator('#dialog [name="category_id"]').selectOption('food');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await expect(page.locator('.mobile-bills')).toContainText('午餐');
  await action(page, 'clear-filters').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await action(page, 'backdate').click();
  await expect(page).toHaveURL(/\/record/);
  await expect(page.locator('#entry-form-main [name="occurred_on"]')).toHaveValue('2026-09-14');
});

test('BILL08 desktop search/type and exact filtered vs full CSV', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, 'bills');
  await page.locator('[data-action="filter-type"][data-value="income"]').click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await page.locator('[data-action="filter-type"][data-value=""]').click();
  await page.getByRole('textbox', { name: '搜索备注、分类或金额' }).fill('午餐');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  const filtered = await downloadText(page, action(page, 'export-filter'));
  expect(filtered).toContain('午餐');
  expect(filtered).not.toContain('工资');
  expect(filtered.trim().split('\r\n')).toHaveLength(2);
  await page.locator('.sidebar [data-route="settings"]').click();
  const all = await downloadText(page, action(page, 'export-all'));
  expect(all.trim().split('\r\n')).toHaveLength(62);
});

test('BILL09 mobile filtered export, reload/back consistency and clear date range', async ({ page }) => {
  await open(page, 'bills');
  await action(page, 'filters').click();
  await page.locator('#dialog [name="q"]').fill('午餐');
  await page.locator('#dialog [name="category_id"]').selectOption('food');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await page.reload();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await page.locator('.mobile-nav [data-route="settings"]').click();
  await page.goBack();
  await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  await action(page, 'filters').click();
  const csv = await downloadText(page, action(page, 'export-filter', page.locator('#dialog')));
  expect(csv.trim().split('\r\n')).toHaveLength(2);
  await close(page);
  await action(page, 'clear-filters').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await open(page, 'bills', 'month=2026-09&from=2026-09-14&to=2026-09-14');
  await expect(page.locator('.filter-summary')).toContainText('共 2 笔');
  await action(page, 'clear-filters').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
});

test('REC15 desktop quick entry, drawer and recent-table links', async ({ page, ledger }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, 'stats');
  await page.locator('#amount-quick').fill('0.03');
  await page.locator('#note-quick').fill('桌面快捷虚构');
  await page.locator('#entry-form-quick button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('已入账');
  expect((await ledger.call('/entries?q=桌面快捷虚构')).entries).toHaveLength(1);
  await page.locator('.desktop-recent [data-route="bills"]').click();
  await expect(page.locator('.page-bills')).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 1000 });
  await action(page, 'new-entry').click();
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('#amount-dialog').fill('0.04');
  await page.locator('#note-dialog').fill('桌面抽屉虚构');
  await page.locator('#entry-form-dialog button[type="submit"]').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await ledger.call('/entries?q=桌面抽屉虚构')).entries).toHaveLength(1);
});

test('STAT01–05 all periods and charts use identical totals, preference and drilldown', async ({ page }) => {
  await open(page, 'stats');
  await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label', /3,248.00/);
  await action(page, 'stats-options').click();
  for (const period of ['quarter', 'year', 'month']) {
    await page.locator(`#dialog [data-action="period"][data-value="${period}"]`).click();
    await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label', /3,248.00/);
    await expect(page.locator(`#dialog [data-value="${period}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  for (const chart of ['line', 'pie', 'bar']) {
    await page.locator(`#dialog [data-action="chart"][data-value="${chart}"]`).click();
    await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label', /3,248.00/);
    await expect(page.locator(`#dialog [data-value="${chart}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#dialog [data-action="chart"][data-value="pie"]').click();
  await close(page);
  await expect(page.locator('.chart-card h2')).toContainText('支出分布');
  await page.reload();
  await expect(page.locator('.chart-card h2')).toContainText('支出分布');
  await page.locator('.chart-data summary').click();
  await expect(page.locator('.chart-data table')).toBeVisible();
  await page.locator('.ranking-row[data-id="food"]').click();
  await expect(page).toHaveURL(/\/bills/);
  await expect(page.locator('.filter-summary')).toContainText('餐饮');
  await expect(page.locator('.summary-card.expense')).toContainText('1,240.00');
});

test('STAT06 legend drilldown, prior/next year and date picker', async ({ page }) => {
  await open(page, 'stats');
  await action(page, 'stats-options').click();
  await page.locator('#dialog [data-value="year"]').click();
  await close(page);
  await action(page, 'previous-month').click();
  await expect(page).toHaveURL(/month=2025-09/);
  await expect(page.locator('#expense-chart')).toHaveCount(0);
  await action(page, 'next-month').click();
  await expect(page.locator('#expense-chart')).toBeVisible();
  await page.locator('.mobile-tools input[type="month"]').fill('2026-09');
  await page.locator('.chart-legend [data-id="shopping"]').click();
  await expect(page.locator('.filter-summary')).toContainText('购物');
});

test('SET01–03 category create, rename, stable color, archive and history', async ({ page, ledger }) => {
  await open(page, 'settings');
  await action(page, 'categories').click();
  await action(page, 'new-category').click();
  await page.locator('#dialog [name="name"]').fill('非常长的自定义分类名称测试');
  await page.locator('#dialog [name="color_key"][value="purple"]').check();
  await page.locator('#dialog [name="sort_order"]').fill('0');
  await page.getByRole('button', { name: '保存分类' }).click();
  await expect(page.locator('.category-manager')).toContainText('非常长的自定义分类名称测试');
  const category = (await ledger.call('/categories')).categories.find(c => c.name === '非常长的自定义分类名称测试');
  expect(category.color_key).toBe('purple');
  await page.locator(`.manage-category[data-id="${category.id}"]`).click();
  await page.locator('#dialog [name="name"]').fill('新名字');
  await page.getByRole('button', { name: '保存分类' }).click();
  expect((await ledger.call('/categories')).categories.find(c => c.id === category.id).color_key).toBe('purple');
  await page.locator('.manage-category[data-id="food"]').click();
  await page.locator('#dialog [name="archived"]').check();
  await page.getByRole('button', { name: '保存分类' }).click();
  await expect(page.locator('.manage-category[data-id="food"]')).toContainText('已停用');
  await close(page);
  await open(page);
  await expect(page.locator('.chip[data-id="food"]')).toHaveCount(0);
  await open(page, 'stats');
  await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label', /3,248.00/);
});

test('SET04–08 JSON download, display persistence, logout cancel/confirm/reopen', async ({ page, ledger }) => {
  await open(page, 'settings');
  await action(page, 'display').click();
  await page.locator('#dialog [name="chart"]').selectOption('line');
  await page.locator('#dialog [name="density"]').selectOption('compact');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/compact/);
  await action(page, 'display').click();
  await expect(page.locator('#dialog [name="chart"]')).toHaveValue('line');
  await close(page);
  await action(page, 'backup').click();
  const backup = JSON.parse(await downloadText(page, action(page, 'download-backup')));
  expect(backup.entries).toHaveLength(61);
  expect(backup.ledger.name).toBe(ledger.backup.ledger.name);
  await close(page);
  await open(page);
  await page.locator('#amount-main').fill('99.88');
  await page.locator('.mobile-nav [data-route="settings"]').click();
  await action(page, 'logout').click();
  await close(page);
  await expect(page.locator('.profile-card')).toBeVisible();
  await action(page, 'logout').click();
  await action(page, 'confirm-logout').click();
  await expect(page.locator('.boot-state')).toContainText('已退出本地预览');
  await action(page, 'login').click();
  await page.waitForLoadState('networkidle');
  await page.locator('.mobile-nav [data-route="record"]').click();
  await expect(page.locator('#amount-main')).toHaveValue('');
  expect((await ledger.call('/entries')).totals.count).toBe(61);
});

test('BACK01–05 invalid files, preview, independent restore, activation and repeat', async ({ page, ledger }) => {
  await open(page, 'settings');
  await action(page, 'backup').click();
  const upload = page.locator('#backup-file');
  const before = (await ledger.call('/session')).ledger.id;
  await upload.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#backup-preview')).toContainText('无法');
  const backup = structuredClone(ledger.backup);
  backup.ledger.name = 'UI候选恢复测试';
  backup.entries = backup.entries.slice(0, 2);
  await upload.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(action(page, 'start-restore')).toBeVisible();
  expect((await ledger.call('/session')).ledger.id).toBe(before);
  await action(page, 'start-restore').click();
  await expect(action(page, 'activate-ledger')).toBeVisible();
  expect((await ledger.call('/session')).ledger.id).toBe(before);
  const candidate = await action(page, 'activate-ledger').getAttribute('data-id');
  await action(page, 'activate-ledger').click();
  await expect(page.locator('.profile-card')).toContainText('UI候选恢复测试');
  await action(page, 'backup').click();
  await page.locator('#backup-file').setInputFiles({ name: 'repeat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await action(page, 'start-restore').click();
  await expect(page.locator('#restore-progress')).toContainText('同一备份');
  await expect(action(page, 'activate-ledger')).toHaveAttribute('data-id', candidate);
  await close(page);
  await action(page, 'ledgers').click();
  await page.locator(`#dialog [data-action="activate-ledger"][data-id="${before}"]`).click();
  await expect(page.locator('.profile-card')).toContainText(ledger.backup.ledger.name);
});

test('ERR01–04 initial and statistics failure with honest state and retry', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ status: 503, json: { error: { message: '模拟身份服务故障', code: 'TEST' } } }));
  await page.goto('/stats?month=2026-09');
  await expect(page.locator('.boot-state')).toContainText('模拟身份服务故障');
  await page.unroute('**/api/session');
  await action(page, 'login').click();
  await expect(page.locator('#expense-chart')).toBeVisible();
  await page.route('**/api/stats?**', route => route.fulfill({ status: 500, json: { error: { message: '模拟统计故障', code: 'TEST' } } }));
  await action(page, 'previous-month').click();
  await expect(page.locator('.error-panel')).toContainText('模拟统计故障');
  await expect(page.locator('#expense-chart')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toHaveCount(0);
  await page.unroute('**/api/stats?**');
  await action(page, 'refresh').click();
  await expect(page.locator('.error-panel')).toHaveCount(0);
  await action(page, 'next-month').click();
  await expect(page.locator('#expense-chart')).toBeVisible();
});

test('UX01–05 bottom modal controls, Escape, focus and normal/reduced motion', async ({ page }) => {
  await open(page, 'settings');
  await action(page, 'display').click();
  await expect(page.locator('#dialog')).toBeVisible();
  const rect = await page.locator('#dialog').boundingBox();
  expect(rect.y + rect.height).toBeGreaterThan(820);
  expect(await page.locator('#dialog').evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.locator('#dialog')).not.toBeVisible();
  await expect(action(page, 'display')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await action(page, 'display').click();
  expect(await page.locator('#dialog').evaluate(el => parseFloat(getComputedStyle(el).animationDuration))).toBeLessThanOrEqual(0.01);
  await close(page);
  await expect(action(page, 'display')).toBeFocused();
});

test('UX06–08 rapid route changes retain correct page and loaded data', async ({ page }) => {
  await open(page);
  await page.route('**/api/stats?**', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue(); });
  await page.locator('.mobile-nav [data-route="stats"]').click();
  await page.locator('.mobile-nav [data-route="bills"]').click();
  await expect(page.locator('.filter-summary')).toContainText('共 61 笔');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.page-bills')).toBeVisible();
  await expect(page.locator('#expense-chart')).toHaveCount(0);
});
