import { parseTextRecords, compileTextItems, CYCLES } from '../shared/text-records.js';
import { parseAmount, decimal, money, recordDateLabel } from '../shared/format.js';
import { batchProgress } from '../shared/batch-progress.js';
import { PLATFORMS, tagPlatformItems } from '../shared/platform-sources.js';
import { textItemsSchema } from '../shared/text-schema.js';
import { request, mutate } from './api.js';
import { escape as e, icon } from './ui.js';

const fieldQuestion=/^(起始月未知|扣款日未知|补记截止月或持续循环方式|记账日期未说明|金额或币种待确认|金额无效)/;
export function mountTextRecords(container,{categories,currentDay,draftKey,local=false,lock,onSaved,onCategoriesChanged=()=>{},onViewBills,initialBatchId=null,initialSource=''}) {
 let disposed=false,busy=false,batch=null,items=[],original='',slots=[],preview=null,pending=null,view='compose',receipt=null,rawValue='',deletePrompt=false,conflict=false;
 let source=PLATFORMS.includes(initialSource)?initialSource:'';
 let precisions={},duplicateItems=new Set(),focusAfter=false,choiceFocus=null,itemErrors=new Map();
 try {const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved&&!initialBatchId){({batch,items,original,slots,pending}=saved);rawValue=saved.rawValue??original;precisions=saved.precisions||{};source=saved.source??source;view=items.length?'review':'compose';}}catch{sessionStorage.removeItem(draftKey);}
 container.className='text-flow';
 container.innerHTML='<div id="text-flow-heading"></div><div id="text-status" role="status" aria-live="polite"></div><div id="text-batch-list"></div><div id="text-work"></div><div id="text-preview"></div><div id="text-actions" class="flow-actions"></div>';
 const heading=container.querySelector('#text-flow-heading'),status=container.querySelector('#text-status'),list=container.querySelector('#text-batch-list'),work=container.querySelector('#text-work'),result=container.querySelector('#text-preview'),actions=container.querySelector('#text-actions');
 function message(text,tone=''){status.textContent=text;status.className=tone;}
 function persist(){if(disposed)return;try{sessionStorage.setItem(draftKey,JSON.stringify({batch,items,original,rawValue,slots,pending,precisions,source}));}catch{message('浏览器无法保留草稿，请保存后再离开。','error');}}
 function suggestionHtml(item){
  const hint=item.category_hint;if(!hint)return '';
  const active=categories.filter(c=>c.type===item.type&&!c.archived),recommended=active.filter(c=>hint.recommended_ids.includes(c.id));
  const choices=recommended.length?recommended:active.slice(0,5);
  const exact=active.find(c=>c.name===hint.name);
  return `<section class="category-suggestion ${hint.resolved?'is-resolved':''}" aria-label="分类建议"><p><strong>你说的“${e(hint.name)}”</strong><span>${hint.resolved?'已选择，可改选':'归到哪里？'}</span></p><div class="category-choices">${choices.map(c=>`<button type="button" class="category-choice ${recommended.includes(c)?'recommended':''}" data-text-action="choose-category" data-item="${e(item.id)}" data-category="${e(c.id)}" aria-pressed="${hint.resolved&&item.category_id===c.id}">${icon(c.icon,16)}归到 ${e(c.name)}${recommended.includes(c)?'<small>推荐</small>':''}${hint.resolved&&item.category_id===c.id?icon('check',16):''}</button>`).join('')}${exact&&!choices.some(c=>c.id===exact.id)?`<button type="button" class="category-choice" data-text-action="choose-category" data-item="${e(item.id)}" data-category="${e(exact.id)}" aria-pressed="${hint.resolved&&item.category_id===exact.id}">使用 ${e(hint.name)}</button>`:!exact?`<button type="button" class="category-choice create-choice" data-text-action="create-category" data-item="${e(item.id)}">${icon('plus',16)}新建 ${e(hint.name)}</button>`:''}</div><small>选分类后，再点绿色确认入账</small></section>`;
 }
 function renderChoice(id){const scroller=container.closest('.dialog-body'),top=scroller?.scrollTop||0;render();if(scroller)scroller.scrollTop=top;choiceFocus=id;}
 function applyCreatedCategory(value,id){const item=items.find(i=>i.id===id);if(!item)throw new Error('分类已处理，请重新打开原草稿选择');categories=categories.filter(c=>c.id!==value.category.id).concat(value.category);onCategoriesChanged(categories);item.category_id=value.category.id;item.category_hint.resolved=true;itemErrors.delete(id);preview=null;persist();renderChoice(id);message(value.reused?'已使用已有分类，尚未入账':'分类已新建并选中，尚未入账','success');}
 const lockedIds=()=>new Set(slots.map(s=>s.item_id));
 const localPlan=()=>compileTextItems(items.map(i=>({...i,questions:i.questions.filter(q=>!fieldQuestion.test(q))})),currentDay,slots);
 function feedbackText(item,row){
  if(itemErrors.has(item.id))return itemErrors.get(item.id);
  if(row?.missing.length)return row.missing.map(q=>q==='扣款日待确认'?'扣款日待确认：填写 1–31 日，或选择只记月份。':q).join('；');
  return row?.entries.length?`${item.category_hint?.resolved?`已选 ${categories.find(c=>c.id===item.category_id)?.name||'分类'} · `:''}${row.entries.length} 笔 · ${item.cycle==='single'?recordDateLabel(item.occurred_on):item.date_precision==='month'?'只记月份，不填扣款日':'按已核对周期入账'}`:'此项未选或已记录';
 }
 function footerHtml(item,row,locked){const issue=itemErrors.has(item.id)||Boolean(row?.missing.length),feedbackId=`candidate-feedback-${item.id}`;
  return `<div class="candidate-footer"><div class="candidate-help"><div id="${e(feedbackId)}" class="candidate-feedback ${issue?'has-error':''}" role="status" aria-live="polite">${e(feedbackText(item,row))}</div>${!locked&&item.cycle!=='single'&&item.date_precision!=='month'?`<button class="month-only-button" data-text-action="month-only" data-item="${e(item.id)}">不填扣款日，按月记</button>`:''}</div><button class="confirm-one" data-text-action="confirm-item" data-item="${e(item.id)}" aria-describedby="${e(feedbackId)}" aria-label="确认 ${e(item.title)}">${icon('check',17)}确认${row?.entries.length>1?` ${row.entries.length} 笔`:''}</button></div>`;
 }
 function itemIssue(id,text){itemErrors.set(id,text);const feedback=work.querySelector(`[data-item-id="${id}"] .candidate-feedback`);if(feedback){feedback.textContent=text;feedback.classList.add('has-error');}}
 function refreshCandidateFeedback(){const plan=localPlan();for(const item of items){const card=work.querySelector(`[data-item-id="${item.id}"]`);if(!card)continue;const row=plan.rows.find(r=>r.item.id===item.id),feedback=card.querySelector('.candidate-feedback');feedback.textContent=feedbackText(item,row);feedback.classList.toggle('has-error',itemErrors.has(item.id)||Boolean(row?.missing.length));card.querySelector('.candidate-amount').textContent=item.amount_minor?money(item.amount_minor):'待填金额';card.querySelector('.candidate-top h3').firstChild.textContent=item.title;card.querySelector('.confirm-one').lastChild.textContent=`确认${row?.entries.length>1?` ${row.entries.length} 笔`:''}`;}}
 function controls(){container.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=busy||Boolean(pending);});container.querySelector('[data-text-action=retry]')?.toggleAttribute('disabled',busy);for(const id of lockedIds())container.querySelector(`[data-item-id="${id}"] fieldset`)?.setAttribute('disabled','');lock(busy);}
 function progressHtml(progress){return `<section class="batch-progress" aria-label="批次进度"><div><span class="source-badge">${e(progress.source)}</span><strong>已确认 ${progress.confirmed_items} / ${progress.total_items} 项</strong></div><progress max="${Math.max(1,progress.total_items)}" value="${progress.confirmed_items}" aria-label="确认进度"></progress><p>本批：${e(progress.first_title)} → ${e(progress.last_title)}</p>${progress.next_title?`<p class="resume-hint">${progress.continue_after?`连续记到：${e(progress.continue_after)}；`:'从第一项开始核对；'}下一项：${e(progress.next_title)}</p>`:'<p class="resume-hint">本批全部已记录，可以继续往前翻。</p>'}${progress.has_gaps?'<p class="pending-note">中间还有未确认项，请从下一项继续。</p>':''}${progress.deleted_entries?`<p class="pending-note">${progress.deleted_entries} 笔已移入回收站，不会自动补记。</p>`:''}</section>`;}
 function dateField(item){const precision=precisions[item.id]||(item.occurred_on?.length===10?'day':'month');return `<label>日期精度<select data-field="date_precision"><option value="month" ${precision==='month'?'selected':''}>只记月份</option><option value="day" ${precision==='day'?'selected':''}>精确到日</option></select></label><label>${precision==='month'?'记账月份':'记账日期'}<input type="${precision==='month'?'month':'date'}" max="${precision==='month'?currentDay.slice(0,7):currentDay}" data-field="occurred_on" value="${e(item.occurred_on||'')}"/></label>`;}
 function render(){
  heading.innerHTML=`<div class="flow-heading"><span class="step-number">${view==='result'?icon('check',20):icon('receipt',20)}</span><div><h3>${view==='compose'?'把收支告诉我':view==='result'?'这批已记录':'逐条核对，确认一条记一条'}</h3><p>${view==='compose'?'先理解、再确认；没说日子就只记月份':view==='result'?'已由服务器确认保存':'绿色按钮保存本项，其他条目保留'}</p></div></div>`;
  list.hidden=view!=='compose';work.replaceChildren();result.replaceChildren();actions.replaceChildren();deletePrompt=false;
  if(view==='compose'){
   work.innerHTML=`<div class="input-zone"><div class="source-picker" aria-label="本批来源"><span>本批来源</span><div>${['',...PLATFORMS].map(name=>`<button type="button" data-text-action="source" data-source="${e(name)}" aria-pressed="${name===source}">${e(name||'自动识别')}</button>`).join('')}</div></div><label class="text-input-label">记账文字<textarea id="text-raw" rows="4" maxlength="10000" placeholder="午餐 35 元；上个月打车 18 元">${e(rawValue)}</textarea></label><p class="read-only-note">支持明确的文字格式；复杂口述继续在聊天线程理解。</p></div>`;
   actions.innerHTML='<button class="button primary" data-text-action="parse">下一步 · 核对</button>';
  }else if(view==='result'){
   result.innerHTML=`<section class="flow-success" role="status"><span class="success-mark">${icon('checks',32)}</span><h3>已入账 · ${local?'本地已保存':'云端已保存'}</h3><strong class="preview-total money">${receipt.expense_minor&&receipt.income_minor?`支出 ${money(receipt.expense_minor)}<br>收入 ${money(receipt.income_minor)}`:`${receipt.expense_minor?'支出':'收入'} ${money(receipt.expense_minor||receipt.income_minor)}`}</strong><p>${receipt.count} 笔</p><p>${e(receipt.from)}${receipt.from!==receipt.to?` 至 ${e(receipt.to)}`:''}</p>${receipt.from?.length===7||receipt.to?.length===7?'<p>只记月份 · 日期未指定</p>':''}</section>${receipt.progress?progressHtml(receipt.progress):''}`;
   actions.innerHTML='<button class="button secondary" data-text-action="new">再记一批</button><button class="button primary" data-text-action="view-bills">查看账单</button>';
  }else if(view==='preview'){
   const plan=preview;
   result.innerHTML=`<section class="text-preview-card"><h3>将新增 ${plan.count} 笔</h3><strong class="preview-total money">${money(plan.expense_minor||plan.income_minor)}</strong><p>支出 ${money(plan.expense_minor)} · 收入 ${money(plan.income_minor)}</p><div class="preview-list">${plan.entries.map(i=>`<p><span>${e(recordDateLabel(i.occurred_on))} · ${e(i.note)}</span><b class="money">${money(i.amount_minor)}</b></p>`).join('')}</div>${plan.pending_count?`<p class="pending-note">另有 ${plan.pending_count} 项待补全，不会入账</p>`:''}${plan.duplicates?.length?`<p class="field-error">${plan.duplicates.length} 个日期已有同额账目。</p><label class="checkbox-label"><input type="checkbox" id="text-ack-duplicates"/>这是另外发生的收支</label>`:''}</section>`;
   actions.innerHTML=`<button class="button secondary" data-text-action="edit">返回修改</button><button class="button primary" data-text-action="confirm">确认入账 ${plan.count} 笔</button>`;
  }else{
   const plan=localPlan(),done=lockedIds(),progress=batchProgress({items,original_text:original},slots);
   work.innerHTML=progressHtml(progress)+items.filter(item=>!done.has(item.id)||plan.rows.find(r=>r.item.id===item.id)?.entries.length).map(item=>{
    const locked=done.has(item.id),row=plan.rows.find(r=>r.item.id===item.id),questions=item.questions.filter(q=>!fieldQuestion.test(q));
    const rangeMode=item.ongoing&&item.through_month?'conflict':item.ongoing?'ongoing':'through';
    return `<article class="text-candidate" data-item-id="${e(item.id)}"><div class="candidate-top"><h3>${e(item.title)}<small> · ${e(CYCLES[item.cycle])}</small></h3><span class="candidate-amount">${item.amount_minor?money(item.amount_minor):'待填金额'}</span></div><fieldset ${locked?'disabled':''}><div class="text-fields"><label>金额（元）<input inputmode="decimal" data-field="amount_minor" value="${item.amount_minor?decimal(item.amount_minor):''}"/></label><label>分类<select data-field="category_id"><option value="">请选择</option>${categories.filter(c=>c.type===item.type&&(!c.archived||c.id===item.category_id)).map(c=>`<option value="${e(c.id)}" ${c.id===item.category_id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>${item.cycle==='single'?dateField(item):`<label>起始月<input type="month" data-field="start_month" value="${e(item.start_month||'')}"/></label><label>日期精度<select data-field="cycle_precision"><option value="month" ${item.date_precision==='month'?'selected':''}>只记月份</option><option value="day" ${item.date_precision!=='month'?'selected':''}>精确到日</option></select></label>${item.date_precision!=='month'?`<label>每月扣款日<input type="number" min="1" max="31" data-field="charge_day" value="${item.charge_day||''}"/></label>`:''}<label class="full-field">补记范围<select data-field="range_mode"><option value="conflict" ${rangeMode==='conflict'?'selected':''} ${rangeMode!=='conflict'?'hidden':''}>请选择一种范围</option><option value="through" ${rangeMode==='through'?'selected':''}>补记到指定月份</option><option value="ongoing" ${rangeMode==='ongoing'?'selected':''}>持续循环 · 仅记到今天</option></select></label>${rangeMode!=='ongoing'?`<label class="full-field">截止月<input type="month" data-field="through_month" value="${e(item.through_month||'')}"/></label>`:''}`}</div>${suggestionHtml(item)}<details><summary>更多选项与原文</summary><label class="text-input-label">名称<input data-field="title" maxlength="80" value="${e(item.title)}"/></label><label class="checkbox-label"><input type="checkbox" data-field="selected" ${item.selected?'checked':''}/>纳入本次记账</label>${item.cycle!=='single'&&item.date_precision!=='month'?`<label class="checkbox-label"><input type="checkbox" data-field="short_month" ${item.short_month==='last_day'?'checked':''}/>不足扣款日的月份使用月末</label>`:''}<p>${e(item.raw)}</p></details>${questions.length?`<ul class="text-questions">${questions.map(q=>`<li>${e(q)}</li>`).join('')}</ul><label class="checkbox-label"><input type="checkbox" data-field="resolve_questions"/>上述疑问已核对</label>`:''}</fieldset>${duplicateItems.has(item.id)?'<label class="checkbox-label duplicate-ack"><input type="checkbox" data-duplicate-ack/>同额已存在，这是另一笔消费</label>':''}${footerHtml(item,row,locked)}</article>`;
   }).join('');
   if(done.size)work.innerHTML+=`<details class="confirmed-items"><summary>${icon('checks',16)}查看已确认 ${progress.confirmed_items} 项</summary>${items.filter(i=>done.has(i.id)).map(i=>`<p>${e(i.title)} <span>已记录</span></p>`).join('')}</details>`;
   actions.innerHTML=`<button class="button secondary" data-text-action="save">存为草稿</button><button class="button secondary" data-text-action="preview">核对 ${plan.count} 笔账目</button><button class="text-button" data-text-action="back-list">批次列表</button><button class="text-button" data-text-action="new">新一批</button>${batch?`<button class="text-button" data-text-action="${batch.status==='paused'?'resume':'pause'}">${batch.status==='paused'?'恢复':'暂停'}</button>${!slots.length?'<button class="text-button delete-draft" data-text-action="delete">删除草稿</button>':''}`:''}`;
  }
  if(conflict)actions.insertAdjacentHTML('beforeend','<button class="button secondary" data-text-action="reload-batch">载入最新批次</button>');
  if(pending)actions.innerHTML='<button class="button primary" data-text-action="retry">核对保存结果</button>';
  controls();
 }
 function readItems(monthOnlyId=null){
  for(const item of items){const card=work.querySelector(`[data-item-id="${item.id}"]`);if(!card||lockedIds().has(item.id))continue;
   for(const input of card.querySelectorAll('[data-field]')){const field=input.dataset.field;
    if(field==='cycle_precision'){item.date_precision=input.value;continue;}
    if(field==='date_precision'){precisions[item.id]=input.value;continue;}
    if(field==='resolve_questions'){if(input.checked)item.questions=[];continue;}
    if(field==='range_mode'){if(input.value==='through')item.ongoing=false;else if(input.value==='ongoing'){item.ongoing=true;item.through_month=null;}continue;}
    if(field==='selected')item.selected=input.checked;
    else if(field==='short_month')item.short_month=input.checked?'last_day':'pending';
    else if(field==='amount_minor')item.amount_minor=input.value.trim()?parseAmount(input.value):null;
    else if(field==='charge_day')item.charge_day=input.value?Number(input.value):null;
    else item[field]=input.value||(['category_id','occurred_on','start_month','through_month'].includes(field)?null:'');
   }
   if(card.querySelector('[data-field=range_mode]')?.value==='ongoing')item.through_month=null;
   if(item.id===monthOnlyId)item.date_precision='month';
   if(item.date_precision==='month')item.charge_day=null;
   if(item.charge_day!==null&&(!Number.isInteger(item.charge_day)||item.charge_day<1||item.charge_day>31))throw new Error('扣款日须为 1–31 的整数；也可选择不填扣款日，按月记。');
   item.questions=item.questions.filter(q=>!fieldQuestion.test(q));
  }
  textItemsSchema.parse(items);persist();
 }
 function selectBatch(b){itemErrors.clear();batch=b;items=b.items;slots=b.slots||[];original=b.original_text;rawValue=original;preview=null;conflict=false;precisions={};view='review';message(b.status==='paused'?'此批次已暂停，恢复后才能继续确认。':'');persist();render();}
 async function loadList(){try{
   const data=await request('/text-batches');if(disposed)return;
   list.innerHTML=data.batches.length?`<h3>记账批次 · 下次从这里继续</h3>${data.batches.map(b=>{const p=b.progress||batchProgress(b);return `<button class="text-batch-row" data-text-action="open" data-id="${e(b.id)}"><span><strong>${e(p.source)} · ${p.confirmed_items}/${p.total_items} 项</strong><small>${e(p.first_title)} → ${e(p.last_title)}</small><small>${p.recorded_at?`${e(recordDateLabel(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(p.recorded_at))))}记过；`:''}${p.next_title?`下一项：${e(p.next_title)}`:'本批已记录'}${p.has_gaps?' · 中间有未确认项':''}</small></span><span class="status-pill ${b.status==='paused'?'paused':p.confirmed_items===p.total_items&&p.total_items?'saved':''}">${b.status==='paused'?'已暂停':b.pending_count?'待补全':p.confirmed_items===p.total_items&&p.total_items?'已记录':'待确认'}</span>${icon('right',16)}</button>`;}).join('')}`:'';
   if(initialBatchId){const id=initialBatchId;initialBatchId=null;const found=data.batches.find(b=>b.id===id);if(found)selectBatch(found);else message('该批次已不存在，请刷新列表。','error');}
   controls();
  }catch(error){if(!disposed)list.innerHTML=`<p class="field-error">文字记录暂未取得：${e(error.message)}</p><button class="button secondary" data-text-action="list-retry">重试</button>`;}}
 async function send(path,body,method='POST',meta={}){const op=pending||{...meta,path,body,method,key:crypto.randomUUID()};pending=op;persist();controls();const value=await mutate(op.path,op.body,{method:op.method,key:op.key});pending=null;persist();return value;}
 async function save(){readItems();const body={original_text:original,items};const value=await send(batch?`/text-batches/${batch.id}`:'/text-batches',batch?{...body,version:batch.version}:body,batch?'PATCH':'POST');batch=value.batch;items=batch.items;if(value.repeated){const latest=(await request('/text-batches')).batches.find(b=>b.id===batch.id);if(latest){batch=latest;items=latest.items;slots=latest.slots||[];}}persist();}
 async function refreshAfterWrite(){try{await onSaved();}catch{message('保存已完成，账单暂未刷新；请重新打开查看。','error');}}
 function applyConfirmation(value,plan){slots.push(...plan.entries.map((entry,index)=>({item_id:entry.item_id,occurred_on:entry.occurred_on,entry_id:value.entry_ids[index],created_at:value.recorded_at})));batch.version=value.version;batch.status='active';persist();}
 async function showSuccess(value){receipt={...value,progress:batch?batchProgress(batch,slots):null};view='result';batch=null;items=[];slots=[];preview=null;original='';rawValue='';sessionStorage.removeItem(draftKey);message('');render();await refreshAfterWrite();}
 async function confirmItem(id){
  readItems();const row=localPlan().rows.find(r=>r.item.id===id);
  if(!row?.entries.length){const text=feedbackText(items.find(i=>i.id===id),row);itemIssue(id,text);message(text,'error');return;}
  if(batch?.status==='paused'){itemIssue(id,'此批次已暂停，请在下方恢复后确认。');message('此批次已暂停，请先恢复。','error');return;}
  const ack=Boolean(work.querySelector(`[data-item-id="${id}"] [data-duplicate-ack]`)?.checked);
  await save();if(!localPlan().rows.find(r=>r.item.id===id)?.entries.length){message('本项已记录，不会重复入账。','success');render();await refreshAfterWrite();return;}const plan=await request(`/text-batches/${batch.id}/preview`,{method:'POST',body:{item_ids:[id]}});
  if(plan.duplicates.length&&!ack){duplicateItems.add(id);itemErrors.set(id,'同日或同月已有同额账目，请勾选上方同额确认后再保存。');message('同日或同月已有同额账目，请核对是否另一笔。','error');render();return;}
  const value=await send(`/text-batches/${batch.id}/confirm`,{version:batch.version,preview_hash:plan.preview_hash,item_ids:[id],acknowledge_duplicates:ack});
  applyConfirmation(value,plan);
  const card=work.querySelector(`[data-item-id="${id}"]`),scroller=container.closest('.dialog-body');
  if(card){card.classList.add('confirmed');card.querySelector('.confirm-one').innerHTML=`${icon('checks',17)}已保存`;message(`${value.count} 笔已保存 · ${money(value.expense_minor||value.income_minor)}`,'success');
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches){await card.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(36px)'}],{duration:230,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'}).finished.catch(()=>{});await card.animate([{height:`${card.offsetHeight}px`,marginBottom:'14px',paddingTop:'14px',paddingBottom:'14px'},{height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',borderWidth:'0px'}],{duration:170,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});}
  }
  if(disposed)return;
  if(localPlan().rows.every(r=>!r.missing.length&&!r.entries.length)){
   try{const latest=(await request('/text-batches')).batches.find(b=>b.id===batch.id);if(!latest)throw new Error('批次不存在');batch=latest;slots=latest.slots;const active=slots.filter(s=>!s.deleted_at),dates=active.map(s=>s.current_occurred_on).sort();const sum=type=>active.filter(s=>s.type===type).reduce((n,s)=>n+s.amount_minor,0);await showSuccess({...value,count:active.length,expense_minor:sum('expense'),income_minor:sum('income'),from:dates[0]||value.from,to:dates.at(-1)||value.to});}
   catch{await showSuccess(value);message('本次已保存；批次合计暂未取得，请刷新账单核对。','error');}
  }else{const top=scroller?.scrollTop||0;render();if(scroller)scroller.scrollTop=top;focusAfter=true;await refreshAfterWrite();}
 }
 async function handle(event){const button=event.target.closest('[data-text-action]');if(!button||button.disabled||busy)return;const action=button.dataset.textAction;if(pending&&action!=='retry')return;busy=true;controls();
  try{
   if(action==='source'){rawValue=work.querySelector('#text-raw').value;source=button.dataset.source;persist();render();}
   if(action==='parse'){itemErrors.clear();rawValue=work.querySelector('#text-raw').value;original=rawValue;items=tagPlatformItems(parseTextRecords(original,currentDay,categories),source);batch=null;slots=[];precisions={};preview=null;view='review';message('');persist();render();}
   if(action==='new'){itemErrors.clear();batch=null;items=[];original='';rawValue='';slots=[];preview=null;view='compose';receipt=null;precisions={};duplicateItems.clear();conflict=false;message('');sessionStorage.removeItem(draftKey);render();await loadList();}
   if(action==='back-list'){view='compose';message('');render();await loadList();}
   if(action==='open'||action==='reload-batch'){const data=await request('/text-batches');const b=data.batches.find(b=>b.id===(action==='open'?button.dataset.id:batch?.id));if(!b)throw new Error('记录已不存在，请刷新列表');selectBatch(b);}
   if(action==='choose-category'){readItems();const item=items.find(i=>i.id===button.dataset.item),cat=categories.find(c=>c.id===button.dataset.category&&c.type===item.type&&!c.archived);if(!cat)throw new Error('分类已变化，请重新打开核对');item.category_id=cat.id;item.category_hint.resolved=true;itemErrors.delete(item.id);preview=null;persist();message('');renderChoice(item.id);}
   if(action==='create-category'){readItems();const item=items.find(i=>i.id===button.dataset.item);const value=await send('/categories/resolve',{name:item.category_hint.name,type:item.type},'POST',{item_id:item.id});applyCreatedCategory(value,item.id);}
   if(action==='confirm-item'){itemErrors.delete(button.dataset.item);await confirmItem(button.dataset.item);}
   if(action==='month-only'){const id=button.dataset.item,scroller=container.closest('.dialog-body'),top=scroller?.scrollTop||0;readItems(id);itemErrors.delete(id);preview=null;message('');persist();render();if(scroller)scroller.scrollTop=top;focusAfter=id;}
   if(action==='edit'){view='review';preview=null;message('');render();}
   if(action==='save'||action==='preview'){await save();if(action==='preview'){preview=await request(`/text-batches/${batch.id}/preview`,{method:'POST',body:{}});if(preview.count){view='preview';message('');}else{view='review';message('草稿已保存，0 笔入账；请补齐信息。');}}else{view='review';message(`草稿已保存，本次 0 笔入账；${localPlan().count} 笔待确认。`);}render();await loadList();await refreshAfterWrite();}
   if(action==='confirm'){if(!preview||!batch)throw new Error('请重新核对日期和金额');const value=await send(`/text-batches/${batch.id}/confirm`,{version:batch.version,preview_hash:preview.preview_hash,acknowledge_duplicates:Boolean(container.querySelector('#text-ack-duplicates')?.checked)});applyConfirmation(value,preview);await showSuccess(value);}
   if(action==='view-bills'&&receipt)onViewBills({from:receipt.from,to:receipt.to});
   if(action==='pause'||action==='resume'){const value=await send(`/text-batches/${batch.id}/status`,{version:batch.version,status:action==='pause'?'paused':'active'});batch.version=value.version;batch.status=value.status;message(action==='pause'?'已暂停，已有账目保留。':'已恢复，确认后才会入账。');persist();render();await refreshAfterWrite();}
   if(action==='delete'){deletePrompt=true;message('删除这份未入账草稿？不会删除任何账单。');actions.innerHTML='<button class="button secondary" data-text-action="cancel-delete">保留草稿</button><button class="button danger-button" data-text-action="confirm-delete">删除草稿</button>';}
   if(action==='cancel-delete'){message('');render();}
   if(action==='confirm-delete'&&deletePrompt){await send(`/text-batches/${batch.id}`,{version:batch.version},'DELETE');batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('草稿已删除');render();await loadList();await refreshAfterWrite();}
   if(action==='retry'){const op=pending;const value=await send(op.path,op.body,op.method);if(op.path==='/categories/resolve'){applyCreatedCategory(value,op.item_id);}else if(op.path.endsWith('/confirm')){initialBatchId=batch.id;view='compose';render();await loadList();message('保存结果已核对，不会重复入账。','success');await refreshAfterWrite();}else if(value.batch){batch=value.batch;items=batch.items;original=batch.original_text;rawValue=original;view='review';message('草稿已保存，尚未入账。');render();await loadList();await refreshAfterWrite();}else{batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('提交结果已核对');render();await loadList();await refreshAfterWrite();}}
   if(action==='list-retry')await loadList();
  }catch(error){if(button.dataset.item)itemIssue(button.dataset.item,error.message);message(error.message,'error');if(error.code==='VERSION_CONFLICT'||error.code==='PREVIEW_CHANGED')conflict=true;if(error.code!=='NETWORK'&&!(error.status>=500))pending=null;persist();if(conflict||pending){render();message(error.message,'error');}}
  finally{busy=false;if(!disposed){controls();if(choiceFocus){work.querySelector(`[data-item-id="${choiceFocus}"] .category-choice[aria-pressed="true"]`)?.focus({preventScroll:true});choiceFocus=null;}if(focusAfter){const next=typeof focusAfter==='string'?work.querySelector(`[data-item-id="${focusAfter}"] .confirm-one`):work.querySelector('.confirm-one');focusAfter=false;next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}}
 }
 function change(event){if(event.target.hasAttribute('data-duplicate-ack'))return;if(event.target.id==='text-raw'){rawValue=event.target.value;persist();return;}if(event.target.closest('[data-item-id]')){try{
   const id=event.target.closest('[data-item-id]').dataset.itemId,precision=event.target.value;
   itemErrors.delete(id);readItems();if(event.target.dataset.field==='category_id'){const item=items.find(i=>i.id===id);if(item.category_hint)item.category_hint.resolved=Boolean(item.category_id);}
   if(event.target.dataset.field==='date_precision'){const item=items.find(i=>i.id===id);item.occurred_on=precision==='month'?item.occurred_on?.slice(0,7)||null:item.occurred_on?.length===10?item.occurred_on:null;}
   preview=null;message('');persist();if(['cycle_precision','date_precision','range_mode','resolve_questions','category_id'].includes(event.target.dataset.field))render();else refreshCandidateFeedback();
  }catch(error){itemIssue(event.target.closest('[data-item-id]').dataset.itemId,error.message);message(error.message,'error');}}}
 function input(event){if(event.target.id==='text-raw'){rawValue=event.target.value;persist();}}
 container.addEventListener('click',handle);container.addEventListener('change',change);container.addEventListener('input',input);render();loadList();
 return ()=>{if(view!=='result')persist();disposed=true;container.removeEventListener('click',handle);container.removeEventListener('change',change);container.removeEventListener('input',input);container.replaceChildren();};
}
