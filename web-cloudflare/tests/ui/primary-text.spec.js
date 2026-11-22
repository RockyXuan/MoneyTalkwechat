import {test,expect,open} from './fixtures.js';
test.use({seed:'empty'});
test('INPUT01 main inline input caches each edit offline, restores after refresh and saves cloud before confirmation',async({page,ledger})=>{
 await open(page);const input=page.locator('.primary-text-card #text-raw');await expect(input).toBeVisible();await expect(page.locator('.mobile-tools.record-tools')).toBeHidden();await expect(page.locator('#dialog')).not.toBeVisible();expect((await input.boundingBox()).height).toBeGreaterThan(200);
 const raw='午餐 35 元；神秘物品 18 元';await input.fill(raw);expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('moneytalk:input-cache:')&&JSON.parse(localStorage.getItem(k)).rawValue==='午餐 35 元；神秘物品 18 元'))).toBeTruthy();
 await page.context().setOffline(true);await input.fill(raw+'；咖啡 9 元');await page.context().setOffline(false);await page.reload();await expect(page.locator('.primary-text-card #text-raw')).toHaveValue(raw+'；咖啡 9 元');
 await page.getByRole('button',{name:'保存并解析',exact:true}).click();await expect(page.locator('.primary-text-card .text-candidate')).toHaveCount(3);await expect(page.locator('#dialog')).not.toBeVisible();const batches=(await ledger.call('/text-batches')).batches;expect(batches).toHaveLength(1);expect(batches[0].original_text).toBe(raw+'；咖啡 9 元');expect((await ledger.call('/entries')).totals.count).toBe(0);
 const unknown=page.locator('.text-candidate').filter({has:page.locator('[data-new-category]')});await expect(unknown.locator('.category-choice')).not.toHaveCount(0);await unknown.locator('[data-new-category]').fill('合成杂项');await unknown.locator('[data-text-action=create-custom-category]').click();await expect(unknown.locator('[data-field=category_id]')).toHaveValue(/.+/);await expect(page.locator('#text-status')).toContainText('新建');
 await page.locator('.primary-text-card .confirm-one').first().click();await expect(page.locator('.primary-text-card .text-candidate')).toHaveCount(2);expect((await ledger.call('/entries')).totals.count).toBe(1);await page.reload();await expect(page.locator('.primary-text-card .text-candidate')).toHaveCount(2);
});
test('INPUT02 lost cloud response is retryable; input survives local session loss without duplicate batch',async({page,ledger})=>{
 await open(page);await page.locator('.primary-text-card #text-raw').fill('午餐 12 元');await page.evaluate(()=>sessionStorage.clear());await page.reload();await expect(page.locator('.primary-text-card #text-raw')).toHaveValue('午餐 12 元');
 await page.route('**/api/operations/*',route=>route.abort());let once=true;await page.route('**/api/text-batches',async route=>{if(route.request().method()==='POST'&&once){once=false;await route.fetch();await route.abort();}else await route.continue();});await page.getByRole('button',{name:'保存并解析',exact:true}).click();await expect(page.locator('.primary-text-card [data-text-action=retry]')).toBeVisible();await page.reload();await page.unroute('**/api/operations/*');await page.locator('.primary-text-card [data-text-action=retry]').click();await expect(page.locator('.primary-text-card .text-candidate')).toHaveCount(1);expect((await ledger.call('/text-batches')).batches).toHaveLength(1);expect((await ledger.call('/entries')).totals.count).toBe(0);
 await page.locator('.primary-text-card .confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await page.reload();await expect(page.locator('.primary-text-card #text-raw')).toHaveValue('');expect((await ledger.call('/entries')).totals.count).toBe(1);
});
test('INPUT03 explicit spoken category Other remains selected and is not treated as unknown',async({page,ledger})=>{
 await open(page);await page.locator('.primary-text-card #text-raw').fill('分类其他，从2025年11月开始，每月合成明确分类月卡0.04元，一直订阅');await page.getByRole('button',{name:'保存并解析',exact:true}).click();await expect(page.locator('.primary-text-card .text-candidate')).toHaveCount(1);await expect(page.locator('.primary-text-card [data-field=category_id]')).toHaveValue('other');await expect(page.locator('.primary-text-card [data-new-category]')).toHaveCount(0);await expect(page.locator('.primary-text-card [data-field=auto_record]')).toBeChecked();const batches=(await ledger.call('/text-batches')).batches;expect(batches[0].items[0].category_id).toBe('other');expect((await ledger.call('/entries')).totals.count).toBe(0);await page.reload();await expect(page.locator('.primary-text-card [data-field=category_id]')).toHaveValue('other');
});

test('record home puts input first on mobile and alongside progress on desktop', async ({page,ledger}, info) => {
  await open(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height:900});
    const editor = page.locator('.primary-text-card');
    const board = page.locator('.platform-board');
    const input = page.locator('#text-raw');
    await input.fill('虚构午餐 28 元');
    const a = await editor.boundingBox(), b = await board.boundingBox();
    if (width === 390) expect(a.y + a.height).toBeLessThanOrEqual(b.y + 1);
    else {
      expect(a.x + a.width).toBeLessThan(b.x);
      expect(Math.abs(a.y - b.y)).toBeLessThan(3);
    }
    await expect(input).toHaveValue('虚构午餐 28 元');
    await page.evaluate(() => {document.activeElement.blur(); window.scrollTo(0,0);});
    await info.attach('record-home-'+width,{body:await page.screenshot(),contentType:'image/png'});
  }
});

test('INPUT04 source headers are metadata and an unwanted draft can be deleted after partial confirmation',async({page,ledger})=>{
 await open(page);
 const editor=page.locator('.primary-text-card');
 await editor.locator('#text-raw').fill('记一下淘宝的账：\n• 虚构午餐：12 元\n• 示例多报项：3 元\n食物类：\n• 示例米饼：5 元');
 await editor.getByRole('button',{name:'保存并解析',exact:true}).click();
 await expect(editor.locator('.text-candidate')).toHaveCount(3);
 await expect(editor.locator('.batch-progress .source-badge')).toHaveText('淘宝');
 const first=editor.locator('[data-item-id=item-1]');
 await first.getByRole('textbox',{name:'名称',exact:true}).fill('合成午餐已校正');
 await first.locator('.confirm-one').click();
 await expect(editor.locator('.confirmed-items')).toContainText('合成午餐已校正');
 const unwanted=editor.locator('[data-item-id=item-2]');
 const askDelete=unwanted.getByRole('button',{name:/删除草稿项/});
 await askDelete.click();
 await unwanted.getByRole('button',{name:'保留',exact:true}).click();
 await expect(unwanted).toBeVisible();
 await askDelete.click();
 await unwanted.getByRole('button',{name:'确认删除',exact:true}).click();
 await expect(unwanted).toHaveCount(0);
 await page.reload();
 await expect(editor.locator('.text-candidate')).toHaveCount(1);
 await expect(editor.locator('.batch-progress')).toContainText('已确认 1 / 2 项');
 const {batches}=await ledger.call('/text-batches');
 expect(batches[0].items.map(i=>i.id)).toEqual(['item-1','item-3']);
 expect((await ledger.call('/entries')).totals.count).toBe(1);
});
