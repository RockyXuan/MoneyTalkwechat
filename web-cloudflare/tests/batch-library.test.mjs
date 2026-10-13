import test from 'node:test';
import assert from 'node:assert/strict';
import {batchPage,batchState} from '../shared/batch-library.js';
const batch=(id,extra={})=>({id,status:'active',original_text:'合成原文',items:[{title:`淘宝 · 合成${id}`,raw:'实付0.01元'}],progress:{confirmed_items:1,total_items:1},pending_count:0,due_count:0,...extra});
test('batch library page boundaries, original order, exact platform and text search do not mutate batches',()=>{
 const rows=Array.from({length:19},(_,i)=>batch(String(i)));const before=JSON.stringify(rows);
 assert.equal(batchPage(rows).batches.length,8);assert.equal(batchPage(rows,{page:1}).batches[0].id,'8');assert.equal(batchPage(rows,{page:99}).batches.length,3);assert.equal(batchPage(rows,{page:99}).page,2);
 assert.equal(batchPage(rows,{q:'合成18'}).count,1);assert.equal(batchPage(rows,{q:'不存在',page:2}).page,0);assert.equal(batchPage(rows,{source:'京东'}).count,0);assert.equal(batchPage(rows,{q:'实付'}).count,19);assert.equal(JSON.stringify(rows),before);
});
test('batch library counts paused, due recurring, pending and mixed platform membership honestly',()=>{
 const rows=[batch('done'),batch('due',{due_count:1}),batch('pending',{status:'pending'}),batch('gap',{progress:{confirmed_items:1,total_items:3}}),batch('paused',{status:'paused',pending_count:1}),batch('mixed',{items:[{title:'淘宝 · 合成',raw:''},{title:'京东 · 合成',raw:''}]})];
 assert.equal(batchPage(rows,{status:'review'}).count,3);assert.equal(batchPage(rows,{status:'done'}).count,2);assert.equal(batchPage(rows,{status:'paused'}).count,1);assert.equal(batchPage(rows,{source:'京东'}).count,1);assert.equal(batchState(rows[4]),'paused');
 assert.equal(batchPage([batch('unicode',{original_text:'ＡＢＣ<合成>'})],{q:'abc<合成>'}).count,1);
});
