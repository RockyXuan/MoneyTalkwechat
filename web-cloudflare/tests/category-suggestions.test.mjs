import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextRecords,compileTextItems} from '../shared/text-records.js';
import {categoryInput,validateBackup} from '../shared/domain.js';
import {demoBackup} from '../shared/demo.js';
const cats=[{id:'child',name:'孩子',type:'expense',aliases:['小禾'],archived:false},{id:'other',name:'其他',type:'expense',archived:false}];
const parse=(raw,c=cats)=>parseTextRecords(raw,'2026-10-11',c)[0];
test('private aliases suggest a category without preselection or entry generation',()=>{
 const prefix=parse('分类小禾，绘本58元');assert.equal(prefix.title,'绘本');assert.equal(prefix.amount_minor,5800);assert.equal(prefix.category_hint.name,'小禾');assert.equal(parseTextRecords('分类小禾，绘本58元','2026-10-11',cats).length,1);
 const item=parse('绘本58元 分类小禾');assert.deepEqual(item.category_hint,{name:'小禾',recommended_ids:['child'],resolved:false});assert.equal(item.category_id,null);assert.equal(item.title,'绘本');assert.equal(item.amount_minor,5800);assert.equal(compileTextItems([item]).count,0);
 assert.equal(compileTextItems([{...item,category_id:'child',category_hint:{...item.category_hint,resolved:true}}],'2026-10-11').count,1);
 assert.equal(compileTextItems([{...item,category_id:'child'}],'2026-10-11').count,0);
});
test('an explicitly existing category outranks alias; archived and wrong-type categories do not',()=>{
 const c=[...cats,{id:'real',name:'小禾',type:'expense',archived:false}];assert.equal(parse('绘本58元 分类小禾',c).category_id,'real');assert.equal(parse('绘本58元 分类小禾',c).category_hint,undefined);
 assert.equal(parse('绘本58元 分类小禾',[{...cats[0],archived:true},cats[1]]).category_hint.recommended_ids.length,0);
 assert.equal(parse('绘本58元 分类小禾',[{...cats[0],type:'income'},cats[1]]).category_hint.recommended_ids.length,0);
});
test('multiple aliases are not silently chosen; unrelated substrings do not infer relationships',()=>{
 const item=parse('给小禾买绘本58元',[...cats,{...cats[0],id:'family',name:'家庭'}]);assert.deepEqual(item.category_hint.recommended_ids,['child','family']);assert.equal(item.category_id,null);
 assert.equal(parse('无糖小禾饮料58元').category_hint,undefined);assert.equal(parse('小禾科技配件58元').category_hint,undefined);
 assert.equal(parse('孩子：绘本58元').category_id,'child');assert.equal(parse('分类陌生名称 绘本58元').category_hint.name,'陌生名称');
});
test('aliases validate limits and normalization; backup v4 preserves private hints and rejects downgrade',()=>{
 assert.throws(()=>parse('绘本58元 分类'+ '名'.repeat(33)),/32/);
 const base={name:'合成分类',type:'expense',color_key:'blue',icon:'wallet'};
 for(const aliases of [[''],['A','ａ'],['x'.repeat(33)],Array.from({length:21},(_,i)=>String(i))])assert.equal(categoryInput.safeParse({...base,aliases}).success,false);
 const b=demoBackup();b.version=4;b.categories[0].aliases=['合成别称'];assert.equal(validateBackup(b).valid,true);assert.equal(validateBackup({...b,version:3}).valid,false);
});
