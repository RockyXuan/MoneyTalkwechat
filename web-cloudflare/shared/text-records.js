import { parseAmount, validDate, today, shiftMonth, exactSum } from './format.js';

export const CYCLES = { single: '单笔', monthly: '每月', quarterly: '每季度', yearly: '每年', unknown: '待确认' };
export const validMonth = s => /^\d{4}-\d{2}$/.test(s || '') && validDate(`${s}-01`);
const dateToken = '(?:19|20)\\d{2}|\\d{2}';
function dates(text) {
  return [...text.matchAll(new RegExp(`(?<!\\d)(${dateToken})\\s*(?:年|-)\\s*(\\d{1,2})\\s*(?:月|-)(?:\\s*(\\d{1,2})\\s*[日号]?)?`, 'g'))].map(m => ({ text:m[0], index:m.index, year:Number(m[1]) < 100 ? 2000 + Number(m[1]) : Number(m[1]), month:Number(m[2]), day:m[3] ? Number(m[3]) : null }));
}
const monthOf = d => `${d.year}-${String(d.month).padStart(2,'0')}`;
export function parseTextRecords(raw, currentDay = today()) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 10000) throw new Error('请填写 1–10,000 字的文字');
  const parts = raw.split(/[\n；;。]+/).map(x=>x.trim()).filter(Boolean);
  const clauses = [];
  let inheritedDate=null;
  for (const part of parts) {
    const chunks=part.split(/[,，](?!\d{3}(?:[.,元]|$))/).map(x=>x.trim()).filter(Boolean);
    let prefix='';
    for(let at=0;at<chunks.length;at++){
      let chunk=chunks[at];
      let masked=chunk;
      for(const d of dates(chunk))masked=masked.replace(d.text,'');
      masked=masked.replace(/\d{2,4}\s*年|(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');
      const priced=/[+-]?\d+(?:\.\d+)?(?:元|块)?/.test(masked);
      if(at===0&&!priced&&/^(?:从|今天|昨日|昨天|前天|截至|截止)/.test(chunk)&&chunks.length>1){prefix=chunk;continue;}
      if(prefix){chunk=prefix+'，'+chunk;prefix='';}
      if(clauses.length&&(!priced||/^(?:然后|之后|先记到|暂时|可能|大概|提醒|一共|合计|总共)/.test(chunk)))clauses[clauses.length-1]+='，'+chunk;
      else clauses.push(chunk);
    }
  }
  if (clauses.length > 40) throw new Error('一次最多 40 项，请分批核对');
  return clauses.map((raw, index) => {
    const item = { id:`item-${index + 1}`, raw, title:'', type:/收入|工资|奖金|收到了|收到/.test(raw) && !/退款/.test(raw) ? 'income':'expense', amount_minor:null, category_id:null, cycle:/每季度|季付/.test(raw) ? 'quarterly':/每年|年付|年扣/.test(raw) ? 'yearly':/每月|每个月|月付|月扣/.test(raw) ? 'monthly':/每周|每天|每两|隔月/.test(raw) ? 'unknown':'single', occurred_on:null, start_month:null, through_month:null, charge_day:null, short_month:'pending', ongoing:false, questions:[], selected:true };
    const foundDates = dates(raw);
    const explicitRelative=raw.match(/前天|昨天|今天|今日/);
    if(explicitRelative) inheritedDate=explicitRelative[0];
    let masked = raw;
    for (const d of foundDates) masked = masked.replace(d.text,' '.repeat(d.text.length));
    masked = masked.replace(/\d{2,4}\s*年/g,'').replace(/(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');
    const amounts = [...masked.matchAll(/(?<![\d.])(?:[¥￥]\s*)?([+-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(元|块|人民币|美元|美金|港币))?/g)];
    if (amounts.length === 1 && !/美元|美金|港币|USD|HKD|欧元|EUR/.test(raw)) {
      try { item.amount_minor=parseAmount(amounts[0][1]); } catch { item.questions.push('金额无效，需要重新确认'); }
    } else item.questions.push(amounts.length > 1 ? '有多个数字或金额，需拆成独立项目并核对' : '金额或币种待确认');
    if (/可能|大概|忘了|不记得|不确定/.test(raw)) item.questions.push('原文包含不确定信息，请核对相关字段');
    if (/退款|还款|取消|停订|停止|涨价|改为|改成|不算|不要/.test(raw)) item.questions.push('涉及退款、还款、取消或修改，暂不按新增消费处理');
    if (item.cycle === 'single') {
      const d=foundDates.find(d=>d.day);
      if (d) item.occurred_on=`${monthOf(d)}-${String(d.day).padStart(2,'0')}`;
      else if (/前天/.test(raw)) item.occurred_on=new Date(Date.parse(`${currentDay}T00:00:00Z`)-172800000).toISOString().slice(0,10);
      else if (/昨天/.test(raw)) item.occurred_on=new Date(Date.parse(`${currentDay}T00:00:00Z`)-86400000).toISOString().slice(0,10);
      else if (/今天|今日/.test(raw)) item.occurred_on=currentDay;
      if (!item.occurred_on && inheritedDate && index>0 && item.cycle==='single') {
        const offset={'今天':0,'今日':0,'昨天':1,'前天':2}[inheritedDate];
        item.occurred_on=new Date(Date.parse(`${currentDay}T00:00:00Z`)-offset*86400000).toISOString().slice(0,10);
        item.questions.push('日期沿用同段前一项，请确认日期语境');
      }
      if (!item.occurred_on) item.questions.push('记账日期未说明');
    } else {
      const start=foundDates.find(d=>/从\s*$/.test(raw.slice(0,d.index)) || /开始|起订|起算/.test(raw.slice(d.index+d.text.length,d.index+d.text.length+5)));
      const end=foundDates.find(d=>/到|截至|截止/.test(raw.slice(Math.max(0,d.index-8),d.index)));
      if (start) item.start_month=monthOf(start);
      if (end) item.through_month=monthOf(end);
      const day=raw.match(/(?:每月|每个月)\s*(\d{1,2})\s*[日号]/);
      if (day) item.charge_day=Number(day[1]);
      item.ongoing=/持续|一直|以后每|今后每|不断|继续每/.test(raw) && !end;
      if (!item.start_month) item.questions.push('起始月未知，不能计算历史条数');
      if (!item.charge_day) item.questions.push('扣款日未知，不能用每月 1 日代替');
      if (!item.through_month && !item.ongoing) item.questions.push('补记截止月或持续循环方式待确认');
    }
    let title=raw.split(/[,，]/).find(part=>{let core=part;for(const d of dates(part))core=core.replace(d.text,'');core=core.replace(/(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');return /[+-]?\d/.test(core)&&! /^(?:然后|之后|先记到|暂时|可能|大概|提醒|一共|合计|总共)/.test(part);})||raw.split(/[,，]/)[0];
    for (const d of foundDates) title=title.replace(d.text,'');
    title=title.replace(/(?:每月|每个月)\s*\d{1,2}\s*[日号]/g,'').replace(/每个月|每月|每季度|每年|月付|年付|季付|今天|昨天|前天|先帮我|帮我|记录|记一下|记一笔|支出|收入|每|花了|花|付了|付|有|元|块|人民币|工资到账|收到|从|开始/g,'').replace(/[¥￥]?\s*[+-]?\d+(?:,\d{3})*(?:\.\d+)?/g,'').replace(/^[的\s]+|[的\s]+$/g,'').trim();
    item.title=title.slice(0,80) || (item.type==='income'?'收入待命名':'项目待命名');
    if (item.type==='income') item.category_id=/工资/.test(raw)?'salary':/奖金/.test(raw)?'bonus':'other-income';
    else item.category_id=/餐|饭|吃|咖啡|奶茶/.test(title)?'food':/车|地铁|公交|打车/.test(title)?'transport':/房租/.test(title)?'housing':'other';
    if (foundDates.some(d=>!validMonth(monthOf(d)))) item.questions.push('原文日期无效');
    return item;
  });
}
export function compileTextItems(items, currentDay=today(), slots=[]) {
  const done = new Set(slots.map(s=>`${s.item_id}|${s.occurred_on}`));
  const rows=items.filter(i=>i.selected).map(item=>{
    const missing=[...item.questions], entries=[];
    if (!item.title.trim()) missing.push('名称待补全');
    if (!item.amount_minor) missing.push('金额待补全');
    if (!item.category_id) missing.push('分类待补全');
    if (item.cycle==='single') {
      if (!validDate(item.occurred_on || '') || item.occurred_on > currentDay) missing.push('日期须为今天或之前的有效日期');
      if (!missing.length && !done.has(`${item.id}|${item.occurred_on}`)) entries.push({item_id:item.id, occurred_on:item.occurred_on});
    } else if (['monthly','quarterly','yearly'].includes(item.cycle)) {
      const end=item.ongoing ? currentDay.slice(0,7):item.through_month;
      if (!validMonth(item.start_month)) missing.push('起始月待确认');
      if (!validMonth(end)) missing.push('截止月待确认');
      if (!Number.isInteger(item.charge_day) || item.charge_day<1 || item.charge_day>31) missing.push('扣款日待确认');
      if (validMonth(end) && validMonth(item.start_month) && item.start_month>end) missing.push('起始月晚于截止月');
      if (!missing.length) {
        const interval={monthly:1,quarterly:3,yearly:12}[item.cycle];
        for (let month=item.start_month, n=0;month<=end;month=shiftMonth(month,interval),n++) {
          if(n>=120) {missing.push('展开超过 120 笔，请缩小范围');break;}
          const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
          if(item.charge_day>last && item.short_month!=='last_day') {missing.push(`${month} 没有 ${item.charge_day} 日，请确认是否使用月末`);break;}
          const day=`${month}-${String(Math.min(last,item.charge_day)).padStart(2,'0')}`;
          if(day>currentDay || done.has(`${item.id}|${day}`)) continue;
          entries.push({item_id:item.id,occurred_on:day});
        }
      }
    } else missing.push('当前周期尚未支持，请改为单笔或月／季／年循环');
    return {item, missing:[...new Set(missing)], entries:missing.length?[]:entries};
  });
  const entries=rows.flatMap(r=>r.entries.map(e=>({...e,type:r.item.type,amount_minor:r.item.amount_minor,category_id:r.item.category_id,note:r.item.title})));
  if(entries.length>120) throw new Error('本批超过 120 笔，请按范围分批');
  return {rows,entries,count:entries.length,expense_minor:exactSum(entries.filter(e=>e.type==='expense').map(e=>e.amount_minor)),income_minor:exactSum(entries.filter(e=>e.type==='income').map(e=>e.amount_minor)),pending_count:rows.filter(r=>r.missing.length).length};
}
