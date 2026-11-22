// Experimental transport v4. Tuples remove repeated keys only; canonical financial guards remain authoritative.
import {z} from 'zod';
import {semanticMessages} from './semantic-proposal.js';
import {compactItem,validateCompactProposal} from './semantic-wire.js';
import {LONG_ITEM_LIMIT} from './text-records.js';
const reference=z.tuple([z.string().min(1).max(500).describe('逐字原文quote'),z.number().int().min(0).max(400).describe('同一引文从0计数的occurrence')]);
const refs=z.array(reference).min(1).max(8);
const term=z.tuple([z.string().max(32).describe('十进制金额字符串'),reference]);
const money=z.tuple([compactItem.shape.amount.shape.method,z.array(term).max(8)]).describe('[金额方法,操作数列表]；unknown的列表为空，不输出计算合计');
const extra=z.object({category:compactItem.shape.category.optional(),date:compactItem.shape.date,recurrence:compactItem.shape.recurrence,questions:compactItem.shape.questions}).strict();
const item=z.tuple([compactItem.shape.title,refs,money,extra.optional()]).describe('[商品标题,购买及更正引文,金额,可选的特殊覆盖]；默认值不放进覆盖');
export const denseProposalSchema=z.object({version:z.literal(4),complete:z.literal(true),groups:z.array(z.object({source:compactItem.shape.source,type:compactItem.shape.type,currency:compactItem.shape.currency,category:compactItem.shape.category,date:compactItem.shape.date.unwrap(),items:z.array(item).min(1).max(LONG_ITEM_LIMIT)}).strict()).max(LONG_ITEM_LIMIT),ignored:z.array(z.tuple([refs,z.string().min(1).max(200)])).max(400)}).strict();
const expandRef=([quote,occurrence])=>({quote,occurrence});
export function denseMessages(context){
 const messages=semanticMessages(context);
 messages[0].content+='\n传输version=4，仅使用以下schema，不输出其他版本结构。JSON紧凑输出，不缩进。每个连续组显式给出source/type/currency/category/date默认值，按原购买顺序分组，不为合并同平台搬动项目。每笔items用数组：[title, [[quote,occurrence],...], [method, [[value,[quote,occurrence]],...]], 可选extra对象]。没有特殊覆盖时整笔只有3个位置；extra仅放真正不同的category/date、非single的recurrence或非空questions，不能重复组默认值。每笔仍完整保留购买位置引文、价格引文，后文改口再附更正引文，不增加新消费；quote逐字相同，occurrence只数同一quote。method=exact用实付单一操作数；sum实付加另付邮费；subtract原价减优惠；unknown用空操作数列表，不猜金额。单笔recurrence默认single，不输出其空参数。循环必须在extra.recurrence保留所有明确参数和原文，未知起始月/扣款日保持null。未知币种不能猜人民币。明确日期、来源和分类标题持续到用户明确替换；另外、接着、闲聊、换平台不重置日期。无日期只用unspecified/null；不确定日期unknown/null；月份不能加日。已有同名或已声明别称用分类ID；陌生明确分类称呼用id=null,suggested_name=该称呼,alternatives=[推荐ID]，不能擅自当别称归并。ignored用[引文数组,原因]，只保留代表性计划、否定、闲聊、已记还款，不重复购买。程序仅展开固定结构并核算整数分，不补语义事实。输出必须包括全部项目；不截断、不用complete=true冒充部分。严格schema：'+JSON.stringify(z.toJSONSchema(denseProposalSchema));
 return messages;
}
export function validateDenseProposal(output,context){
 if(typeof output==='string'&&new TextEncoder().encode(output).length>1024*1024)throw Error('模型输出超限');
 const data=denseProposalSchema.parse(typeof output==='string'?JSON.parse(output):output);
 if(data.groups.reduce((n,g)=>n+g.items.length,0)>LONG_ITEM_LIMIT)throw Error('模型项目总数超限');
 const items=data.groups.flatMap(g=>g.items.map(([title,evidence,[method,terms],overrides={}])=>({title,evidence:evidence.map(expandRef),amount:{method,terms:terms.map(([value,evidence])=>({value,evidence:expandRef(evidence)}))},source:g.source,type:g.type,currency:g.currency,category:overrides.category??g.category,date:overrides.date??g.date,...(overrides.recurrence?{recurrence:overrides.recurrence}:{}),...(overrides.questions?{questions:overrides.questions}:{})})));
 return validateCompactProposal({version:2,complete:true,items,ignored:data.ignored.map(([evidence,reason])=>({evidence:evidence.map(expandRef),reason}))},context);
}
