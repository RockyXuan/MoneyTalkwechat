// Evaluation-only v11: reuse v10 transport and canonical guards, with valid fictional examples.
import {denseMessages,denseProposalSchema} from './semantic-dense.js';
import {z} from 'zod';
const ref=quote=>({quote,occurrence:0});
const item=(title,quote,method,terms,extra)=>[title,[[quote,0]],[method,terms.map(([value,quote])=>[value,[quote,0]])],...(extra?[extra]:[])];
const group=(items,date={kind:'unspecified',value:null,evidence:[]},category={id:'shopping'})=>({source:'淘宝',type:'expense',currency:'CNY',category,date,items});
const result=groups=>({version:4,complete:true,groups,ignored:[]});
export const guidedExamples=[
 {raw:'淘宝雨衣原价90元，券后实付72元；手套18元另付邮费3元；帽子原价50元减优惠8元。',output:result([group([
  item('雨衣','雨衣原价90元，券后实付72元','exact',[['72','实付72元']]),
  item('手套','手套18元另付邮费3元','sum',[['18','手套18元'],['3','邮费3元']]),
  item('帽子','帽子原价50元减优惠8元','subtract',[['50','原价50元'],['8','优惠8元']]),
 ])])},
 {raw:'2026年8月淘宝买纸箱7元、胶带4元，纸箱改成9元。',output:result([group([
  ['纸箱',[['纸箱7元',0],['纸箱改成9元',0]],['exact',[['9',['纸箱改成9元',0]]]]],
  item('胶带','胶带4元','exact',[['4','胶带4元']]),
 ],{kind:'explicit',value:'2026-08',evidence:[ref('2026年8月')]})])},
 {raw:'淘宝云空间每月12元，起始月忘了，先补到2025年11月，不填扣款日。',output:result([group([
  item('云空间','云空间每月12元','exact',[['12','每月12元']],{recurrence:{cycle:'monthly',start_month:null,through_month:'2025-11',ongoing:false,charge_day:null,evidence:[ref('每月12元，起始月忘了，先补到2025年11月，不填扣款日')]}}),
 ],{kind:'unknown',value:null,evidence:[ref('起始月忘了')]},{id:'other'})])},
];
export function guidedDenseMessages(context){
 const messages=denseMessages(context);
 messages[0].content+='\n以下仅是与本次输入无关的虚构格式示范，不提取示范账目。严格保持数组层级：单笔第三个位置直接是 [method,terms]，不能再包一层数组。occurrence是数字0而不是字符串"0"。ignored的每个元素是[引文数组,原因]，引文数组再包含[quote,0]。已给实付时只取实付，不做原价减实付；邮费仅另付时相加；后文改口替换原笔。每个示范的input不是本次原文，只有最后user消息的raw才是本次待处理数据。示范：'+JSON.stringify(guidedExamples)+'\n只输出一个完整有效的JSON对象，不输出Markdown或解释。结构不替代事实核对，不得照抄示范的标题、金额、日期、分类。';
 return messages;
}

// v12 uses the official native bare schema in response_format; no duplicated schema in prompt.
export const constrainedDenseSchema=()=>z.toJSONSchema(denseProposalSchema);
export function constrainedDenseMessages(context){
 const messages=guidedDenseMessages(context),schema=JSON.stringify(constrainedDenseSchema());
 if(!messages[0].content.includes(schema))throw Error('固定传输schema未找到');
 messages[0].content=messages[0].content.replace(schema,'结构以请求response_format.json_schema为准；所有字段和位置限制不变。');
 return messages;
}

// v13 independently restores explicit product specifications; v10-v12 remain frozen.
const specificationRule='标题必须保留原文明示的型号、容量、规格、尺码和颜色等区分商品的信息。这些不是金额，但必须写进title，不能只移到questions而让标题只剩泛称。没有说购买平台时source必须是JSON的null，不能写字符串unknown或把商品名称当来源；明确说了平台才使用该平台并按原文语境继承。没有说日期时必须使用unspecified/value:null/evidence:[]，由程序采用锚点月份；禁止自行填锚点当天，也禁止用不含日期的商品句冒充日期证据。循环起始时间忘记时使用unknown，不能补造起始月。只对真正缺失或矛盾的信息提出问题；明确实付与原价的差额、同一平台或日期语境没有重复说，不是新的疑问。币种、日期、分类或跨段关联确实不明确时仍保留待确认。';
export function specificationDenseMessages(context){const messages=constrainedDenseMessages(context);messages[0].content+='\n'+specificationRule;return messages;}
export function specificationDenseSchema(){const schema=constrainedDenseSchema();schema.properties.groups.items.properties.items.items.prefixItems[0].description='商品标题：保留明确型号、容量、规格、尺码、颜色等区分信息；不能仅写商品泛称，不能把规格误当金额或只放进问题。';return schema;}
