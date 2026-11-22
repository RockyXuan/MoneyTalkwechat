// Experimental grouping only reduces repeated transport fields. No network, tools or ledger writes.
import { z } from 'zod';
import { semanticMessages, semanticProposalSchema } from './semantic-proposal.js';
import { compactItem, validateCompactProposal } from './semantic-wire.js';
import { LONG_ITEM_LIMIT } from './text-records.js';

const child = compactItem.omit({ source:true, type:true, currency:true }).extend({ category:compactItem.shape.category.optional() });
const group = z.object({
  source:compactItem.shape.source, type:compactItem.shape.type, currency:compactItem.shape.currency,
  category:compactItem.shape.category, date:compactItem.shape.date.unwrap(),
  items:z.array(child).min(1).max(LONG_ITEM_LIMIT),
}).strict();
export const groupedProposalSchema=z.object({
  version:z.literal(3), complete:z.literal(true), groups:z.array(group).max(LONG_ITEM_LIMIT),
  ignored:semanticProposalSchema.shape.ignored,
}).strict();

export function groupedMessages(context){
  const messages=semanticMessages(context);
  messages[0].content+='\n使用 version=3 的连续分组传输。每组显式给出来源、收支类型、币种、默认分类和日期，同组商品不用反复输出这些字段；个别商品分类或日期不同可在该项覆盖。必须按原文购买顺序分组，不能为了合并同平台、同分类把远处商品搬过来。组内 items 必须完整逐笔，不合并同额独立订单。每项保留 title、原购买引文 evidence、金额操作数 amount；后文更正替换原金额并补更正引文，不产生新消费。程序生成项目ID、核算整数分、展开单笔结构，不输出id、默认single循环、空questions或算出的stated_total。明确时间词、分类标题、平台持续到用户明确替换；另外、接着、闲聊、换平台不代表换日期。完全没有发生日期语境才写组日期 unspecified/null；未知日期 unknown/null。没有匹配的明确分类称呼必须 id=null,suggested_name=原称呼,alternatives=[推荐已有ID]；已有同名或别称用其ID，不猜归并。原价和实付不同用exact实付；另付邮费用sum；有优惠但无实付用subtract。中文数值转十进制字符串且引用原词，型号、日期、合计不是新价格。occurrence独立统计同一quote的出现序号，不是条目序号。循环保留所有显式参数和引文，未知起始月不猜。ignored只保留代表性的计划、闲聊、否定、已记还款，不重复已提取消费。只返回完整JSON，不能用部分结果冒充全部。以下为严格schema：'+JSON.stringify(z.toJSONSchema(groupedProposalSchema));
  return messages;
}

export function validateGroupedProposal(output,context){
  if(typeof output==='string'&&new TextEncoder().encode(output).length>1024*1024)throw Error('模型输出超限');
  const data=groupedProposalSchema.parse(typeof output==='string'?JSON.parse(output):output);
  if(data.groups.reduce((sum,g)=>sum+g.items.length,0)>LONG_ITEM_LIMIT)throw Error('模型项目总数超限，不能分组绕过限制');
  const items=data.groups.flatMap(g=>g.items.map(i=>({...i,source:g.source,type:g.type,currency:g.currency,
    category:i.category??g.category,date:i.date??g.date})));
  // The canonical validator still checks the aggregate limit, raw order, quotes, money, dates and IDs.
  return validateCompactProposal({version:2,complete:true,items,ignored:data.ignored},context);
}
