import {test,expect,open,compose,close,textAction,action} from './fixtures.js';
test.use({seed:'empty'});
const card=page=>page.locator('.text-candidate').first();
async function alias(ledger,name='合成孩子',aliases=['小禾']){
 const category=(await ledger.call('/categories',{name,type:'expense',color_key:'teal',icon:'wallet',aliases})).category;return category;
}
for(const width of [390,1440])test(`CAT01 ${width}px one-click recommendation survives draft reload and saves exact entry`,async({page,ledger},info)=>{
 await page.setViewportSize({width,height:width<768?844:1000});const category=await alias(ledger);await open(page);await compose(page,'绘本58元 分类小禾');
 await expect(card(page).locator('.category-suggestion')).toContainText('归到哪里');await expect(card(page).locator('[data-field=category_id]')).toHaveValue('');
 await card(page).locator('.confirm-one').click();await expect(card(page).locator('.candidate-feedback')).toContainText('请选择');expect((await ledger.call('/entries')).totals.count).toBe(0);
 await card(page).getByRole('button',{name:/归到 合成孩子/}).click();await expect(card(page).locator('[data-field=category_id]')).toHaveValue(category.id);await expect(card(page).locator('.category-choice[aria-pressed=true]')).toContainText('合成孩子');
 await expect(card(page).locator('.candidate-feedback')).toContainText('已选 合成孩子');expect((await ledger.call('/entries')).totals.count).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await info.attach(`category-choice-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 await textAction(page,'save').click();await expect(page.locator('#text-status')).toContainText('草稿已保存');const batch=(await ledger.call('/text-batches')).batches[0];
 await expect(card(page).locator('.confirm-one')).toBeEnabled();await close(page);await page.reload();await page.waitForLoadState('networkidle');await page.locator(`.batch-history-row[data-batch-id="${batch.id}"]`).click();
 await expect(card(page).locator('[data-field=category_id]')).toHaveValue(category.id);await card(page).locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();
 const entries=(await ledger.call('/entries')).entries;expect(entries).toHaveLength(1);expect(entries[0].category_id).toBe(category.id);expect(entries[0].amount_minor).toBe(5800);expect(entries[0].occurred_on).toHaveLength(7);
 expect((await ledger.call('/backup')).version).toBe(4);
});
test('CAT02 creating an alternative is one click; existing explicit name wins on the next batch',async({page,ledger})=>{
 await alias(ledger);await open(page);await compose(page,'绘本58元 分类小禾');await card(page).getByRole('button',{name:'新建 小禾'}).click();
 await expect(page.locator('#text-status')).toContainText('分类已新建');const cats=(await ledger.call('/categories')).categories;const created=cats.find(c=>c.name==='小禾');expect(cats.filter(c=>c.name==='小禾')).toHaveLength(1);
 await expect(card(page).locator('[data-field=category_id]')).toHaveValue(created.id);expect((await ledger.call('/entries')).totals.count).toBe(0);
 await card(page).locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await textAction(page,'new').click();await page.locator('#text-raw').fill('文具16元 分类小禾');await textAction(page,'parse').click();
 await expect(card(page).locator('[data-field=category_id]')).toHaveValue(created.id);await expect(card(page).locator('.category-suggestion')).toHaveCount(0);expect((await ledger.call('/entries')).totals.count).toBe(1);
});
test('CAT03 ambiguous aliases show both choices and keyboard selection works; manual override stays available',async({page,ledger})=>{
 await alias(ledger);const family=await alias(ledger,'合成家庭');await open(page);await compose(page,'文具16元 分类小禾');
 await expect(card(page).locator('.recommended')).toHaveCount(2);const choice=card(page).getByRole('button',{name:/归到 合成家庭/});await choice.focus();await page.keyboard.press('Enter');
 await expect(card(page).locator('[data-field=category_id]')).toHaveValue(family.id);await expect(card(page).getByRole('button',{name:/归到 合成家庭/})).toBeFocused();
 await card(page).locator('[data-field=category_id]').selectOption('transport');await expect(card(page).locator('.candidate-feedback')).toContainText('已选 交通');await card(page).locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();expect((await ledger.call('/entries')).entries[0].category_id).toBe('transport');
});
test('CAT04 interrupted category creation retains the same submission, retries without duplicating or saving entry',async({page,ledger})=>{
 await alias(ledger);await open(page);await compose(page,'绘本58元 分类小禾');let firstKey;
 await page.route('**/api/categories/resolve',async route=>{firstKey=route.request().headers()['idempotency-key'];await route.abort('failed');});await card(page).getByRole('button',{name:'新建 小禾'}).click();
 await expect(textAction(page,'retry')).toBeVisible();await expect(card(page).locator('.candidate-feedback')).toContainText('连接中断');expect((await ledger.call('/categories')).categories.filter(c=>c.name==='小禾')).toHaveLength(0);
 await page.unroute('**/api/categories/resolve');const request=page.waitForRequest(r=>r.url().endsWith('/api/categories/resolve'));await textAction(page,'retry').click();expect((await request).headers()['idempotency-key']).toBe(firstKey);
 await expect(page.locator('#text-status')).toContainText('分类已新建');expect((await ledger.call('/categories')).categories.filter(c=>c.name==='小禾')).toHaveLength(1);expect((await ledger.call('/entries')).totals.count).toBe(0);
});
test('CAT05 same-name creation by another device is reused; unavailable and archived choices fail near confirmation',async({page,ledger})=>{
 await alias(ledger);await open(page);await compose(page,'绘本58元 分类小禾');const real=(await ledger.call('/categories/resolve',{name:'小禾',type:'expense'})).category;
 await card(page).getByRole('button',{name:'新建 小禾'}).click();await expect(page.locator('#text-status')).toContainText('已有分类');await expect(card(page).locator('[data-field=category_id]')).toHaveValue(real.id);expect((await ledger.call('/categories')).categories.filter(c=>c.name==='小禾')).toHaveLength(1);
 await textAction(page,'new').click();await expect(page.locator('.new-batch-prompt')).toBeVisible();await textAction(page,'save-new').click();expect((await ledger.call('/entries')).totals.count).toBe(0);await page.locator('#text-raw').fill('文具16元 分类未知类别');await textAction(page,'parse').click();
 await page.route('**/api/categories/resolve',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{code:'CATEGORY_LIMIT',message:'分类已达上限，请选择已有分类'}})}));await card(page).getByRole('button',{name:'新建 未知类别'}).click();
 await expect(card(page).locator('.candidate-feedback')).toContainText('分类已达上限');await expect(card(page).locator('[data-field=category_id]')).toHaveValue('');expect((await ledger.call('/entries')).totals.count).toBe(0);
 await page.unroute('**/api/categories/resolve');const archived=(await ledger.call('/categories/resolve',{name:'未知类别',type:'expense'})).category;await ledger.call(`/categories/${archived.id}`,{name:archived.name,type:archived.type,color_key:archived.color_key,icon:archived.icon,version:1,archived:true},'PATCH');await card(page).getByRole('button',{name:'新建 未知类别'}).click();await expect(card(page).locator('.candidate-feedback')).toContainText('已停用');expect((await ledger.call('/entries')).totals.count).toBe(0);
});
test('CAT06 category management stores, edits and removes private aliases without changing ledger entries',async({page,ledger})=>{
 const cat=await alias(ledger);await open(page,'settings');await action(page,'categories').click();await page.locator(`[data-action=edit-category][data-id="${cat.id}"]`).click();
 await expect(page.locator('input[name=aliases]')).toHaveValue('小禾');await page.locator('input[name=aliases]').fill('小禾，合成家人');await page.locator('[data-form=category] button[type=submit]').click();await expect(page.locator('[data-action=new-category]')).toBeVisible();
 expect((await ledger.call('/categories')).categories.find(c=>c.id===cat.id).aliases).toEqual(['小禾','合成家人']);await page.locator(`[data-action=edit-category][data-id="${cat.id}"]`).click();await page.locator('input[name=aliases]').fill('');await page.locator('[data-form=category] button[type=submit]').click();await expect(page.locator('[data-action=new-category]')).toBeVisible();expect((await ledger.call('/categories')).categories.find(c=>c.id===cat.id).aliases).toBeUndefined();expect((await ledger.call('/entries')).totals.count).toBe(0);
});

test('CAT07 lost response after category creation reads the original result and never duplicates',async({page,ledger})=>{
 await alias(ledger);await open(page);await compose(page,'绘本58元 分类小禾');let writes=0;
 await page.route('**/api/categories/resolve',async route=>{writes++;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});await card(page).getByRole('button',{name:'新建 小禾'}).click();
 await expect(page.locator('#text-status')).toContainText('分类已新建');expect(writes).toBe(1);expect((await ledger.call('/categories')).categories.filter(c=>c.name==='小禾')).toHaveLength(1);expect((await ledger.call('/entries')).totals.count).toBe(0);
});
