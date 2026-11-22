import { compileDraftItems, validMonth } from './text-records.js';
import { tagPlatformItems,batchSources,sourceTitle } from './platform-sources.js';
import { parseAmount, today } from './format.js';
export function recordedExpense(slots){
 const live=slots.filter(s=>!s.deleted_at);
 if(live.some(s=>!Number.isSafeInteger(s.amount_minor)||!['expense','income'].includes(s.type)))return null;
 return live.filter(s=>s.type==='expense').reduce((sum,s)=>sum+s.amount_minor,0);
}
export function subscriptionItem(value){
 const amount=parseAmount(value.amount),title=value.title.trim();
 if(!title||title.length>64)throw new Error('请填写 1–64 字的订阅名称');
 if(!['monthly','yearly'].includes(value.cycle))throw new Error('请选择每月或每年');
 const ongoing=value.status==='ongoing';
 if(!validMonth(value.start)||(!ongoing&&(!validMonth(value.end)||value.start>value.end)))throw new Error('请填写有效起止月份，开始不能晚于结束');
 const item={id:'item-1',raw:`${title}，${value.cycle==='monthly'?'每月':'每年'}${value.amount}元，从${value.start}${ongoing?'开始，持续订阅，每期自动记账':`到${value.end}`}`,title,type:'expense',amount_minor:amount,category_id:value.category||null,cycle:value.cycle,occurred_on:null,start_month:value.start,through_month:ongoing?null:value.end,date_precision:'month',charge_day:null,short_month:'pending',ongoing,...(ongoing?{auto_record:true}:{}),questions:[],selected:true};
 const plan=compileDraftItems([item],today());const blocking=plan.rows[0].missing.filter(m=>m!=='分类待补全');if(blocking.length)throw new Error(blocking.join('；'));
 return tagPlatformItems([item],value.source)[0];
}
export function subscriptionRows(batches,current=today()){
 return batches.flatMap(b=>batchSources(b).filter(({item})=>item.cycle!=='single').map(({item,source})=>{
  const slots=(b.slots||[]).filter(s=>s.item_id===item.id),live=slots.filter(s=>!s.deleted_at),plan=compileDraftItems([item],current,slots);
  return {batch_id:b.id,version:b.version,paused:b.status==='paused',single_rule:b.items.length===1,id:item.id,title:sourceTitle(item.title),source,cycle:item.cycle,spending_label:item.spending_label||null,amount_minor:item.amount_minor,recorded_expense_minor:recordedExpense(slots),start:item.start_month,end:item.through_month,ongoing:item.ongoing,auto_record:item.auto_record===true,status:b.status==='paused'?'已暂停':!item.selected?'未纳入':plan.pending_count?'待补全':item.start_month>current.slice(0,7)?'尚未开始':plan.count?'待核对':slots.length>live.length?'有删除记录':item.through_month&&item.through_month<current.slice(0,7)?'历史记录':'已核对本期',confirmed:live.length,deleted:slots.length-live.length,due:plan.count,missing:plan.rows[0]?.missing||[],dates:live.map(s=>s.current_occurred_on||s.occurred_on)};
 }));
}
