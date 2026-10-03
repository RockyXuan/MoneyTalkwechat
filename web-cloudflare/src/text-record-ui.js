import { parseTextRecords, compileTextItems, CYCLES } from '../shared/text-records.js';
import { parseAmount, decimal, money } from '../shared/format.js';
import { textItemsSchema } from '../shared/text-schema.js';
import { request, mutate } from './api.js';
import { escape as e, icon } from './ui.js';

// The compiler derives missing fields; retain only semantic uncertainties that
// cannot be resolved by filling the form. No missing date is guessed here.
const fieldQuestion = /^(起始月未知|扣款日未知|补记截止月或持续循环方式|记账日期未说明|金额或币种待确认|金额无效)/;
export function mountTextRecords(container, { categories, currentDay, draftKey, local = false, lock, onSaved, onViewBills }) {
 let disposed=false,busy=false,batch=null,items=[],original='',slots=[],preview=null,pending=null,view='compose',receipt=null,deletePrompt=false;
 let rawValue='';
 try {const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved){({batch,items,original,slots,pending}=saved);rawValue=saved.rawValue??original;view=items.length?'review':'compose';}} catch {sessionStorage.removeItem(draftKey);}
 container.className='text-flow';
 container.innerHTML='<div id="text-flow-heading"></div><div id="text-status" role="status" aria-live="polite"></div><div id="text-batch-list"></div><div id="text-work"></div><div id="text-preview"></div><div id="text-actions" class="flow-actions"></div>';
 const heading=container.querySelector('#text-flow-heading'),status=container.querySelector('#text-status'),list=container.querySelector('#text-batch-list'),work=container.querySelector('#text-work'),result=container.querySelector('#text-preview'),actions=container.querySelector('#text-actions');
 function message(text,tone=''){status.textContent=text;status.className=tone;}
 function persist(){if(disposed)return;try{sessionStorage.setItem(draftKey,JSON.stringify({batch,items,original,rawValue,slots,pending}));}catch{message('浏览器无法保留草稿，请完成保存后再离开。','error');}}
 const lockedIds=()=>new Set(slots.map(s=>s.item_id));
 function controls(){container.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=busy||Boolean(pending);});container.querySelector('[data-text-action="retry"]')?.toggleAttribute('disabled',busy);for(const id of lockedIds())container.querySelector(`[data-item-id="${id}"] fieldset`)?.setAttribute('disabled','');lock(busy);}
 function localPlan(){return compileTextItems(items.map(i=>({...i,questions:i.questions.filter(q=>!fieldQuestion.test(q))})),currentDay,slots);}
 function render(){
  const step=view==='compose'?1:view==='result'?3:2;
  heading.innerHTML=`<div class="flow-heading"><span class="step-number">${view==='result'?icon('check',20):step}</span><div><h3>${view==='compose'?'写下你的收支':view==='result'?'记账完成':'核对金额与日期'}</h3><p>${view==='compose'?'一次写多笔，也可以记录循环费用':view==='result'?'服务器已确认写入账本':'只会入账你确认的金额与日期'}</p></div></div>`;
  list.hidden=view!=='compose';work.replaceChildren();result.replaceChildren();actions.replaceChildren();deletePrompt=false;
  if(view==='compose'){
   work.innerHTML=`<div class="input-zone"><label class="text-input-label">记账文字<textarea id="text-raw" rows="4" maxlength="10000" placeholder="今天午餐 35 元；昨天打车 18 元">${e(rawValue)}</textarea></label><p class="read-only-note">先核对，再入账。缺少的信息会留作草稿。</p></div>`;
   actions.innerHTML='<button class="button primary" data-text-action="parse">下一步 · 核对</button>';
  } else if(view==='result') {
   result.innerHTML=`<section class="flow-success" role="status"><span class="success-mark">${icon('checks',32)}</span><h3>已入账 · ${local?'本地已保存':'云端已保存'}</h3><strong class="preview-total money">${receipt.expense_minor&&receipt.income_minor?`支出 ${money(receipt.expense_minor)}<br>收入 ${money(receipt.income_minor)}`:`${receipt.expense_minor?'支出':'收入'} ${money(receipt.expense_minor||receipt.income_minor)}`}</strong><p>${receipt.count} 笔</p><p>${e(receipt.from)}${receipt.from!==receipt.to?` 至 ${e(receipt.to)}`:''}</p></section>`;
   actions.innerHTML='<button class="button secondary" data-text-action="new">再记一批</button><button class="button primary" data-text-action="view-bills">查看账单</button>';
  } else if(view==='preview') {
   const plan=preview;
   result.innerHTML=`<section class="text-preview-card"><h3>将新增 ${plan.count} 笔</h3><strong class="preview-total money">${plan.expense_minor&&plan.income_minor?`支出 ${money(plan.expense_minor)}<br>收入 ${money(plan.income_minor)}`:money(plan.expense_minor||plan.income_minor)}</strong><p>${plan.expense_minor?`支出 ${money(plan.expense_minor)}`:''}${plan.income_minor?` · 收入 ${money(plan.income_minor)}`:''}</p><p class="preview-range">${e(plan.entries.map(i=>i.occurred_on).sort()[0])} 至 ${e(plan.entries.map(i=>i.occurred_on).sort().at(-1))}</p><div class="preview-list">${plan.entries.map(i=>`<p><span>${e(i.occurred_on)} · ${e(i.note)}</span><b class="money">${money(i.amount_minor)}</b></p>`).join('')}</div>${plan.pending_count?`<p class="pending-note">另有 ${plan.pending_count} 项待补全，不会入账</p>`:''}${plan.duplicates?.length?`<p class="field-error">${plan.duplicates.length} 个日期已有同额账目。</p><label class="checkbox-label"><input type="checkbox" id="text-ack-duplicates"/>这是另外发生的收支</label>`:''}</section>`;
   actions.innerHTML=`<button class="button secondary" data-text-action="edit">返回修改</button><button class="button primary" data-text-action="confirm">确认入账 ${plan.count} 笔</button>`;
  } else {
   const plan=localPlan();
   work.innerHTML=items.map(item=>{
    const locked=lockedIds().has(item.id),row=plan.rows.find(r=>r.item.id===item.id),questions=item.questions.filter(q=>!fieldQuestion.test(q));
    const rangeMode=item.ongoing&&item.through_month?'conflict':item.ongoing?'ongoing':'through';
    return `<article class="text-candidate" data-item-id="${e(item.id)}"><div class="candidate-top"><h3>${e(item.title)}<small> · ${e(CYCLES[item.cycle])}</small></h3><span class="candidate-amount">${item.amount_minor?money(item.amount_minor):'待填金额'}</span></div>${locked?'<p class="read-only-note">已生成账目。修改金额或日期请到对应账单。</p>':''}<fieldset ${locked?'disabled':''}><div class="text-fields"><label>金额（元）<input inputmode="decimal" data-field="amount_minor" value="${item.amount_minor?decimal(item.amount_minor):''}"/></label><label>分类<select data-field="category_id"><option value="">请选择</option>${categories.filter(c=>c.type===item.type&&(!c.archived||c.id===item.category_id)).map(c=>`<option value="${e(c.id)}" ${c.id===item.category_id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>${item.cycle==='single'?`<label class="full-field">记账日期<input type="date" max="${currentDay}" data-field="occurred_on" value="${e(item.occurred_on||'')}"/></label>`:`<label>起始月<input type="month" data-field="start_month" value="${e(item.start_month||'')}"/></label><label>每月扣款日<input inputmode="numeric" type="number" min="1" max="31" data-field="charge_day" value="${item.charge_day||''}"/></label><label class="full-field">补记范围<select data-field="range_mode"><option value="conflict" ${rangeMode==='conflict'?'selected':''} ${rangeMode!=='conflict'?'hidden':''}>请选择一种范围</option><option value="through" ${rangeMode==='through'?'selected':''}>补记到指定月份</option><option value="ongoing" ${rangeMode==='ongoing'?'selected':''}>持续循环 · 仅记到今天</option></select></label>${rangeMode!=='ongoing'?`<label class="full-field">截止月（包含该月）<input type="month" data-field="through_month" value="${e(item.through_month||'')}"/></label>`:''}`}</div>${row?.missing.length?`<p class="pending-note">${icon('help',16)}${!item.start_month&&item.cycle!=='single'?'请补起始月与扣款日':item.ongoing&&item.through_month?'请选择补记范围':'还有信息待补全'} · 未入账</p>`:''}<details><summary>更多选项与原文</summary><div class="text-fields"><label>名称<input data-field="title" maxlength="80" value="${e(item.title)}"/></label><label>类型<select data-field="type">${['expense','income'].map(t=>`<option value="${t}" ${item.type===t?'selected':''}>${t==='expense'?'支出':'收入'}</option>`).join('')}</select></label><label>频率<select data-field="cycle">${Object.entries(CYCLES).map(([v,n])=>`<option value="${v}" ${v===item.cycle?'selected':''}>${e(n)}</option>`).join('')}</select></label>${item.cycle!=='single'?`<label>月末日期<select data-field="short_month"><option value="pending" ${item.short_month==='pending'?'selected':''}>不存在的日期待核对</option><option value="last_day" ${item.short_month==='last_day'?'selected':''}>使用该月最后一天</option></select></label>`:''}<label class="checkbox-label full-field"><input type="checkbox" data-field="selected" ${item.selected?'checked':''}/>包含这项</label></div><p>${e(item.raw)}</p>${questions.length?`<ul class="text-questions">${questions.map(q=>`<li>${e(q)}</li>`).join('')}</ul><label class="checkbox-label"><input type="checkbox" data-field="resolve_questions"/>我已核对这些疑问</label>`:''}</details></fieldset></article>`;
   }).join('');
   const paused=batch?.status==='paused';
   actions.innerHTML=`${plan.count&&!paused?`<button class="button secondary" data-text-action="save">存为草稿</button><button class="button primary" data-text-action="preview">核对 ${plan.count} 笔账目</button>`:`<button class="button primary" data-text-action="${paused?'resume':'save'}">${paused?'恢复此规则':'保存草稿 · 暂不入账'}</button>`}`;
   if(batch)work.insertAdjacentHTML('beforeend',`<div class="backup-actions">${!slots.length?'<button class="text-button delete-draft" data-text-action="delete">删除草稿</button>':`<button class="text-button" data-text-action="${paused?'resume':'pause'}">${paused?'恢复提醒':'暂停循环'}</button>`}<button class="text-button" data-text-action="new">返回列表</button></div>`);
  }
  if(pending){message('上次提交结果待核对，请用同一次提交重试。','error');actions.innerHTML='<button class="button primary" data-text-action="retry">核对保存结果</button>';}
  controls();
 }
 function readItems(){
  for(const item of items){const card=work.querySelector(`[data-item-id="${item.id}"]`);if(!card||lockedIds().has(item.id))continue;
   for(const input of card.querySelectorAll('[data-field]')){const field=input.dataset.field;
    if(field==='resolve_questions'){if(input.checked)item.questions=[];continue;}
    if(field==='range_mode'){if(input.value==='through')item.ongoing=false;else if(input.value==='ongoing'){item.ongoing=true;item.through_month=null;}continue;}
    if(field==='selected')item.selected=input.checked;else if(field==='amount_minor')item.amount_minor=input.value.trim()?parseAmount(input.value):null;else if(field==='charge_day')item.charge_day=input.value?Number(input.value):null;else item[field]=input.value||(['category_id','occurred_on','start_month','through_month'].includes(field)?null:'');
   }
   if(card.querySelector('[data-field=range_mode]')?.value==='ongoing')item.through_month=null;
   item.questions=item.questions.filter(q=>!fieldQuestion.test(q));
  }
  textItemsSchema.parse(items);persist();
 }
 async function loadList(){try{const data=await request('/text-batches');if(disposed)return;list.innerHTML=data.batches.length?`<h3>已保存的文字记录</h3>${data.batches.map(b=>`<button class="text-batch-row" data-text-action="open" data-id="${e(b.id)}"><span>${e(b.items.map(i=>i.title).join('、'))}<small>${b.status==='paused'?`已暂停 · 已生成 ${b.slots.length} 笔`:b.pending_count?`信息待补全 · 已生成 ${b.slots.length} 笔`:b.due_count?`${b.due_count} 笔待确认，尚未入账`:b.slots.length?`已入账 ${b.slots.length} 笔`:'草稿已保存 · 尚未入账'}</small></span><span class="status-pill ${b.status==='paused'?'paused':!b.pending_count&&!b.due_count&&b.slots.length?'saved':''}">${b.status==='paused'?'已暂停':b.pending_count?'待补全':b.due_count?'待确认':b.slots.length?'已入账':'待核对'}</span>${icon('right',16)}</button>`).join('')}`:'';controls();}catch(error){if(!disposed){list.innerHTML=`<p class="field-error">文字记录暂未取得：${e(error.message)}</p><button class="button secondary" data-text-action="list-retry">重试</button>`;}}}
 async function send(path,body,method='POST'){const op=pending||{path,body,method,key:crypto.randomUUID()};pending=op;persist();controls();const value=await mutate(op.path,op.body,{method:op.method,key:op.key});pending=null;persist();return value;}
 async function save(){readItems();const body={original_text:original,items};const value=await send(batch?`/text-batches/${batch.id}`:'/text-batches',batch?{...body,version:batch.version}:body,batch?'PATCH':'POST');batch=value.batch;items=batch.items;persist();}
 async function refreshAfterWrite(){try{await onSaved();}catch{message('保存已完成，账单暂未刷新；可重新打开查看。','error');}}
 async function showSuccess(value){receipt=value;view='result';batch=null;items=[];slots=[];preview=null;original='';rawValue='';sessionStorage.removeItem(draftKey);message('');render();await refreshAfterWrite();}
 async function handle(event){const button=event.target.closest('[data-text-action]');if(!button||button.disabled||busy)return;const action=button.dataset.textAction;if(pending&&action!=='retry')return;busy=true;controls();
  try {
   if(action==='parse'){rawValue=work.querySelector('#text-raw').value;original=rawValue;items=parseTextRecords(original,currentDay);batch=null;slots=[];preview=null;view='review';message('');persist();render();}
   if(action==='new'){batch=null;items=[];original='';rawValue='';slots=[];preview=null;view='compose';receipt=null;message('');sessionStorage.removeItem(draftKey);render();await loadList();}
   if(action==='open'){const data=await request('/text-batches');const b=data.batches.find(b=>b.id===button.dataset.id);if(!b)throw new Error('记录已不存在，请刷新列表');batch=b;items=b.items;slots=b.slots;original=b.original_text;rawValue=original;preview=null;view='review';message(b.status==='paused'?'此规则已暂停。':'');persist();render();}
   if(action==='edit'){view='review';preview=null;message('');render();}
   if(action==='save'||action==='preview'){await save();if(action==='preview'){preview=await request(`/text-batches/${batch.id}/preview`,{method:'POST',body:{}});if(preview.count){view='preview';message('');}else{view='review';message('草稿已保存，0 笔入账；请补齐信息。');}}else{view='review';const count=localPlan().count;message(count?`草稿已保存，${count} 笔尚未确认入账。`:'草稿已保存，0 笔入账；请补齐信息。');}render();await loadList();await refreshAfterWrite();}
   if(action==='confirm'){if(!preview||!batch)throw new Error('请重新核对日期和金额');const value=await send(`/text-batches/${batch.id}/confirm`,{version:batch.version,preview_hash:preview.preview_hash,acknowledge_duplicates:Boolean(container.querySelector('#text-ack-duplicates')?.checked)});await showSuccess(value);}
   if(action==='view-bills'&&receipt){onViewBills({from:receipt.from,to:receipt.to});}
   if(action==='pause'||action==='resume'){const value=await send(`/text-batches/${batch.id}/status`,{version:batch.version,status:action==='pause'?'paused':'active'});batch.version=value.version;batch.status=value.status;message(action==='pause'?'已暂停，已有账目保留。':'已恢复提醒，确认后才会入账。');persist();render();await refreshAfterWrite();}
   if(action==='delete'){deletePrompt=true;message('删除这份未入账草稿？不会删除任何账单。');actions.innerHTML='<button class="button secondary" data-text-action="cancel-delete">保留草稿</button><button class="button danger-button" data-text-action="confirm-delete">删除草稿</button>';}
   if(action==='cancel-delete'){message('');render();}
   if(action==='confirm-delete'&&deletePrompt){await send(`/text-batches/${batch.id}`,{version:batch.version},'DELETE');batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('草稿已删除');render();await loadList();await refreshAfterWrite();}
   if(action==='retry'){const op=pending;const value=await send(op.path,op.body,op.method);if(op.path.endsWith('/confirm'))await showSuccess(value);else if(value.batch){batch=value.batch;items=batch.items;original=batch.original_text;rawValue=original;view='review';message('草稿已保存，尚未入账。');render();await loadList();await refreshAfterWrite();}else{batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('提交结果已核对');render();await loadList();await refreshAfterWrite();}}
   if(action==='list-retry')await loadList();
  }catch(error){message(error.message,'error');if(error.code!=='NETWORK'&&!(error.status>=500))pending=null;persist();if(pending){actions.innerHTML='<button class="button primary" data-text-action="retry">核对保存结果</button>';} }
  finally{busy=false;if(!disposed)controls();}
 }
 function change(event){if(event.target.id==='text-raw'){rawValue=event.target.value;persist();return;}if(event.target.closest('[data-item-id]')){try{readItems();preview=null;render();}catch(error){message(error.message,'error');}}}
 function input(event){if(event.target.id==='text-raw'){rawValue=event.target.value;persist();}}
 container.addEventListener('click',handle);container.addEventListener('change',change);container.addEventListener('input',input);
 render();loadList();
 return ()=>{if(view!=='result')persist();disposed=true;container.removeEventListener('click',handle);container.removeEventListener('change',change);container.removeEventListener('input',input);container.replaceChildren();};
}
