import { DEFAULT_CATEGORIES, TIMEZONE, digest, backupSchema, decimal, csvCell } from '../shared/domain.js';
import { ApiError } from './auth.js';

export const stamp = () => new Date().toISOString();
export const statement = (db, sql, values = []) => db.prepare(sql).bind(...values);
export async function all(db, sql, values = []) { return (await statement(db, sql, values).all()).results; }
export async function first(db, sql, values = []) { return statement(db, sql, values).first(); }
export function entryRow(row) {
  if (!row) return null;
  const { ledger_id, ...entry } = row;
  return entry;
}
export function categoryRow(row) { return { ...row, archived: Boolean(row.archived) }; }
export async function initUser(db, identity) {
  const userId = await digest(`${identity.issuer}|${identity.sub}`);
  const existing = await first(db, 'SELECT * FROM users WHERE id=?', [userId]);
  if (existing) return existing;
  const ledgerId = `personal-${userId.slice(0, 24)}`;
  const created = stamp();
  // The whole bootstrap is atomic. Stable IDs also make concurrent first visits safe.
  await db.batch([
    statement(db, 'INSERT OR IGNORE INTO users(id,email,active_ledger_id,created_at) VALUES(?,?,?,?)', [userId, identity.email, ledgerId, created]),
    statement(db, 'INSERT OR IGNORE INTO ledgers(id,owner_id,name,created_at) VALUES(?,?,?,?)', [ledgerId, userId, '个人账本', created]),
    ...DEFAULT_CATEGORIES.map(c => statement(db, 'INSERT OR IGNORE INTO categories(ledger_id,id,name,type,color_key,icon,sort_order,archived) VALUES(?,?,?,?,?,?,?,0)', [ledgerId, c.id, c.name, c.type, c.color_key, c.icon, c.sort_order])),
  ]);
  return first(db, 'SELECT * FROM users WHERE id=?', [userId]);
}
export async function ownedLedger(db, userId, ledgerId, allowImporting = false) {
  const ledger = await first(db, 'SELECT * FROM ledgers WHERE id=? AND owner_id=?', [ledgerId, userId]);
  if (!ledger) throw new ApiError(403, 'LEDGER_FORBIDDEN', '没有访问这个账本的权限');
  if (!allowImporting && ledger.status !== 'ready') throw new ApiError(409, 'RESTORE_INCOMPLETE', '候选账本尚未通过完整校验');
  return ledger;
}
export async function validateCategory(db, ledgerId, input, previous = null) {
  const cat = await first(db, 'SELECT * FROM categories WHERE ledger_id=? AND id=?', [ledgerId, input.category_id]);
  if (!cat || cat.type !== input.type || (cat.archived && previous?.category_id !== cat.id)) throw new ApiError(400, 'INVALID_CATEGORY', '请选择当前账本中对应类型的有效分类');
}
export async function operation(db, user, ledgerId, key, requestValue, response, writes, condition = null) {
  if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', '缺少有效的提交标识，请刷新页面后重试');
  const hash = await digest(requestValue);
  const lookup = async () => {
    const old = await first(db, 'SELECT * FROM operations WHERE user_id=? AND ledger_id=? AND key=?', [user.id, ledgerId, key]);
    if (old && old.request_hash !== hash) throw new ApiError(409, 'KEY_REUSED', '同一次提交的内容发生变化，请核对原记录后重新提交');
    return old ? JSON.parse(old.response_json) : null;
  };
  const prior = await lookup();
  if (prior) return prior;
  const opValues = [user.id, ledgerId, key, hash, JSON.stringify(response), stamp()];
  const op = condition
    ? statement(db, `INSERT INTO operations(user_id,ledger_id,key,request_hash,response_json,created_at) SELECT ?,?,?,?,?,? WHERE ${condition.sql}`, [...opValues, ...condition.values])
    : statement(db, 'INSERT INTO operations(user_id,ledger_id,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?,?)', opValues);
  try {
    const result = await db.batch([op, ...writes]);
    if (result[0].meta.changes === 0) throw new ApiError(409, 'VERSION_CONFLICT', '这条记录已在其他页面修改，请重新查看后再操作');
    return response;
  } catch (error) {
    const replay = await lookup();
    if (replay) return replay;
    throw error;
  }
}
export function entryInsert(db, ledgerId, e, ignore = false) {
  return statement(db, `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO entries(ledger_id,id,type,amount_minor,category_id,occurred_on,note,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [ledgerId, e.id, e.type, e.amount_minor, e.category_id, e.occurred_on, e.note, e.version, e.created_at, e.updated_at, e.deleted_at]);
}
export function filters(query, ledgerId) {
  const where = ['e.ledger_id=?', query.deleted === 'true' ? 'e.deleted_at IS NOT NULL' : 'e.deleted_at IS NULL'];
  const values = [ledgerId];
  for (const [key, sql] of [['from', 'e.occurred_on>=?'], ['to', 'e.occurred_on<=?'], ['type', 'e.type=?'], ['category_id', 'e.category_id=?']]) {
    if (query[key]) { where.push(sql); values.push(query[key]); }
  }
  if (query.q) {
    where.push("(e.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR CAST(e.amount_minor AS TEXT)=?)");
    const search = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    let amount = -1;
    if (/^\d+(\.\d{1,2})?$/.test(query.q)) {
      const [whole, fraction = ''] = query.q.split('.'); amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    }
    values.push(search, search, String(amount));
  }
  return { sql: where.join(' AND '), values };
}
export async function exportBackup(db, ledger) {
  const result = await db.batch([
    statement(db, 'SELECT id,name,type,color_key,icon,sort_order,archived FROM categories WHERE ledger_id=? ORDER BY id', [ledger.id]),
    statement(db, 'SELECT id,type,amount_minor,category_id,occurred_on,note,version,created_at,updated_at,deleted_at FROM entries WHERE ledger_id=? ORDER BY id', [ledger.id]),
  ]);
  const categories = result[0].results, entries = result[1].results;
  return backupSchema.parse({ format: 'moneytalk-backup', version: 1, exported_at: stamp(), ledger: { name: ledger.name, currency: 'CNY', timezone: TIMEZONE }, categories: categories.map(categoryRow), entries });
}
export function exportCsv(rows) {
  const header = ['日期', '类型', '分类', '金额（元）', '备注', '记录ID'];
  return '\uFEFF' + [header.map(csvCell).join(','), ...rows.map(e => [csvCell(e.occurred_on), csvCell(e.type === 'expense' ? '支出' : '收入'), csvCell(e.category_name), decimal(e.type === 'expense' ? -e.amount_minor : e.amount_minor), csvCell(e.note), csvCell(e.id)].join(','))].join('\r\n');
}
