export const PRIMARY_PLATFORMS=['淘宝','支付宝','微信','拼多多','京东','抖音'];
export const CONSUMPTION_SOURCES=[...PRIMARY_PLATFORMS,'山姆','英雄联盟','原神','绝区零','崩坏星穹铁道','Steam','转账（含建行）','滴滴','其他订阅软件','App Store','GPT','Claude','苹果云','美团'];
export const PLATFORMS=CONSUMPTION_SOURCES;
const aliases={淘宝:'淘宝',天猫:'淘宝',支付宝:'支付宝',微信:'微信',微信支付:'微信',拼多多:'拼多多',pdd:'拼多多',京东:'京东',抖音:'抖音',美团:'美团',山姆:'山姆',山姆超市:'山姆'};
for(const source of PLATFORMS)aliases[source.toLowerCase()]=source;
export function titleSource(title){return aliases[title.match(/^\s*([^·：:]+?)\s*[·：:]/)?.[1]?.toLowerCase()]||null;}
export function spokenBatchSource(text){
 const match=text.match(/^(?:(?:请|先)?(?:帮我)?(?:记一下|记一笔|记录一下|记录|记下)\s*)?([^\s：:，,]+?)(?:上|里)?(?:的)?(?:账单|账目|消费记录|消费|账)\s*[：:]?$/);
 return match?aliases[match[1].toLowerCase()]||null:null;
}
export function batchSources(batch){
 const explicit=batch.items.map(i=>i.source||titleSource(i.title));
 const named=[...new Set((batch.original_text||'').match(/淘宝|天猫|支付宝|微信(?:支付)?|拼多多|京东|抖音|美团|山姆(?:超市)?|\bpdd\b/gi)?.map(s=>aliases[s.toLowerCase()])||[])];
 const fallback=named.length===1?named[0]:'口述记录';
 return batch.items.map((item,n)=>({item,source:explicit[n]||fallback}));
}
export function sourceTitle(title){return titleSource(title)?title.replace(/^\s*[^·：:]+?\s*[·：:]\s*/,''):title;}
export function tagPlatformItems(items,source){
 if(!source||source.length>64)return items;
 return items.map(i=>{if(titleSource(i.title))return i;const title=`${source} · ${i.title}`;if(title.length>80)throw new Error('加上平台后名称超过 80 字，请缩短商品名称再核对');return {...i,title,...(!PLATFORMS.includes(source)?{source}:{})};});
}
