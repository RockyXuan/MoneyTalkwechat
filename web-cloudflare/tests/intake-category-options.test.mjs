import test from 'node:test';import assert from 'node:assert/strict';import {intakeCategoryOptions} from '../shared/intake-category-options.js';
const cats=[{id:'food',name:'餐饮',type:'expense',archived:false},{id:'other',name:'其他',type:'expense',archived:false},{id:'games',name:'游戏',aliases:['虚构游戏'],type:'expense',archived:false}];
test('category suggestions retain clear choices, offer uncertain options and never overwrite explicit hints',()=>{assert.equal(intakeCategoryOptions({title:'午餐',type:'expense',category_id:'food'},cats).category_hint.resolved,true);const unknown=intakeCategoryOptions({title:'未知物品',type:'expense',category_id:'other'},cats);assert.equal(unknown.category_id,null);assert.equal(unknown.category_hint.resolved,false);assert.equal(unknown.category_hint.recommended_ids.length,0);assert.equal(intakeCategoryOptions({title:'虚构游戏月卡',type:'expense',category_id:'other'},cats).category_id,'games');const explicit={title:'物品',category_hint:{name:'个人分类',recommended_ids:[],resolved:false}};assert.equal(intakeCategoryOptions(explicit,cats),explicit);});
test('an explicitly spoken Other category is retained while an inferred Other still requires a choice',()=>{
 const item={title:'合成月卡',raw:'分类其他，从2025年11月开始，每月合成月卡0.04元，一直订阅',type:'expense',category_id:'other'};
 assert.equal(intakeCategoryOptions(item,cats).category_id,'other');
 assert.equal(intakeCategoryOptions({...item,raw:'神秘物品0.04元'},cats).category_id,null);
});
