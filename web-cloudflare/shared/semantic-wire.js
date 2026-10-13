// Experimental compact transport. Not enabled by the website; canonical guards stay authoritative.
import { z } from 'zod';
import { semanticProposalSchema, semanticMessages, validateSemanticProposal } from './semantic-proposal.js';

const canonicalItem = semanticProposalSchema.shape.items.element;
const single = { cycle: 'single', start_month: null, through_month: null, ongoing: false, charge_day: null, evidence: [] };
const unspecified = { kind: 'unspecified', value: null, evidence: [] };
const compactItem = canonicalItem.omit({ id: true }).extend({
  date: canonicalItem.shape.date.optional(),
  recurrence: canonicalItem.shape.recurrence.optional(),
  questions: canonicalItem.shape.questions.optional(),
  amount: canonicalItem.shape.amount.extend({ stated_total: canonicalItem.shape.amount.shape.stated_total.optional() }),
  category: canonicalItem.shape.category.extend({
    suggested_name: canonicalItem.shape.category.shape.suggested_name.optional(),
    alternatives: canonicalItem.shape.category.shape.alternatives.optional(),
  }),
}).strict();
export const compactProposalSchema = z.object({
  version: z.literal(2), complete: z.literal(true),
  items: z.array(compactItem).max(400), ignored: semanticProposalSchema.shape.ignored,
}).strict();

export function compactMessages(context) {
  const messages = semanticMessages(context);
  messages[0].content += '\n输出传输协议 version=2，不输出项目id，由程序按原序生成。只有完全没有发生日期词或有效日期语境时才省略 date，由程序使用 anchor_day 的月份；有月份/日期标题时，后续条目沿用它，换平台不等于换月份，长闲聊和更正也不终止时间语境。真不知道日期则 date.kind=unknown,value=null。单笔省略 recurrence，问题为空省略 questions；金额不写算好的 stated_total，程序用真实金额操作数核算，不能引用你自己算出的差额。category.id 必填，已有分类必须用ID；无匹配的明确分类称呼用id=null,suggested_name=原称呼,alternatives=[推荐已有ID]，不能猜成已有分类。有明确同名/别称分类则尊重它。source和currency必须填。原价加实付不是两笔，有实付就用exact实付，加邮费用sum，中文数字转十进制字符串并引用原词。相同quote出现次数独立从0开始。型号、容量、数量不要当价格。跨段更正替换原项目金额，项目evidence先引用原购买位置，再引用更正，不能丢原顺序。还款、计划、合计不能误增消费；用户说退款按收入则照做。完整阅读，不截取前几笔，不合并独立同额订单。以下是严格传输JSON Schema：' + JSON.stringify(z.toJSONSchema(compactProposalSchema));
  return messages;
}

export function validateCompactProposal(output, context) {
  if (typeof output === 'string' && new TextEncoder().encode(output).length > 1024 * 1024) throw Error('模型输出超限');
  const data = compactProposalSchema.parse(typeof output === 'string' ? JSON.parse(output) : output);
  // These defaults are structure, never inferred prices, sources, named categories or recurring dates.
  return validateSemanticProposal({ version: 1, complete: true, ignored: data.ignored,
    items: data.items.map((i, n) => ({ ...i, id: `p${n + 1}`, date: i.date ?? structuredClone(unspecified),
      recurrence: i.recurrence ?? structuredClone(single), questions: i.questions ?? [],
      amount: { ...i.amount, stated_total: i.amount.stated_total ?? null },
      category: { ...i.category, suggested_name: i.category.suggested_name ?? null, alternatives: i.category.alternatives ?? [] },
    })) }, context);
}
