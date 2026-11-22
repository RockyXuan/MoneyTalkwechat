import { sourceCalendar } from './source-calendar-ui.js';
import { platformBoard } from '../shared/platform-board.js';
import { escape as e, icon } from './ui.js';

const marks={淘宝:['淘','#f07d30'],支付宝:['支','#2685dc'],微信:['微','#21996b'],拼多多:['拼','#d75a6a'],京东:['京','#b05b75'],抖音:['抖','#565d82']};
const recordedDate=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric'}).format(new Date(value)):'';
function stateLabel(row){const p=row.progress;return row.status==='paused'?'已暂停':p.total_items===0?'未纳入':`${p.confirmed_items}/${p.total_items} 已确认`;}
function statusClass(row){return row.status==='paused'?'paused':row.progress.total_items&&row.progress.confirmed_items===row.progress.total_items&&!row.needs_review?'saved':'pending';}
export function platformCards(state){
 if(!state.textSummary)return '<section class="card batch-history"><h2>平台记账进度</h2><p role="status">正在读取进度…</p></section>';
 const board=state.textSummary.platforms||platformBoard(state.textSummary.batches||[]);
 const selected=board.some(g=>g.source===state.platformSource)?state.platformSource:(board.find(g=>g.resume)?.source||board[0]?.source);
 const ordered=[...board.filter(g=>g.source===selected),...board.filter(g=>g.source!==selected)];
 const sourceButton=g=>`<button data-action="platform-select" data-source="${e(g.source)}" aria-pressed="${g.source===selected}"><strong>${e(g.source)}</strong><small>${g.review_batches?`${g.review_batches}批待核对`:g.latest?'查看进度':'尚未记录'}</small></button>`;
 const tabs=`<div class="platform-tabs" role="group" aria-label="选择平台">${board.slice(0,6).map(sourceButton).join('')}${!board.slice(0,6).some(g=>g.source===selected)?sourceButton(ordered[0]):''}<details class="source-more"><summary>更多来源</summary><div>${board.slice(6).filter(g=>g.source!==selected).map(sourceButton).join('')}</div></details></div>`;
 return `<section class="batch-history platform-board" aria-label="平台记账进度"><div class="card-heading"><h2>平台记账进度</h2><button class="text-button" data-action="text-records">全部批次 ${icon('right',16)}</button></div>${tabs}<div class="platform-grid">${board.map(group=>{
  const row=group.latest,mark=marks[group.source]||[group.source[0],'#73829b'];
  const head=`<header class="platform-card-header"><h3><span class="platform-mark" style="--platform:${mark[1]}">${e(mark[0])}</span>${e(group.source)}</h3>${group.source==='抖音'?'<button class="text-button" data-action="source-account">按账号记</button>':''}${row?`<span class="status-pill ${statusClass(row)}">${stateLabel(row)}</span>`:`<span class="platform-empty-label">${group.calendar?.ranges.length?'有核对标记':'尚未记录'}</span>`}</header>`;
  if(!row)return `<article class="card platform-card is-empty" data-platform="${e(group.source)}" data-selected="${group.source===selected}">${head}${sourceCalendar(group,state)}<button class="button secondary" data-action="text-records" data-source="${e(group.source)}">${icon('plus',16)}记录${e(group.source)}</button></article>`;
  const p=row.progress,target=group.resume||row;
  return `<article class="card platform-card" data-platform="${e(group.source)}" data-selected="${group.source===selected}">${head}${sourceCalendar(group,state)}<div class="platform-batch-meta">最近一批 · ${e(recordedDate(p.recorded_at||row.created_at))}${p.recorded_at?'记过':'录入'}</div>${group.batches.length>1?`<details class="platform-history"><summary>查看 ${group.batches.length} 批记录</summary>${group.batches.map(b=>`<button class="platform-history-row" data-action="text-records" data-batch-id="${e(b.id)}"><span>${e(recordedDate(b.progress.recorded_at||b.created_at))} · ${stateLabel(b)}</span><strong>${e(b.progress.first_title)} …… ${e(b.progress.last_title)}</strong></button>`).join('')}</details>`:''}<div class="platform-card-actions"><button class="button ${group.resume?'primary':'secondary'} batch-history-row" data-action="text-records" data-batch-id="${e(target.id)}" ${group.resume?'':'data-batch-overlay'}>${group.resume?target.id===row.id?'继续核对':'继续较早批次':'查看本批'} ${icon('right',16)}</button><button class="text-button" data-action="text-records" data-source="${e(group.source==='口述记录'?'':group.source)}">${icon('plus',16)}再记一批</button></div></article>`;
 }).join('')}</div></section>`;
}
