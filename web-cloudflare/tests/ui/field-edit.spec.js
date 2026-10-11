import { test, expect, open, action, close } from './fixtures.js';

test.use({seed:'small'});
const visibleField = (page, id, field) => page.locator(`[data-action="entry"][data-id="${id}"][data-edit-field="${field}"]:visible`).first();
const save = async page => { await page.locator('#entry-form-dialog [type="submit"]').click(); await expect(page.locator('#dialog')).not.toBeVisible(); await expect(page.locator('#toast')).toContainText('修改已保存'); };
const unchanged = (actual, prior, changes) => { for (const k of ['type','amount_minor','category_id','occurred_on','note']) expect(actual[k], k).toBe(k in changes ? changes[k] : prior[k]); expect(actual.version).toBe(prior.version+1); };

for (const [route,width] of [['bills',1440],['stats',1440],['bills',360],['record',390]]) {
  test(`FIELD01 ${route} ${width}: one click edits all four fields, preserves other fields and survives refresh`, async ({ page, ledger }, testInfo) => {
    await page.setViewportSize({width,height:900});
    await open(page,route);
    const id='demo-lunch';
    let prior=(await ledger.call(`/entries/${id}`)).entry;
    await visibleField(page,id,'note').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改备注');
    await expect(page.locator('#note-dialog')).toBeFocused();
    await expect(page.locator('#amount-dialog')).toHaveCount(0);
    await page.locator('#note-dialog').fill('合成字段编辑 · <测试> & 保存');
    await page.locator('#dialog').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
    const panel=await page.locator('#dialog').boundingBox();
    if(width>=768)expect(panel.height,JSON.stringify(await page.locator('#dialog').evaluate(d=>({class:d.className,min:getComputedStyle(d).minHeight,height:getComputedStyle(d).height})))).toBeLessThan(520);
    else {
      for(const node of await page.locator('.summary-cards .summary-value').all())expect(await node.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    }
    await testInfo.attach(`field-edit-${route}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
    await save(page);
    let current=(await ledger.call(`/entries/${id}`)).entry;
    unchanged(current,prior,{note:'合成字段编辑 · <测试> & 保存'});prior=current;
    await visibleField(page,id,'category_id').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改分类');
    await expect(page.locator('#dialog [data-action="entry-category"][data-id="salary"]')).toHaveCount(0);
    await page.locator('#dialog [data-action="entry-category"][data-id="transport"]').click();
    await save(page);current=(await ledger.call(`/entries/${id}`)).entry;unchanged(current,prior,{category_id:'transport'});prior=current;
    await visibleField(page,id,'amount').click();
    await expect(page.locator('#amount-dialog')).toBeFocused();
    await page.locator('#amount-dialog').fill('41.01');await save(page);
    current=(await ledger.call(`/entries/${id}`)).entry;unchanged(current,prior,{amount_minor:4101});prior=current;
    await visibleField(page,id,'occurred_on').click();
    await expect(page.locator('#dialog-title')).toHaveText('修改日期');
    await page.locator('#dialog [name="date_precision"]').selectOption('month');
    await expect(page.locator('#dialog [name="occurred_on"]')).toHaveAttribute('type','month');
    await save(page);current=(await ledger.call(`/entries/${id}`)).entry;unchanged(current,prior,{occurred_on:'2026-09'});
    if(route==='record')await open(page,'bills');
    await page.reload();await page.waitForLoadState('networkidle');
    await expect(visibleField(page,id,'note')).toContainText('<测试>');
    await expect(visibleField(page,id,'category_id')).toContainText('交通');
    await expect(visibleField(page,id,'amount')).toContainText('41.01');
    await expect(visibleField(page,id,'occurred_on')).toContainText('2026年9月');
    expect((await ledger.call('/stats?from=2026-09-01&to=2026-09-30')).series.filter(x=>x.bucket==='2026-09').reduce((n,x)=>n+x.amount_minor,0)).toBe(4101);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);
  });
}

test('FIELD02 invalid amount stays beside save; cancel, Escape and keyboard editing preserve data', async ({page,ledger})=>{
  await open(page,'bills');const prior=(await ledger.call('/entries/demo-lunch')).entry;
  const opener=visibleField(page,'demo-lunch','amount');await opener.focus();await page.keyboard.press('Enter');
  await page.locator('#amount-dialog').fill('12.345');await page.locator('#entry-form-dialog [type="submit"]').click();
  await expect(page.locator('#entry-error-dialog')).not.toBeEmpty();expect((await ledger.call('/entries/demo-lunch')).entry).toEqual(prior);
  const error=await page.locator('#entry-error-dialog').boundingBox(),button=await page.locator('#entry-form-dialog [type="submit"]').boundingBox();expect(button.y-error.y).toBeLessThan(160);
  await page.keyboard.press('Escape');await expect(page.locator('#dialog')).toContainText('放弃修改');await action(page,'discard-editing').click();
  await expect(opener).toBeFocused();
  await opener.click();await close(page);expect((await ledger.call('/entries/demo-lunch')).entry).toEqual(prior);
  await visibleField(page,'demo-lunch','note').click();await page.locator('#note-dialog').fill('');await save(page);
  unchanged((await ledger.call('/entries/demo-lunch')).entry,prior,{note:''});await expect(visibleField(page,'demo-lunch','note')).toContainText('添加备注');
});

test('FIELD03 concurrent conflict reload keeps selected field; latest values and category remain intact',async({page,ledger})=>{
  await open(page,'bills');await visibleField(page,'demo-lunch','note').click();const prior=(await ledger.call('/entries/demo-lunch')).entry;
  await ledger.call('/entries/demo-lunch',{type:prior.type,amount_minor:4801,category_id:'shopping',occurred_on:'2026-09',note:'合成其他设备',version:prior.version},'PATCH');
  await page.locator('#note-dialog').fill('合成过期编辑');await page.locator('#entry-form-dialog [type="submit"]').click();await expect(action(page,'reload-entry')).toBeVisible();
  await action(page,'reload-entry').click();await expect(page.locator('#dialog-title')).toHaveText('修改备注');await expect(page.locator('#note-dialog')).toHaveValue('合成其他设备');
  await page.locator('#note-dialog').fill('合成重新编辑');await save(page);const current=(await ledger.call('/entries/demo-lunch')).entry;
  expect([current.amount_minor,current.category_id,current.occurred_on,current.note]).toEqual([4801,'shopping','2026-09','合成重新编辑']);
});

test('FIELD04 response lost after cloud write retries same operation once; double click saves once',async({page,ledger})=>{
  await open(page,'bills');await visibleField(page,'demo-lunch','amount').click();const before=(await ledger.call('/entries/demo-lunch')).entry;
  // Also lose the operation readback; otherwise the app correctly verifies and closes automatically.
  await page.route('**/api/operations/*',route=>route.abort('failed'));
  await page.route('**/api/entries/demo-lunch',async route=>{if(route.request().method()==='PATCH'){await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('#amount-dialog').fill('42.01');await page.locator('#entry-form-dialog [type="submit"]').click();await expect(page.locator('#entry-error-dialog')).not.toBeEmpty();
  await expect(page.locator('#amount-dialog')).toHaveValue('42.01');await expect(page.locator('#amount-dialog')).toBeDisabled();
  expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(before.version+1);
  await page.unroute('**/api/entries/demo-lunch');await page.unroute('**/api/operations/*');await save(page);
  expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(before.version+1);
  await visibleField(page,'demo-lunch','amount').click();await page.locator('#amount-dialog').fill('43.01');
  await page.route('**/api/entries/demo-lunch',async route=>{if(route.request().method()==='PATCH')await new Promise(r=>setTimeout(r,400));await route.continue();});
  await page.locator('#entry-form-dialog [type="submit"]').evaluate(button=>{button.click();button.click();});
  await expect(page.locator('#dialog')).not.toBeVisible();expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(before.version+2);
});

test('FIELD05 cross-month edit changes filtered list and statistics; month to day requires an explicit day',async({page,ledger})=>{
  await open(page,'bills');await visibleField(page,'demo-lunch','occurred_on').click();await page.locator('#dialog [name="date_precision"]').selectOption('month');await page.locator('#dialog [name="occurred_on"]').fill('2026-08');await save(page);
  await expect(visibleField(page,'demo-lunch','note')).toHaveCount(0);expect((await ledger.call('/stats?from=2026-08-01&to=2026-08-31')).totals.expense_minor).toBe(3500);
  await open(page,'bills','month=2026-08');await visibleField(page,'demo-lunch','occurred_on').click();await page.locator('#dialog [name="date_precision"]').selectOption('day');await expect(page.locator('#dialog [name="occurred_on"]')).toHaveValue('');
  await page.locator('#entry-form-dialog [type="submit"]').click();await expect(page.locator('#entry-error-dialog')).not.toBeEmpty();
  expect((await ledger.call('/entries/demo-lunch')).entry.occurred_on).toBe('2026-08');await page.locator('#dialog [name="occurred_on"]').fill('2026-08-15');await save(page);expect((await ledger.call('/entries/demo-lunch')).entry.occurred_on).toBe('2026-08-15');
});
