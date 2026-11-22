import {test,expect,open,action,textAction,close} from './fixtures.js';
import {parseTextRecords} from '../../shared/text-records.js';
test.use({seed:'empty'});
const tile=(page,name)=>page.locator(`.platform-card[data-platform="${name}"]`);
async function create(ledger,raw){return (await ledger.call('/text-batches',{original_text:raw,items:parseTextRecords(raw,'2026-10-13').map(i=>({...i,category_id:'food'}))})).batch;}
async function confirm(ledger,b,id='item-1'){const p=await ledger.call(`/text-batches/${b.id}/preview`,{item_ids:[id]});return ledger.call(`/text-batches/${b.id}/confirm`,{version:b.version,preview_hash:p.preview_hash,item_ids:[id],acknowledge_duplicates:true});}
for(const width of [390,1440]){
 test(`CONT01 ${width} batch filters, search, pagination and empty state only change view`,async({page,ledger},info)=>{
  await page.setViewportSize({width,height:950});for(let i=0;i<10;i++)await create(ledger,`淘宝 · 合成历史${'甲乙丙丁戊己庚辛壬癸'[i]}0.01元`);
  const done=await create(ledger,'京东 · 合成已记0.02元');await confirm(ledger,done);const paused=await create(ledger,'抖音 · 合成暂停0.03元');await ledger.call(`/text-batches/${paused.id}/status`,{version:1,status:'paused'});
  await open(page);await action(page,'text-records').click();await expect(page.locator('.text-batch-row')).toHaveCount(8);await expect(page.locator('.batch-pagination')).toContainText('1 / 2');await expect(textAction(page,'library-prev')).toBeDisabled();
  await textAction(page,'library-next').click();await expect(page.locator('.text-batch-row')).toHaveCount(4);await expect(textAction(page,'library-next')).toBeDisabled();await textAction(page,'library-prev').click();await expect(page.locator('.text-batch-row')).toHaveCount(8);
  await page.locator('[data-text-action=library-status][data-status=done]').click();await expect(page.locator('.text-batch-row')).toHaveCount(1);await expect(page.locator('.text-batch-row')).toContainText('合成已记');
  await page.locator('[data-text-action=library-status][data-status=paused]').click();await expect(page.locator('.text-batch-row')).toContainText('合成暂停');
  await page.locator('[data-text-action=library-status][data-status=review]').click();await expect(page.locator('.batch-library .card-heading')).toContainText('10 批');
  await page.locator('[data-text-action=library-source][data-source=京东]').click();await expect(page.locator('.batch-library-empty')).toBeVisible();await page.locator('[data-text-action=library-source][data-source=""]').click();
  await page.locator('[name=batch-q]').fill('<不存在>');await page.locator('[name=batch-q]').press('Enter');await expect(page.locator('.batch-library-empty')).toBeVisible();await expect(page.locator('[name=batch-q]')).toHaveValue('<不存在>');await textAction(page,'library-clear').click();
  await page.locator('[name=batch-q]').fill('合成历史癸');await textAction(page,'library-search').click();await expect(page.locator('.text-batch-row')).toHaveCount(1);await expect(page.locator('.text-batch-row')).toContainText('合成历史癸');
  await close(page);await page.reload();await action(page,'text-records').click();await expect(page.locator('[name=batch-q]')).toHaveValue('合成历史癸');await expect(page.locator('.text-batch-row')).toHaveCount(1);
  await info.attach(`continuation-library-${width}`,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  await textAction(page,'open').click();await expect(page.locator('.text-candidate [data-field=title]')).toHaveValue('合成历史癸');expect((await ledger.call('/entries')).totals.count).toBe(1);expect((await ledger.call('/text-batches')).batches).toHaveLength(12);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`CONT02 ${width} saved anchors lead to exact next item and success continues same or another platform`,async({page,ledger},info)=>{
  await page.setViewportSize({width,height:950});const b=await create(ledger,'淘宝 · 合成最近0.01元；淘宝 · 合成更早0.02元');await confirm(ledger,b);
  await open(page);await tile(page,'淘宝').getByRole('button',{name:'再记一批',exact:true}).click();await expect(page.locator('.compose-continuation')).toContainText('合成最近');await expect(page.locator('.compose-continuation')).toContainText('下一项：合成更早');await page.locator('.compose-continuation [data-text-action=open]').click();await expect(page.locator('.text-candidate')).toHaveCount(1);await expect(page.locator('.text-candidate [data-field=title]')).toHaveValue('合成更早');
  await page.locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await expect(textAction(page,'new')).toContainText('继续淘宝');
  await info.attach(`continuation-success-${width}`,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  await textAction(page,'new').click();await expect(page.locator('#text-raw')).toHaveValue('');await expect(page.locator('.source-picker [data-source=淘宝]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.compose-continuation')).toContainText('合成更早');
  await close(page);if(width<768)await page.locator('.platform-tabs [data-source=京东]').click();await tile(page,'京东').getByRole('button',{name:'记录京东',exact:true}).click();await page.locator('#text-raw').fill('合成京东未解析0.03元');await close(page);
  if(width<768)await page.locator('.platform-tabs [data-source=淘宝]').click();await tile(page,'淘宝').getByRole('button',{name:'查看本批',exact:true}).click();await textAction(page,'new').click();
  await page.locator('#text-raw').fill('合成下一段0.04元');await textAction(page,'parse').click();await page.locator('[data-field=category_id]').selectOption('food');await page.locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await page.locator('[data-text-action=next-source][data-source=京东]').click();await expect(page.locator('#text-raw')).toHaveValue('合成京东未解析0.03元');await expect(page.locator('.source-picker [data-source=京东]')).toHaveAttribute('aria-pressed','true');expect((await ledger.call('/entries')).totals.count).toBe(3);
 });
 test(`CONT03 ${width} incomplete batch new action protects edits, save failure retains and retries without entry writes`,async({page,ledger})=>{
  await page.setViewportSize({width,height:950});await open(page);await action(page,'text-records').click();await page.locator('#text-raw').fill('合成保留候选0.01元');await textAction(page,'parse').click();await page.locator('[data-field=amount_minor]').fill('0.02');await textAction(page,'new').click();await expect(page.locator('.new-batch-prompt')).toContainText('不会提前入账');await textAction(page,'cancel-new').click();await expect(page.locator('[data-field=amount_minor]')).toHaveValue('0.02');
  await textAction(page,'new').click();await page.route('**/api/text-batches/*',route=>route.request().method()==='PATCH'?route.abort():route.continue());await page.route('**/api/operations/*',route=>route.abort());await textAction(page,'save-new').click();await expect(page.locator('#text-status')).toContainText('连接中断');await expect(page.locator('.text-candidate')).toHaveCount(1);await expect(page.locator('[data-field=amount_minor]')).toHaveValue('0.02');await page.unroute('**/api/text-batches/*');await page.unroute('**/api/operations/*');await textAction(page,'retry').click();await expect(page.locator('#text-status')).toContainText('草稿已保存');expect((await ledger.call('/entries')).totals.count).toBe(0);expect((await ledger.call('/text-batches')).batches[0].items[0].amount_minor).toBe(2);
  await textAction(page,'new').click();await expect(page.locator('#text-raw')).toHaveValue('');await expect(page.locator('.text-batch-row')).toHaveCount(1);await textAction(page,'open').click();await expect(page.locator('[data-field=amount_minor]')).toHaveValue('0.02');await textAction(page,'new').click();await expect(page.locator('.new-batch-prompt')).toHaveCount(0);await textAction(page,'open').click();await expect(page.locator('[data-field=amount_minor]')).toHaveValue('0.02');await expect(page.locator('#dialog')).toHaveAttribute('data-locked','false');await close(page);await page.reload();await action(page,'text-records').click();await expect(page.locator('[data-field=amount_minor]')).toHaveValue('0.02');expect((await ledger.call('/entries')).totals.count).toBe(0);
 });
}
test('CONT04 browsing another batch never loses an unparsed compose draft; old batch read failure stays visible',async({page,ledger})=>{
 const b=await create(ledger,'淘宝 · 合成历史位置0.01元');await open(page);await action(page,'text-records').click();await page.locator('#text-raw').fill('合成长段未核对文字0.02元');await textAction(page,'open').click();await page.locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await close(page);await action(page,'text-records').click();await expect(page.locator('#text-raw')).toHaveValue('合成长段未核对文字0.02元');await close(page);await page.reload();await action(page,'text-records').click();await expect(page.locator('#text-raw')).toHaveValue('合成长段未核对文字0.02元');
 await page.route(`**/api/text-batches/${b.id}`,route=>route.abort());await textAction(page,'open').click();await expect(page.locator('#text-status')).toContainText('暂时无法连接');await expect(page.locator('#text-raw')).toHaveValue('合成长段未核对文字0.02元');await page.unroute(`**/api/text-batches/${b.id}`);expect((await ledger.call('/entries')).totals.count).toBe(1);
});
for(const width of [390,1440])test(`CONT05 ${width} navigation pressed during async refresh completes once and retains keyboard focus`,async({page})=>{
 await page.setViewportSize({width,height:950});await open(page);let release,started;const barrier=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
 await page.route('**/api/text-batches?view=board',async route=>{started();await barrier;await route.continue();});
 const nav=width<768?'.mobile-nav':'.sidebar nav';await page.locator(`${nav} [data-route=settings]`).click();await ready;
 const target=page.locator(`${nav} [data-route=record]`),box=await target.boundingBox();await target.focus();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 // Install the observer before releasing the response, including on slower WebKit.
 await page.evaluate(()=>{window.acceptanceRendered=new Promise(resolve=>{const observer=new MutationObserver(()=>{observer.disconnect();resolve();});observer.observe(document.getElementById('app'),{childList:true});});});
 release();await page.evaluate(()=>window.acceptanceRendered);await page.mouse.up();await expect(page).toHaveURL(/\/record/);await expect(page.locator(`${nav} [data-route=record]`)).toHaveAttribute('aria-current','page');await page.unroute('**/api/text-batches?view=board');await expect(page.locator('.page-record')).toBeVisible();const keyboard=page.locator(`${nav} [data-route=stats]`);await keyboard.focus();await keyboard.press('Enter');await expect(page).toHaveURL(/\/stats/);await expect(keyboard).toHaveAttribute('aria-current','page');await expect(page.locator('.ranking-card')).toBeVisible();await expect(keyboard).toBeFocused();
});

test('CONT06 wide platform board shows four cards and opens confirmed items in place',async({page,ledger},info)=>{
 await page.setViewportSize({width:1920,height:1040});
 const taobao=await create(ledger,'淘宝 · 合成首件 1.25元；淘宝 · 合成尾件 2.50元');
 const p=await ledger.call(`/text-batches/${taobao.id}/preview`,{});
 await ledger.call(`/text-batches/${taobao.id}/confirm`,{version:taobao.version,preview_hash:p.preview_hash});
 const pdd=await create(ledger,'拼多多 · 合成商品 3.75元');
 await confirm(ledger,pdd);
 await open(page);
 const url=page.url(),grid=page.locator('.platform-grid'),draft=page.locator('.primary-text-card #text-raw');
 await draft.fill('尚未解析的合成草稿');
 expect(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);
 const first=await tile(page,'淘宝').boundingBox(),fourth=await tile(page,'拼多多').boundingBox();
 expect(fourth.y).toBe(first.y);
 const empty=await tile(page,'支付宝').boundingBox();
 expect(Math.abs(first.height-empty.height)).toBeLessThan(1);
 expect(Math.abs(first.height-fourth.height)).toBeLessThan(1);
 const viewButton=await tile(page,'淘宝').getByRole('button',{name:'查看本批'}).boundingBox();
 const recordButton=await tile(page,'支付宝').getByRole('button',{name:'记录支付宝'}).boundingBox();
 expect(Math.abs(viewButton.y+viewButton.height-recordButton.y-recordButton.height)).toBeLessThan(1);
 await expect(tile(page,'淘宝').locator('.platform-batch-meta')).toContainText('最近一批');
 await expect(tile(page,'淘宝')).not.toContainText(/合成首件|合成尾件|已记分类/);
 await info.attach('platform-board-wide',{body:await page.screenshot(),contentType:'image/png'});
 const batchButton=tile(page,'淘宝').getByRole('button',{name:'查看本批'});
 await batchButton.click();
 const dialog=page.locator('#dialog');
 const items=dialog.getByRole('region',{name:'已确认消费'});
 await expect(items.getByText('淘宝 · 合成首件')).toBeVisible();
 await expect(items.getByText(/1\.25/)).toBeVisible();
 await expect(items.getByText(/2\.50/)).toBeVisible();
 expect(page.url()).toBe(url);
 expect((await tile(page,'淘宝').boundingBox()).width).toBeCloseTo(first.width,0);
 await info.attach('platform-batch-overlay',{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(batchButton).toBeFocused();
 await tile(page,'拼多多').getByRole('button',{name:'查看本批'}).click();
 await expect(items.getByText('拼多多 · 合成商品')).toBeVisible();
 await expect(items.getByText(/3\.75/)).toBeVisible();
 await page.mouse.click(10,60);
 await expect(dialog).toBeHidden();
 await expect(draft).toHaveValue('尚未解析的合成草稿');
 expect(page.url()).toBe(url);
});
