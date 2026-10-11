import { test, expect, open, action, textAction } from './fixtures.js';
test.use({seed:'small'});
const field=(page,name)=>page.locator(`[data-id="demo-lunch"][data-edit-field="${name}"]:visible`).first();
const settled=page=>page.locator('#dialog').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
async function outside(page,{double=false}={}){
  await expect(page.locator('#dialog')).toBeVisible();await settled(page);
  const box=await page.locator('#dialog').boundingBox();
  const point=box.y>1?{x:20,y:box.y/2}:{x:Math.max(1,box.x-20),y:100};
  if(double)await page.mouse.dblclick(point.x,point.y);else if(page.viewportSize().width<768)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
}
for(const width of [390,1440]){
 test(`DISMISS01 ${width}: all unchanged fields close with outside click; focus returns; double-click does not activate background`,async({page,ledger})=>{
  await page.setViewportSize({width,height:900});await open(page,'bills');const prior=(await ledger.call('/entries/demo-lunch')).entry;
  for(const name of ['category_id','amount','note','occurred_on']){
   const opener=field(page,name);await opener.click();await outside(page,{double:true});await expect(page.locator('#dialog')).not.toBeVisible();await expect(opener).toBeFocused();
  }
  expect((await ledger.call('/entries/demo-lunch')).entry).toEqual(prior);
 });
 test(`DISMISS02 ${width}: original category, reverted note, equivalent amount and restored date close without discard warning`,async({page})=>{
  await page.setViewportSize({width,height:900});await open(page,'bills');
  await field(page,'category_id').click();await page.locator('#dialog [data-action="entry-category"][data-id="food"]').click();await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
  await field(page,'note').click();await page.locator('#note-dialog').fill('改了但还原');await page.locator('#note-dialog').fill('午餐');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
  await field(page,'amount').click();await page.locator('#amount-dialog').fill('35.0');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
  await field(page,'occurred_on').click();await page.locator('#dialog [name="date_precision"]').selectOption('month');await page.locator('#dialog [name="date_precision"]').selectOption('day');await page.locator('#dialog [name="occurred_on"]').fill('2026-09-14');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
 });
 test(`DISMISS03 ${width}: unsaved changes keep input, focus and scroll; backdrop cannot discard; explicit discard writes nothing`,async({page,ledger},testInfo)=>{
  await page.setViewportSize({width,height:900});await open(page,'bills');const prior=(await ledger.call('/entries/demo-lunch')).entry;
  await field(page,'note').click();await page.locator('#note-dialog').fill('合成未保存内容');await outside(page,{double:true});await expect(page.locator('#dialog-title')).toHaveText('放弃修改？');
  await outside(page);await expect(page.locator('#dialog-title')).toHaveText('放弃修改？');await action(page,'keep-editing').click();await expect(page.locator('#note-dialog')).toHaveValue('合成未保存内容');await expect(page.locator('#note-dialog')).toBeFocused();
  await outside(page);await settled(page);await testInfo.attach(`dismiss-protection-${width}`,{body:await page.screenshot(),contentType:'image/png'});
  await action(page,'discard-editing').click();await expect(page.locator('#dialog')).not.toBeVisible();expect((await ledger.call('/entries/demo-lunch')).entry).toEqual(prior);
 });
 test(`DISMISS04 ${width}: inside whitespace and dragging out do not dismiss; clean outside single tap does`,async({page})=>{
  await page.setViewportSize({width,height:900});await open(page,'bills');await field(page,'note').click();await settled(page);
  const box=await page.locator('#dialog').boundingBox();await page.mouse.click(box.x+8,box.y+box.height/2);await expect(page.locator('#dialog-title')).toHaveText('修改备注');
  const input=await page.locator('#note-dialog').boundingBox();await page.mouse.move(input.x+30,input.y+10);await page.mouse.down();await page.mouse.move(12,12);await page.mouse.up();await expect(page.locator('#dialog-title')).toHaveText('修改备注');
  await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
 });
 test(`DISMISS05 ${width}: filters, category and display forms protect changed values and close when restored`,async({page})=>{
  await page.setViewportSize({width,height:900});await open(page,'bills');await action(page,'filters').click();await page.locator('#dialog [name="q"]').fill('尚未应用');await outside(page);await expect(page.locator('#dialog-title')).toHaveText('放弃修改？');await action(page,'keep-editing').click();await expect(page.locator('#dialog [name="q"]')).toHaveValue('尚未应用');await page.locator('#dialog [name="q"]').fill('');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
  await open(page,'settings');await action(page,'categories').click();await action(page,'edit-category').click();const name=await page.locator('#dialog [name="name"]').inputValue();await page.locator('#dialog [name="name"]').fill('合成分类待修改');await outside(page);await action(page,'keep-editing').click();await expect(page.locator('#dialog [name="name"]')).toHaveValue('合成分类待修改');await page.locator('#dialog [name="name"]').fill(name);await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
  await action(page,'display').click();await page.locator('#dialog [name="density"]').selectOption('compact');await outside(page);await action(page,'keep-editing').click();await expect(page.locator('#dialog [name="density"]')).toHaveValue('compact');await page.locator('#dialog [name="density"]').selectOption('comfortable');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();
 });
 test(`DISMISS06 ${width}: text draft survives outside close and reopen without ledger writes`,async({page,ledger})=>{
  await page.setViewportSize({width,height:900});await open(page);const prior=await ledger.call('/backup');await action(page,'text-records').click();await page.locator('#text-raw').fill('合成口述草稿 午餐 12 元');await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();await action(page,'text-records').click();await expect(page.locator('#text-raw')).toHaveValue('合成口述草稿 午餐 12 元');expect((await ledger.call('/backup')).entries).toEqual(prior.entries);
 });
}
test('DISMISS07 saving is locked; interrupted response preserves retry token and cannot accidentally dismiss',async({page,ledger})=>{
 await open(page,'bills');const prior=(await ledger.call('/entries/demo-lunch')).entry;await field(page,'amount').click();await page.locator('#amount-dialog').fill('42.01');let release;const gate=new Promise(r=>release=r);await page.route('**/api/entries/demo-lunch',async route=>{if(route.request().method()==='PATCH'){await gate;await route.fetch();await route.abort('failed');}else await route.continue();});await page.route('**/api/operations/*',route=>route.abort('failed'));
 await page.locator('#entry-form-dialog [type="submit"]').click();await expect(page.locator('#dialog')).toHaveAttribute('data-locked','true');await outside(page);await expect(page.locator('#dialog')).toBeVisible();await expect(page.locator('#toast')).toContainText('正在处理');release();await expect(page.locator('#entry-error-dialog')).not.toBeEmpty();await outside(page);await expect(page.locator('#dialog-title')).toHaveText('修改金额');await expect(page.locator('#toast')).toContainText('保存结果尚未核实');
 await page.unroute('**/api/entries/demo-lunch');await page.unroute('**/api/operations/*');await page.locator('#entry-form-dialog [type="submit"]').click();await expect(page.locator('#dialog')).not.toBeVisible();expect((await ledger.call('/entries/demo-lunch')).entry.version).toBe(prior.version+1);
});
test('DISMISS08 backup file and preview survive protection; readonly dialogs dismiss without side effects',async({page,ledger})=>{
 await open(page,'settings');await action(page,'backup').click();await page.locator('#backup-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ledger.backup))});await expect(page.locator('#backup-preview')).toContainText('校验通过');await outside(page);await action(page,'keep-editing').click();await expect(page.locator('#backup-preview')).toContainText('校验通过');expect(await page.locator('#backup-file').evaluate(e=>e.files[0].name)).toBe('synthetic.json');await outside(page);await action(page,'discard-editing').click();await expect(page.locator('#dialog')).not.toBeVisible();
 for(const name of ['categories','trash','ledgers','logout']){await action(page,name).click();await outside(page);await expect(page.locator('#dialog')).not.toBeVisible();}await expect(page.locator('#main')).toBeVisible();
});

test('DISMISS09 second click after animation cannot open an underlying button; reduced motion follows the same rule',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});await open(page,'bills');
 const target=page.locator('.sidebar nav [data-route="stats"]');const b=await target.boundingBox();await field(page,'category_id').click();await expect(page.locator('#dialog')).toBeVisible();await page.mouse.click(b.x+10,b.y+10);await expect(page.locator('#dialog')).not.toBeVisible();await page.mouse.click(b.x+10,b.y+10);await expect(page).toHaveURL(/\/bills/);
});
test('DISMISS10 new-entry draft preserves edits when kept and restores previous draft on explicit discard',async({page,ledger})=>{
 await page.setViewportSize({width:1024,height:900});await open(page,'bills');const prior=(await ledger.call('/entries')).totals.count;await action(page,'new-entry').click();await page.locator('#amount-dialog').fill('77.12');await outside(page);await action(page,'keep-editing').click();await expect(page.locator('#amount-dialog')).toHaveValue('77.12');await outside(page);await action(page,'discard-editing').click();await expect(page.locator('#dialog')).not.toBeVisible();await action(page,'new-entry').click();await expect(page.locator('#amount-dialog')).toHaveValue('');expect((await ledger.call('/entries')).totals.count).toBe(prior);
});
