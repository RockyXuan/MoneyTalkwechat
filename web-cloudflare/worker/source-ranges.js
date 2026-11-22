import { z } from 'zod';
import { sourceRangeInput } from '../shared/source-range-schema.js';
import { RANGE_LIMIT } from '../shared/source-calendar.js';
import { today } from '../shared/format.js';
import { all, first, statement, operation, stamp } from './store.js';
import { ApiError } from './auth.js';
export async function sourceRanges(db,ledger){return all(db,'SELECT id,source,date_from AS "from",date_to AS "to",created_at FROM source_ranges WHERE ledger_id=? ORDER BY date_from,id',[ledger]);}
export function registerSourceRanges(app){
 app.post('/api/source-ranges',async c=>{
  const value=sourceRangeInput.parse(await c.req.json());if(value.to>today())throw new ApiError(400,'FUTURE_RANGE','不能将未来日期标为已核对');
  const db=c.env.DB,ledger=c.get('ledger').id,user=c.get('user'),key=c.req.header('Idempotency-Key');
  const row={id:crypto.randomUUID(),...value,created_at:stamp()};
  return c.json(await operation(db,user,ledger,key,{route:'source-range',value},{range:row},[statement(db,'INSERT INTO source_ranges(ledger_id,id,source,date_from,date_to,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operations WHERE user_id=? AND ledger_id=? AND key=?)',[ledger,row.id,row.source,row.from,row.to,row.created_at,user.id,ledger,key])],{sql:'(SELECT COUNT(*) FROM source_ranges WHERE ledger_id=?)<?',values:[ledger,RANGE_LIMIT]}),201);
 });
 app.delete('/api/source-ranges/:id',async c=>{
  z.object({}).strict().parse(await c.req.json());const db=c.env.DB,ledger=c.get('ledger').id,id=c.req.param('id');
  return c.json(await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'delete-source-range',id},{id,deleted:true},[statement(db,'DELETE FROM source_ranges WHERE ledger_id=? AND id=?',[ledger,id])]));
 });
}
