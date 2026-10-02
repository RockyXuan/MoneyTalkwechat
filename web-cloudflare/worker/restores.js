import { z } from 'zod';
import { backupSchema, backupCategory, backupEntry, validateBackup, backupContent, canonical, digest } from '../shared/domain.js';
import { textBatchSchema, textSlotSchema } from '../shared/text-schema.js';
import { batchInsert } from './text-records.js';
import { ApiError } from './auth.js';
import { all, first, statement, stamp, ownedLedger, exportBackup, categoryRow } from './store.js';

function bulkInsert(db, table, columns, rows, ignore = false, importingLedger = null) {
  const maxRows = Math.floor((96 - (importingLedger ? 1 : 0)) / columns.length);
  const statements = [];
  for (let i = 0; i < rows.length; i += maxRows) {
    const part = rows.slice(i, i + maxRows);
    const valuesSql = `VALUES ${part.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}`;
    const insert = `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO ${table}(${columns.join(',')})`;
    const sql = importingLedger
      ? `WITH incoming(${columns.join(',')}) AS (${valuesSql}) ${insert} SELECT ${columns.join(',')} FROM incoming WHERE EXISTS(SELECT 1 FROM ledgers WHERE id=? AND status='importing')`
      : `${insert} ${valuesSql}`;
    statements.push(statement(db, sql, [...part.flat(), ...(importingLedger ? [importingLedger] : [])]));
  }
  return statements;
}
async function jobFor(c, id) {
  await ownedLedger(c.env.DB, c.get('user').id, id, true);
  const job = await first(c.env.DB, 'SELECT * FROM restores WHERE ledger_id=? AND owner_id=?', [id, c.get('user').id]);
  if (!job) throw new ApiError(404, 'RESTORE_NOT_FOUND', '恢复任务不存在');
  return job;
}
export function registerRestores(app) {
  app.post('/api/restores/preview', async c => {
    const preview = validateBackup(await c.req.json());
    if (!preview.valid) return c.json(preview);
    return c.json({ valid: true, summary: preview.summary, ledger: preview.data.ledger, fingerprint: await digest(backupContent(preview.data)), errors: [] });
  });
  app.post('/api/restores', async c => {
    const manifest = z.object({
      fingerprint: z.string().regex(/^[0-9a-f]{64}$/), ledger: backupSchema.shape.ledger,
      text_batches:z.array(textBatchSchema).max(100).optional(),text_slots:z.array(textSlotSchema).max(12000).optional(),
      categories: z.array(backupCategory).max(100), entry_count: z.number().int().min(0).max(50000),
    }).strict().parse(await c.req.json());
    const check = validateBackup({ format: 'moneytalk-backup', version: manifest.text_batches?.length?2:1, exported_at: stamp(), ...(manifest.text_batches?{text_batches:manifest.text_batches}:{}), ledger: manifest.ledger, categories: manifest.categories, entries: [] });
    if (!check.valid) throw new ApiError(400, 'INVALID_BACKUP', check.errors[0]);
    const db = c.env.DB, owner = c.get('user').id;
    const previous = async () => {
      const job = await first(db, 'SELECT * FROM restores WHERE owner_id=? AND fingerprint=? AND reusable=1', [owner, manifest.fingerprint]);
      if (!job) return null;
      if (canonical(JSON.parse(job.manifest_json)) !== canonical(manifest)) throw new ApiError(409, 'RESTORE_MISMATCH', '该恢复任务的文件内容已变化');
      if (job.completed_at) {
        const ledger = await ownedLedger(db, owner, job.ledger_id);
        const current = await exportBackup(db, ledger);
        if (await digest(backupContent(current)) !== job.fingerprint) {
          await statement(db, 'UPDATE restores SET reusable=0 WHERE ledger_id=?', [job.ledger_id]).run();
          return null;
        }
      }
      const count = await first(db, 'SELECT COUNT(*) AS count FROM entries WHERE ledger_id=?', [job.ledger_id]);
      return { id: job.ledger_id, received: count.count, complete: Boolean(job.completed_at), repeated: true };
    };
    const old = await previous();
    if (old) return c.json(old);
    const id = crypto.randomUUID(), now = stamp();
    const batchWrites=[];
    for(const b of manifest.text_batches||[])batchWrites.push(batchInsert(db,id,b,await digest({original_text:b.original_text,items:b.items.map(({id,...i})=>i)})));
    try {
      await db.batch([
        statement(db, 'INSERT INTO ledgers(id,owner_id,name,currency,timezone,status,created_at) VALUES(?,?,?,?,?,\'importing\',?)', [id, owner, manifest.ledger.name, manifest.ledger.currency, manifest.ledger.timezone, now]),
        statement(db, 'INSERT INTO restores(ledger_id,owner_id,fingerprint,expected_entries,expected_categories,manifest_json,created_at) VALUES(?,?,?,?,?,?,?)', [id, owner, manifest.fingerprint, manifest.entry_count, manifest.categories.length, JSON.stringify(manifest), now]),
        ...batchWrites,
        ...bulkInsert(db, 'categories', ['ledger_id', 'id', 'name', 'type', 'color_key', 'icon', 'sort_order', 'archived'], manifest.categories.map(x => [id, x.id, x.name, x.type, x.color_key, x.icon, x.sort_order, Number(x.archived)])),
      ]);
    } catch (error) {
      const replay = await previous();
      if (replay) return c.json(replay);
      throw error;
    }
    return c.json({ id, received: 0, complete: false, repeated: false }, 201);
  });
  app.post('/api/restores/:id/entries', async c => {
    const job = await jobFor(c, c.req.param('id'));
    const { entries } = z.object({ entries: z.array(backupEntry).min(1).max(50) }).strict().parse(await c.req.json());
    const db = c.env.DB;
    const cats = (await all(db, 'SELECT id,name,type,color_key,icon,sort_order,archived FROM categories WHERE ledger_id=?', [job.ledger_id])).map(categoryRow);
    const manifest = JSON.parse(job.manifest_json);
    const check = validateBackup({ format: 'moneytalk-backup', version: manifest.text_batches?.length?2:1, exported_at: stamp(), ...(manifest.text_batches?{text_batches:manifest.text_batches}:{}), ledger: manifest.ledger, categories: cats, entries });
    if (!check.valid) throw new ApiError(400, 'INVALID_BACKUP', check.errors[0]);
    const oldRows = await all(db, `SELECT id,type,amount_minor,category_id,occurred_on,note,version,created_at,updated_at,deleted_at FROM entries WHERE ledger_id=? AND id IN (${entries.map(() => '?').join(',')})`, [job.ledger_id, ...entries.map(e => e.id)]);
    const old = new Map(oldRows.map(e => [e.id, e]));
    for (const e of entries) if (old.has(e.id) && canonical(old.get(e.id)) !== canonical(e)) throw new ApiError(409, 'RESTORE_MISMATCH', '同一记录 ID 的恢复内容不一致');
    const additions = entries.filter(e => !old.has(e.id));
    if (job.completed_at && additions.length) throw new ApiError(409, 'RESTORE_COMPLETE', '已校验的候选账本不能继续写入恢复数据');
    const count = await first(db, 'SELECT COUNT(*) AS count FROM entries WHERE ledger_id=?', [job.ledger_id]);
    if (count.count + additions.length > job.expected_entries) throw new ApiError(400, 'RESTORE_COUNT', '恢复条数超过备份声明');
    if (additions.length) {
      const cols = ['ledger_id', 'id', 'type', 'amount_minor', 'category_id', 'occurred_on', 'note', 'version', 'created_at', 'updated_at', 'deleted_at'];
      await db.batch([
        statement(db, 'UPDATE restores SET write_version=write_version+1 WHERE ledger_id=? AND completed_at IS NULL', [job.ledger_id]),
        ...bulkInsert(db, 'entries', cols, additions.map(e => [job.ledger_id, e.id, e.type, e.amount_minor, e.category_id, e.occurred_on, e.note, e.version, e.created_at, e.updated_at, e.deleted_at]), true, job.ledger_id),
      ]);
    }
    const updated = await first(db, 'SELECT COUNT(*) AS count FROM entries WHERE ledger_id=?', [job.ledger_id]);
    return c.json({ id: job.ledger_id, received: updated.count, expected: job.expected_entries });
  });
  app.post('/api/restores/:id/finish', async c => {
    const job = await jobFor(c, c.req.param('id'));
    const ledger = await ownedLedger(c.env.DB, c.get('user').id, job.ledger_id, true);
    const manifest=JSON.parse(job.manifest_json);
    if(!job.completed_at&&(manifest.text_slots||[]).length){
      const count=await first(c.env.DB,'SELECT COUNT(*) AS n FROM entries WHERE ledger_id=?',[job.ledger_id]);
      if(count.n!==job.expected_entries)throw new ApiError(409,'RESTORE_INCOMPLETE','记录未齐，循环标识暂不恢复');
      await c.env.DB.batch(bulkInsert(c.env.DB,'text_slots',['ledger_id','batch_id','item_id','occurred_on','entry_id'],manifest.text_slots.map(s=>[job.ledger_id,s.batch_id,s.item_id,s.occurred_on,s.entry_id]),true,job.ledger_id));
    }
    const backup = await exportBackup(c.env.DB, ledger);
    const validation = validateBackup(backup);
    if (!validation.valid || backup.entries.length !== job.expected_entries || backup.categories.length !== job.expected_categories || await digest(backupContent(backup)) !== job.fingerprint) throw new ApiError(409, 'RESTORE_INCOMPLETE', '恢复数据尚未完整或内容不一致，请使用同一备份继续恢复');
    const finished = await c.env.DB.batch([
      statement(c.env.DB, 'UPDATE ledgers SET status=\'ready\' WHERE id=? AND EXISTS(SELECT 1 FROM restores WHERE ledger_id=? AND write_version=?)', [job.ledger_id, job.ledger_id, job.write_version]),
      statement(c.env.DB, 'UPDATE restores SET completed_at=COALESCE(completed_at,?) WHERE ledger_id=? AND write_version=?', [stamp(), job.ledger_id, job.write_version]),
    ]);
    if (!finished[0].meta.changes) throw new ApiError(409, 'RESTORE_CHANGED', '恢复数据仍在写入，请稍后再次校验');
    return c.json({ id: job.ledger_id, complete: true, summary: validation.summary, active_ledger_unchanged: true });
  });
}
