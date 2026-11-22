import { validDate, today } from './format.js';
export const RANGE_LIMIT=1000;
export function monthEnd(month){const [y,m]=month.split('-').map(Number);return `${month}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;}
export function calendarDays(month,ranges=[],dates=[],current=today()){
 const days=Number(monthEnd(month).slice(8));
 return Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;
  return {date,status:date>current?'future':ranges.some(r=>r.from<=date&&r.to>=date)?'complete':'pending',count:dates.filter(d=>d.date===date).reduce((n,d)=>n+d.count,0)};
 });
}
export function calendarMonths(year,ranges=[],dates=[]){
 return Array.from({length:12},(_,i)=>{const month=`${year}-${String(i+1).padStart(2,'0')}`,end=monthEnd(month);let covered=0;
  for(let n=1;n<=Number(end.slice(8));n++){const date=`${month}-${String(n).padStart(2,'0')}`;if(ranges.some(r=>r.from<=date&&r.to>=date))covered++;}
  return {month,covered,days:Number(end.slice(8)),recorded:dates.filter(d=>d.date.startsWith(month)).reduce((n,d)=>n+d.count,0)};
 });
}
// Deliberately accept explicit years only; vague or conflicting speech stays editable.
export function parseCoverageRange(raw,current=today()){
 const normalized=raw.normalize('NFKC').replace(/\s+/g,'');
 if(/之前|之后|以前|以后|不是|改为|改成|或者|可能|大概|不确定|还没|未完成/.test(normalized))return null;
 const matches=[...normalized.matchAll(/(\d{4})(?:年|-|\/)(\d{1,2})(?:(?:月|-|\/)(\d{1,2})日?|月)?/g)];
 if(matches.length<1||matches.length>2)return null;
 const remainder=normalized.replace(/(\d{4})(?:年|-|\/)(\d{1,2})(?:(?:月|-|\/)(\d{1,2})日?|月)?/g,'');
 if(/[0-9年月日]/.test(remainder)||(matches.length===1&&/到|至|~|—/.test(remainder)))return null;
 const values=matches.map(m=>({month:`${m[1]}-${m[2].padStart(2,'0')}`,day:m[3]?.padStart(2,'0')}));
 const a=values[0],b=values.at(-1),from=`${a.month}-${a.day||'01'}`,to=b.day?`${b.month}-${b.day}`:monthEnd(b.month);
 if(!validDate(from)||!validDate(to)||from>to||to>current)return null;
 return {from,to};
}
