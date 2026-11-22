import { test, expect, open, action, close } from './fixtures.js';

test.use({ seed: 'small' });

const visibleField = (page, id, act) =>
  page.locator(`[data-entry-id="${id}"] [data-action="${act}"]:visible`).first();

async function outsideClick(page) {
  await expect(page.locator('#dialog')).toBeVisible();
  const box = await page.locator('#dialog').boundingBox();
  const pt = box.y > 1 ? { x: 20, y: box.y / 2 } : { x: Math.max(2, box.x - 20), y: 100 };
  if (page.viewportSize().width < 768) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
}

for (const width of [390, 1440]) {
  test(`FIELD_DISMISS_${width}: 1-click field edits preserve siblings; dirty dialog protects edits across outside taps`, async ({ page, ledger }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, 'bills');
    const id = 'demo-lunch';
    let prior = (await ledger.call(`/entries/${id}`)).entry;

    // 1. Direct note edit + save
    await visibleField(page, id, 'bill-edit-note').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改备注');
    await page.locator('#dialog [name="note"]').fill('字段编辑 · <保存测试>');
    await action(page, 'save-entry').click();
    await expect(page.locator('#dialog')).not.toBeVisible();
    let cur = (await ledger.call(`/entries/${id}`)).entry;
    expect(cur.note).toBe('字段编辑 · <保存测试>');
    expect(cur.amount_minor).toBe(prior.amount_minor);
    prior = cur;

    // 2. Direct amount edit + save
    await visibleField(page, id, 'bill-edit-amount').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改金额');
    await page.locator('#dialog [name="amount"]').fill('41.01');
    await action(page, 'save-entry').click();
    await expect(page.locator('#dialog')).not.toBeVisible();
    cur = (await ledger.call(`/entries/${id}`)).entry;
    expect(cur.amount_minor).toBe(4101);
    expect(cur.note).toBe(prior.note);
    prior = cur;

    // 3. Month-only switch + switching back to day requires explicit day
    await visibleField(page, id, 'bill-edit-date').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改日期');
    await page.locator('#dialog [name="date_precision"]').selectOption('month');
    await expect(page.locator('#dialog [name="occurred_on"]')).toHaveAttribute('type', 'month');
    await action(page, 'save-entry').click();
    await expect(page.locator('#dialog')).not.toBeVisible();
    cur = (await ledger.call(`/entries/${id}`)).entry;
    expect(cur.occurred_on).toBe('2026-09');

    await visibleField(page, id, 'bill-edit-date').click();
    await page.locator('#dialog [name="date_precision"]').selectOption('day');
    await expect(page.locator('#dialog [name="occurred_on"]')).toHaveValue('');
    await page.locator('#dialog [name="occurred_on"]').fill('2026-09-14');
    await action(page, 'save-entry').click();
    await expect(page.locator('#dialog')).not.toBeVisible();
    expect((await ledger.call(`/entries/${id}`)).entry.occurred_on).toBe('2026-09-14');

    // 4. Clean close returns focus & writes nothing; dirty outside tap opens discard guard and backdrop does not discard
    const opener = visibleField(page, id, 'bill-edit-note');
    await opener.click();
    await outsideClick(page);
    await expect(page.locator('#dialog')).not.toBeVisible();
    await expect(opener).toBeFocused();

    await opener.click();
    await page.locator('#dialog [name="note"]').fill('未保存保护测试');
    await outsideClick(page);
    await expect(page.locator('#dialog-title')).toHaveText('放弃修改？');
    await outsideClick(page);
    // Outside tap while on discard guard returns to editing rather than losing input
    await expect(page.locator('#dialog-title')).toHaveText('修改备注');
    await expect(page.locator('#dialog [name="note"]')).toHaveValue('未保存保护测试');

    await page.keyboard.press('Escape');
    await expect(page.locator('#dialog-title')).toHaveText('放弃修改？');
    await action(page, 'discard-editing').click();
    await expect(page.locator('#dialog')).not.toBeVisible();
    await expect(opener).not.toContainText('未保存保护测试');
  });
}

test('FIELD_CONFLICT_RETRY: concurrent edit reloads latest; lost-response retries once cleanly', async ({ page, ledger }) => {
  await open(page, 'bills');
  await visibleField(page, 'demo-lunch', 'bill-edit-note').click();
  const prior = (await ledger.call('/entries/demo-lunch')).entry;
  await ledger.call(
    '/entries/demo-lunch',
    {
      type: prior.type,
      amount_minor: 4801,
      category_id: 'shopping',
      occurred_on: '2026-09',
      note: '远端并发修改',
      version: prior.version,
    },
    'PATCH'
  );
  await page.locator('#dialog [name="note"]').fill('过期编辑');
  await action(page, 'save-entry').click();
  await expect(action(page, 'reload-entry')).toBeVisible();
  await action(page, 'reload-entry').click();
  await expect(page.locator('#dialog [name="note"]')).toHaveValue('远端并发修改');
  await close(page);

  // Lost PATCH response locks inputs and retries once without duplicate version bumps
  await visibleField(page, 'demo-lunch', 'bill-edit-amount').click();
  const before = (await ledger.call('/entries/demo-lunch')).entry;
  await page.route('**/api/operations/*', route => route.abort('failed'));
  await page.route('**/api/entries/demo-lunch', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fetch();
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await page.locator('#dialog [name="amount"]').fill('52.10');
  await action(page, 'save-entry').click();
  await expect(page.locator('#dialog [data-action="save-entry"]')).toHaveText(/核对并重试/);
  await expect(page.locator('#dialog [name="amount"]')).toBeDisabled();
  expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(before.version + 1);
  await page.unroute('**/api/entries/demo-lunch');
  await page.unroute('**/api/operations/*');
  await action(page, 'save-entry').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(before.version + 1);
});

test('ENTRY_COPY: duplicate entry creates clean month-default draft and persists independent record', async ({ page, ledger }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'bills');
  await visibleField(page, 'demo-lunch', 'bill-open-detail').click();
  await action(page, 'duplicate-entry').click();
  await expect(page.locator('#dialog-title')).toHaveText('再记一笔');
  await action(page, 'save-entry').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await ledger.call('/entries?q=午餐')).entries.length).toBeGreaterThanOrEqual(2);
});
