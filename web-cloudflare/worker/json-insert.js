import { statement } from './store.js';
// D1 ships SQLite JSON functions. Bind one bounded JSON value instead of hundreds
// of parameters or one query per row. Table/column names are internal constants.
export function jsonInsert(db, table, columns, rows, {ignore=false,condition=null}={}) {
 const groups=[];let group=[],bytes=2;
 const encoder=new TextEncoder();
 for(const row of rows){const size=encoder.encode(JSON.stringify(row)).length+1;if(size>1000000)throw new Error('单条恢复数据过大，请检查备份');if(group.length&&bytes+size>1000000){groups.push(group);group=[];bytes=2;}group.push(row);bytes+=size;}
 if(group.length)groups.push(group);
 return groups.map(part=>statement(db,`INSERT ${ignore?'OR IGNORE ':''}INTO ${table}(${columns.join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)${condition?` WHERE ${condition.sql}`:''}`,[JSON.stringify(part),...(condition?.values||[])]));
}
