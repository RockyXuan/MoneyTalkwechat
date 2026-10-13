import { titleSource, tagPlatformItems } from './platform-sources.js';
import { categorySuggestion, spokenCategory } from './category-suggestions.js';
import { parseAmount, validDate, validRecordDate, today, shiftMonth, exactSum } from './format.js';

export const CYCLES = { single: '单笔', monthly: '每月', quarterly: '每季度', yearly: '每年', unknown: '待确认' };
export const validMonth = s => /^\d{4}-\d{2}$/.test(s || '') && validDate(`${s}-01`);
const dateToken = '(?:19|20)\\d{2}|\\d{2}';
function dates(text) {
  return [...text.matchAll(new RegExp(`(?<!\\d)(${dateToken})\\s*(?:年|-)\\s*(\\d{1,2})\\s*(?:月|-)(?:\\s*(\\d{1,2})\\s*[日号]?)?`, 'g'))].map(m => ({ text:m[0], index:m.index, year:Number(m[1]) < 100 ? 2000 + Number(m[1]) : Number(m[1]), month:Number(m[2]), day:m[3] ? Number(m[3]) : null }));
}
const monthOf = d => `${d.year}-${String(d.month).padStart(2,'0')}`;
// Keep source spans so segmentation never loses punctuation, whitespace or trailing text.
function textClauses(raw) {
  const clauses=[];
  let prefix=null;
  for(const sentence of raw.matchAll(/[^\n；;。]+/g)) {
    const chunks=[];let at=sentence.index,sentenceHasPrice=false;
    for(const comma of sentence[0].matchAll(/[,，](?!\d{3}(?:[.,元]|$))/g)) {
      chunks.push({start:at,end:sentence.index+comma.index});at=sentence.index+comma.index+comma[0].length;
    }
    chunks.push({start:at,end:sentence.index+sentence[0].length});
    for(const span of chunks) {
      const chunk=raw.slice(span.start,span.end).trim();if(!chunk)continue;
      let masked=chunk;for(const d of dates(chunk))masked=masked.replace(d.text,'');
      masked=masked.replace(/\d{2,4}\s*年|(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');
      const priced=/[+-]?\d+(?:\.\d+)?(?:元|块)?/.test(masked);
      const context=titleSource(chunk)?chunk.replace(/^\s*[^·：:]+?\s*[·：:]\s*/,''):chunk;
      const header=!priced&&/^(?:从|今天|今日|昨日|昨天|前天|上个月|本月|\d{2,4}年|分类|归到|归入)/.test(context);
      if(header&&sentenceHasPrice&&/^(?:从|截至|截止)/.test(context)){clauses.at(-1).end=span.end;continue;}
      if(priced)sentenceHasPrice=true;
      if(header){prefix=prefix?{start:prefix.start,end:span.end}:span;continue;}
      if(prefix&&!priced){prefix.end=span.end;continue;}
      const start=prefix?prefix.start:span.start;prefix=null;
      if(clauses.length&&(!priced||/^(?:然后|之后|先记到|暂时|可能|大概|提醒|一共|合计|总共)/.test(chunk)))clauses.at(-1).end=span.end;
      else clauses.push({start,end:span.end});
    }
  }
  if(prefix)clauses.push(prefix);
  return clauses.map(span=>({...span,raw:raw.slice(span.start,span.end).trim()}));
}
export function parseTextRecords(raw, currentDay = today(), categories = null) {
  return parseRecords(raw,currentDay,categories,10000,40);
}
function parseRecords(raw,currentDay,categories,maxChars,maxItems,inheritPlatform=false) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > maxChars) throw new Error(`请填写 1–${maxChars.toLocaleString('en-US')} 字的文字，原文不会截断`);
  const clauses=textClauses(raw).map(s=>s.raw);
  if(!clauses.length)throw new Error('没有识别到项目，请补充商品和金额；原文仍保留');
  if (clauses.length > maxItems) throw new Error(`一次最多 ${maxItems} 项，请分批核对；原文仍保留`);
  let inheritedDate=null,inheritedCategory=null,inheritedPlatform=null;
  const parsed=clauses.map((raw,index) => {
    const item = { id:`item-${index + 1}`, raw, title:'', type:/收入|工资|奖金|收到了|收到/.test(raw) && !/退款/.test(raw) ? 'income':'expense', amount_minor:null, category_id:null, cycle:/每季度|季付/.test(raw) ? 'quarterly':/每年|年付|年扣/.test(raw) ? 'yearly':/每月|每个月|月付|月扣/.test(raw) ? 'monthly':/每周|每天|每两|隔月/.test(raw) ? 'unknown':'single', occurred_on:null, start_month:null, through_month:null, charge_day:null, short_month:'pending', ongoing:false, questions:[], selected:true };
    const explicitCategory=categories?spokenCategory(raw,categories,item.type):null;
    if(explicitCategory)inheritedCategory={name:explicitCategory.name,type:item.type};
    const spoken=explicitCategory||(inheritedCategory?.type===item.type?{name:inheritedCategory.name,token:''}:null);
    const ownPlatform=titleSource(raw);if(ownPlatform)inheritedPlatform=ownPlatform;
    const foundDates = dates(raw);
    if (!foundDates.length) {
      const short=raw.match(/(?<!\d)(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?/);
      if(short)foundDates.push({text:short[0],index:short.index,year:Number(currentDay.slice(0,4))+(raw.includes('明年')?1:raw.includes('前年')?-2:raw.includes('去年')?-1:0),month:Number(short[1]),day:short[2]?Number(short[2]):null});
    }
    let masked = raw;
    for (const d of foundDates) masked = masked.replace(d.text,' '.repeat(d.text.length));
    masked = masked.replace(/\d{2,4}\s*年/g,'').replace(/(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');
    const amounts = [...masked.matchAll(/(?<![\d.])(?:[¥￥]\s*)?([+-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(元|块|人民币|美元|美金|港币))?/g)];
    if (amounts.length === 1 && !/美元|美金|港币|USD|HKD|欧元|EUR/.test(raw)) {
      try { item.amount_minor=parseAmount(amounts[0][1]); } catch { item.questions.push('金额无效，需要重新确认'); }
    } else item.questions.push(amounts.length > 1 ? '有多个数字或金额，需拆成独立项目并核对' : '金额或币种待确认');
    if (/可能|大概|忘了|不记得|不确定/.test(raw)) item.questions.push('原文包含不确定信息，请核对相关字段');
    if (/退款|还款|取消|停订|停止|涨价|改为|改成|不算|不要|更正|不是|上一笔|刚才/.test(raw)) item.questions.push('涉及退款、还款、取消或修改，暂不按新增消费处理');
    if (item.cycle === 'single') {
      const d=foundDates.find(d=>d.day);
      if (d) item.occurred_on=`${monthOf(d)}-${String(d.day).padStart(2,'0')}`;
      else if (/前天/.test(raw)) item.occurred_on=new Date(Date.parse(`${currentDay}T00:00:00Z`)-172800000).toISOString().slice(0,10);
      else if (/昨天/.test(raw)) item.occurred_on=new Date(Date.parse(`${currentDay}T00:00:00Z`)-86400000).toISOString().slice(0,10);
      else if (/今天|今日/.test(raw)) item.occurred_on=currentDay;
      if (!item.occurred_on && foundDates.length) item.occurred_on=monthOf(foundDates[0]);
      if (!item.occurred_on && /上上月|上个月|上月/.test(raw)) item.occurred_on=shiftMonth(currentDay.slice(0,7),raw.includes('上上月')?-2:-1);
      if (!item.occurred_on && /本月|这个月|这月/.test(raw)) item.occurred_on=currentDay.slice(0,7);
      const unknownPeriod=/去年|前年|上周|上星期|上季度|上季|前几个月|明年|下个月|下月/.test(raw)&&!foundDates.length;
      if(unknownPeriod){inheritedDate=null;item.questions.push('日期范围待确认，请选择实际月份');}
      if(item.occurred_on)inheritedDate=item.occurred_on;
      else if(inheritedDate&&!unknownPeriod){item.occurred_on=inheritedDate;item.questions.push('日期沿用同段前一项，请确认日期语境');}
      if(!item.occurred_on)item.occurred_on=currentDay.slice(0,7);
    } else {
      const start=foundDates.find(d=>/从\s*$/.test(raw.slice(0,d.index)) || /开始|起订|起算/.test(raw.slice(d.index+d.text.length,d.index+d.text.length+5)));
      const end=foundDates.find(d=>/到|截至|截止/.test(raw.slice(Math.max(0,d.index-8),d.index)));
      if (start) item.start_month=monthOf(start);
      if (end) item.through_month=monthOf(end);
      const day=raw.match(/(?:每月|每个月)\s*(\d{1,2})\s*[日号]/);
      if (day) item.charge_day=Number(day[1]);
      item.date_precision=day?'day':'month';
      item.ongoing=/持续|一直|以后每|今后每|不断|继续每/.test(raw) && !end;
      if (!item.start_month) item.questions.push('起始月未知，不能计算历史条数');

      if (!item.through_month && !item.ongoing) item.questions.push('补记截止月或持续循环方式待确认');
    }
    let title=raw.split(/[,，]/).find(part=>{let core=part;for(const d of dates(part))core=core.replace(d.text,'');core=core.replace(/(?:每月|每个月)?\s*\d{1,2}\s*[日号]/g,'');return /[+-]?\d/.test(core)&&! /^(?:然后|之后|先记到|暂时|可能|大概|提醒|一共|合计|总共)/.test(part);})||raw.split(/[,，]/)[0];
    for (const d of foundDates) title=title.replace(d.text,'');
    title=title.replace(/(?:每月|每个月)\s*\d{1,2}\s*[日号]/g,'').replace(/上个月|上月|本月|这个月|去年|前年|每个月|每月|每季度|每年|月付|年付|季付|今天|昨天|前天|先帮我|帮我|记录|记一下|记一笔|支出|收入|每|花了|花|付了|付|有|元|块|人民币|工资到账|收到|从|开始/g,'').replace(/[¥￥]?\s*[+-]?\d+(?:,\d{3})*(?:\.\d+)?/g,'').replace(/^[的\s]+|[的\s]+$/g,'').trim();
    if(spoken?.token)title=title.replace(spoken.token,'').trim();
    item.title=title.slice(0,80) || (item.type==='income'?'收入待命名':'项目待命名');
    if (item.type==='income') item.category_id=/工资/.test(raw)?'salary':/奖金/.test(raw)?'bonus':'other-income';
    else item.category_id=/餐|饭|吃|咖啡|奶茶/.test(title)?'food':/车|地铁|公交|打车/.test(title)?'transport':/房租/.test(title)?'housing':'other';
    if (foundDates.some(d=>!validMonth(monthOf(d)))) item.questions.push('原文日期无效');
    inheritedPlatform=titleSource(item.title)||inheritedPlatform;
    const platform=ownPlatform||(inheritPlatform?inheritedPlatform:null);
    const tagged=platform?tagPlatformItems([item],platform)[0]:item;
    if(spoken)return categorySuggestion(tagged,categories,spoken.name);
    if(categories&&!categories.some(c=>c.id===item.category_id&&c.type===item.type&&!c.archived))item.category_id=null;
    return tagged;
  });
  for(let i=1;i<parsed.length;i++)if(/刚才|上一笔|更正|不是|改为|改成/.test(parsed[i].raw)){const named=parsed.slice(0,i).filter(p=>parsed[i].raw.includes(p.title.replace(/^.*? · /,'')));for(const prior of named.length?named:[parsed[i-1]])prior.questions.push('后文有改口或更正，请核对本项是否还应入账');}
  return parsed;
}

export const LONG_TEXT_LIMIT=50000;
export const LONG_ITEM_LIMIT=400;
export function parseTextIntake(raw,currentDay=today(),categories=null,{inheritPlatform=true}={}) {
  const items=parseRecords(raw,currentDay,categories,LONG_TEXT_LIMIT,LONG_ITEM_LIMIT,inheritPlatform),spans=textClauses(raw);
  const segments=[];let start=0,first=0;
  for(let n=0;n<items.length;n++){
    const end=n+1<items.length?spans[n+1].start:raw.length;
    if(end-start>10000){
      if(n===first)throw new Error('某一项原文超过 10,000 字，请在完整项目之间分段；原文仍保留');
      const cut=spans[n].start;segments.push({original_text:raw.slice(start,cut),items:items.slice(first,n)});start=cut;first=n;
      if(end-start>10000)throw new Error('某一项原文超过 10,000 字，请在完整项目之间分段；原文仍保留');
    }
    if(n-first+1===40||n===items.length-1){segments.push({original_text:raw.slice(start,end),items:items.slice(first,n+1)});start=end;first=n+1;}
  }
  return {segments,count:items.length,anchor_day:currentDay};
}
export function compileTextItems(items, currentDay=today(), slots=[]) {
  const done = new Set(slots.map(s=>`${s.item_id}|${s.occurred_on}`));
  const rows=items.filter(i=>i.selected).map(item=>{
    const missing=[...item.questions], entries=[];
    if (!item.title.trim()) missing.push('名称待补全');
    if (!item.amount_minor) missing.push('金额待补全');
    if(item.category_hint&&!item.category_hint.resolved)missing.push(`请选择“${item.category_hint.name}”的分类建议`);
    if (!item.category_id) missing.push('分类待补全');
    if (item.cycle==='single') {
      if (!validRecordDate(item.occurred_on || '') || item.occurred_on > currentDay) missing.push('日期须为本月或之前的有效月份，或今天之前的日期');
      if (!missing.length && !done.has(`${item.id}|${item.occurred_on}`)) entries.push({item_id:item.id, occurred_on:item.occurred_on});
    } else if (['monthly','quarterly','yearly'].includes(item.cycle)) {
      const end=item.ongoing ? currentDay.slice(0,7):item.through_month;
      if (item.ongoing && item.through_month) missing.push('请选择补记截止月，或持续到今天；两种范围不能同时使用');
      if (!validMonth(item.start_month)) missing.push('起始月待确认');
      if (!validMonth(end)) missing.push('截止月待确认');
      const monthPrecision=item.date_precision==='month';
      if (!monthPrecision && (!Number.isInteger(item.charge_day) || item.charge_day<1 || item.charge_day>31)) missing.push('扣款日待确认');
      if (validMonth(end) && validMonth(item.start_month) && item.start_month>end) missing.push('起始月晚于截止月');
      if (!missing.length) {
        const interval={monthly:1,quarterly:3,yearly:12}[item.cycle];
        for (let month=item.start_month, n=0;month<=end;month=shiftMonth(month,interval),n++) {
          if(n>=120) {missing.push('展开超过 120 笔，请缩小范围');break;}
          const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
          if(!monthPrecision && item.charge_day>last && item.short_month!=='last_day') {missing.push(`${month} 没有 ${item.charge_day} 日，请确认是否使用月末`);break;}
          const day=monthPrecision?month:`${month}-${String(Math.min(last,item.charge_day)).padStart(2,'0')}`;
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
