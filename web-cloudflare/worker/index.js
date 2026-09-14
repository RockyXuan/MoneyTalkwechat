import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ApiError, authenticate, requireSameOrigin } from './auth.js';
import { all, first, statement, stamp, initUser, ownedLedger, validateCategory, operation, entryInsert, filters, categoryRow, exportBackup, exportCsv } from './store.js';
import { entryInput, categoryInput, validDate, today, periodRange, buckets } from '../shared/domain.js';
import { registerRestores } from './restores.js';

const entryColumns = 'e.id,e.type,e.amount_minor,e.category_id,e.occurred_on,e.note,e.version,e.created_at,e.updated_at,e.deleted_at,c.name AS category_name,c.color_key,c.icon';
const joined = 'entries e JOIN categories c ON c.ledger_id=e.ledger_id AND c.id=e.category_id';
const versionSchema = z.number().int().min(1);
const querySchema = z.object({
  from: z.string().refine(validDate).optional(), to: z.string().refine(validDate).optional(),
  type: z.enum(['expense', 'income']).optional(), category_id: z.string().max(100).optional(),
  q: z.string().trim().max(200).optional(), deleted: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
function query(c) {
  const q = querySchema.parse(c.req.query());
  if (q.from && q.to && q.from > q.to) throw new ApiError(400, 'INVALID_RANGE', '开始日期不能晚于结束日期');
  return q;
}
export function createApp({ verifyIdentity = authenticate, onUnexpectedError = null } = {}) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (c.req.path.startsWith('/api')) c.header('Cache-Control', 'no-store, private');
  });
  app.use('/api/*', bodyLimit({ maxSize: 20 * 1024 * 1024, onError: c => c.json({ error: { code: 'TOO_LARGE', message: '文件超过 20 MB，请拆分后再恢复' } }, 413) }));
  app.use('/api/*', async (c, next) => {
    requireSameOrigin(c.req.raw, c.env);
    const identity = await verifyIdentity(c.req.raw, c.env);
    if (!c.env.DB) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', '账本数据库尚未配置');
    const user = await initUser(c.env.DB, identity);
    c.set('identity', identity); c.set('user', user);
    const ledgerId = c.req.header('X-Ledger-Id') || user.active_ledger_id;
    c.set('ledger', await ownedLedger(c.env.DB, user.id, ledgerId));
    await next();
  });
  app.get('/api/session', async c => {
    const ledgers = await all(c.env.DB, 'SELECT id,name,currency,timezone,status FROM ledgers WHERE owner_id=? AND status=\'ready\' ORDER BY created_at', [c.get('user').id]);
    return c.json({ user: { id: c.get('user').id, email: c.get('identity').email }, ledger: c.get('ledger'), ledgers, local: Boolean(c.get('identity').local), today: today() });
  });
  app.get('/api/operations/:key', async c => {
    const row = await first(c.env.DB, 'SELECT response_json FROM operations WHERE user_id=? AND ledger_id=? AND key=?', [c.get('user').id, c.get('ledger').id, c.req.param('key')]);
    return c.json({ found: Boolean(row), result: row ? JSON.parse(row.response_json) : null });
  });
  app.post('/api/ledgers/:id/activate', async c => {
    const target = await ownedLedger(c.env.DB, c.get('user').id, c.req.param('id'));
    await statement(c.env.DB, 'UPDATE users SET active_ledger_id=? WHERE id=?', [target.id, c.get('user').id]).run();
    return c.json({ ledger: target });
  });
  app.get('/api/categories', async c => c.json({ categories: (await all(c.env.DB, 'SELECT id,name,type,color_key,icon,sort_order,archived,version FROM categories WHERE ledger_id=? ORDER BY sort_order,id', [c.get('ledger').id])).map(categoryRow) }));
  app.post('/api/categories', async c => {
    const value = categoryInput.parse(await c.req.json());
    const db = c.env.DB, ledger = c.get('ledger').id;
    const count = await first(db, 'SELECT COUNT(*) AS n FROM categories WHERE ledger_id=?', [ledger]);
    if (count.n >= 100) throw new ApiError(400, 'CATEGORY_LIMIT', '一个账本最多支持 100 个分类');
    const category = { id: crypto.randomUUID(), ...value, version: 1 };
    const result = await operation(db, c.get('user'), ledger, c.req.header('Idempotency-Key'), { route: 'create-category', value }, { category }, [statement(db, 'INSERT INTO categories(ledger_id,id,name,type,color_key,icon,sort_order,archived) VALUES(?,?,?,?,?,?,?,?)', [ledger, category.id, value.name, value.type, value.color_key, value.icon, value.sort_order, Number(value.archived)])]);
    return c.json(result, 201);
  });
  app.patch('/api/categories/:id', async c => {
    const { version, ...value } = categoryInput.extend({ version: versionSchema }).parse(await c.req.json());
    const db = c.env.DB, ledger = c.get('ledger').id, id = c.req.param('id');
    const old = await first(db, 'SELECT * FROM categories WHERE ledger_id=? AND id=?', [ledger, id]);
    if (!old) throw new ApiError(404, 'NOT_FOUND', '分类不存在');
    if (old.type !== value.type && await first(db, 'SELECT id FROM entries WHERE ledger_id=? AND category_id=? LIMIT 1', [ledger, id])) throw new ApiError(400, 'CATEGORY_IN_USE', '已有记录的分类不能切换收入或支出类型');
    const result = await operation(db, c.get('user'), ledger, c.req.header('Idempotency-Key'), { route: 'update-category', id, version, value }, { category: { id, ...value, version: version + 1 } }, [statement(db, 'UPDATE categories SET name=?,type=?,color_key=?,icon=?,sort_order=?,archived=?,version=version+1 WHERE ledger_id=? AND id=? AND version=?', [value.name, value.type, value.color_key, value.icon, value.sort_order, Number(value.archived), ledger, id, version])], { sql: 'EXISTS(SELECT 1 FROM categories WHERE ledger_id=? AND id=? AND version=?)', values: [ledger, id, version] });
    return c.json(result);
  });
  app.get('/api/entries', async c => {
    const q = query(c), f = filters(q, c.get('ledger').id);
    const result = await c.env.DB.batch([
      statement(c.env.DB, `SELECT ${entryColumns} FROM ${joined} WHERE ${f.sql} ORDER BY e.occurred_on DESC,e.created_at DESC,e.id DESC LIMIT ? OFFSET ?`, [...f.values, q.limit, q.offset]),
      statement(c.env.DB, `SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN e.type='expense' THEN e.amount_minor ELSE 0 END),0) AS expense_minor,COALESCE(SUM(CASE WHEN e.type='income' THEN e.amount_minor ELSE 0 END),0) AS income_minor FROM ${joined} WHERE ${f.sql}`, f.values),
      statement(c.env.DB, `SELECT e.occurred_on,COUNT(*) AS count,SUM(CASE WHEN e.type='expense' THEN e.amount_minor ELSE 0 END) AS expense_minor,SUM(CASE WHEN e.type='income' THEN e.amount_minor ELSE 0 END) AS income_minor FROM ${joined} WHERE ${f.sql} GROUP BY e.occurred_on ORDER BY e.occurred_on DESC`, f.values),
    ]);
    return c.json({ entries: result[0].results, totals: result[1].results[0], days: result[2].results, limit: q.limit, offset: q.offset });
  });
  app.get('/api/entries/:id', async c => {
    const entry = await first(c.env.DB, `SELECT ${entryColumns} FROM ${joined} WHERE e.ledger_id=? AND e.id=?`, [c.get('ledger').id, c.req.param('id')]);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', '记录不存在或无权访问');
    return c.json({ entry });
  });
  app.post('/api/entries', async c => {
    const value = entryInput.parse(await c.req.json());
    if (value.occurred_on > today()) throw new ApiError(400, 'FUTURE_DATE', '请选择今天或之前的记账日期');
    const db = c.env.DB, ledger = c.get('ledger').id;
    await validateCategory(db, ledger, value);
    const now = stamp();
    const entry = { id: crypto.randomUUID(), ...value, version: 1, created_at: now, updated_at: now, deleted_at: null };
    const result = await operation(db, c.get('user'), ledger, c.req.header('Idempotency-Key'), { route: 'create-entry', value }, { entry }, [entryInsert(db, ledger, entry)]);
    return c.json(result, 201);
  });
  app.patch('/api/entries/:id', async c => {
    const { version, ...value } = entryInput.extend({ version: versionSchema }).parse(await c.req.json());
    if (value.occurred_on > today()) throw new ApiError(400, 'FUTURE_DATE', '请选择今天或之前的记账日期');
    const db = c.env.DB, ledger = c.get('ledger').id, id = c.req.param('id');
    const old = await first(db, 'SELECT * FROM entries WHERE ledger_id=? AND id=?', [ledger, id]);
    if (!old) throw new ApiError(404, 'NOT_FOUND', '记录不存在或无权访问');
    await validateCategory(db, ledger, value, old);
    const updated_at = stamp();
    const entry = { id, ...value, version: version + 1, created_at: old.created_at, updated_at, deleted_at: null };
    const result = await operation(db, c.get('user'), ledger, c.req.header('Idempotency-Key'), { route: 'update-entry', id, version, value }, { entry }, [statement(db, 'UPDATE entries SET type=?,amount_minor=?,category_id=?,occurred_on=?,note=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=? AND deleted_at IS NULL', [value.type, value.amount_minor, value.category_id, value.occurred_on, value.note, updated_at, ledger, id, version])], { sql: 'EXISTS(SELECT 1 FROM entries WHERE ledger_id=? AND id=? AND version=? AND deleted_at IS NULL)', values: [ledger, id, version] });
    return c.json(result);
  });
  for (const action of ['delete', 'restore']) {
    app.post(`/api/entries/:id/${action}`, async c => {
      const { version } = z.object({ version: versionSchema }).strict().parse(await c.req.json());
      const db = c.env.DB, ledger = c.get('ledger').id, id = c.req.param('id');
      const now = stamp(), deleted_at = action === 'delete' ? now : null;
      const state = action === 'delete' ? 'deleted_at IS NULL' : 'deleted_at IS NOT NULL';
      const response = { id, version: version + 1, deleted_at };
      const result = await operation(db, c.get('user'), ledger, c.req.header('Idempotency-Key'), { route: action, id, version }, response, [statement(db, `UPDATE entries SET deleted_at=?,updated_at=?,version=version+1 WHERE ledger_id=? AND id=? AND version=? AND ${state}`, [deleted_at, now, ledger, id, version])], { sql: `EXISTS(SELECT 1 FROM entries WHERE ledger_id=? AND id=? AND version=? AND ${state})`, values: [ledger, id, version] });
      return c.json(result);
    });
  }
  app.get('/api/stats', async c => {
    const q = query(c), defaults = periodRange(today().slice(0, 7));
    const from = q.from || defaults.from, to = q.to || defaults.to;
    const bucket = c.req.query('bucket') === 'month' ? 'month' : 'day';
    if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 732) throw new ApiError(400, 'INVALID_RANGE', '统计范围须在两年以内');
    const ledger = c.get('ledger').id;
    const f = filters({ from, to }, ledger);
    const periodSql = bucket === 'day' ? 'e.occurred_on' : 'substr(e.occurred_on,1,7)';
    const result = await c.env.DB.batch([
      statement(c.env.DB, `SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN e.type='expense' THEN e.amount_minor ELSE 0 END),0) AS expense_minor,COALESCE(SUM(CASE WHEN e.type='income' THEN e.amount_minor ELSE 0 END),0) AS income_minor FROM ${joined} WHERE ${f.sql}`, f.values),
      statement(c.env.DB, `SELECT c.id,c.name,c.color_key,c.icon,c.archived,SUM(e.amount_minor) AS amount_minor,COUNT(*) AS count FROM ${joined} WHERE ${f.sql} AND e.type='expense' GROUP BY c.id ORDER BY amount_minor DESC,c.id`, f.values),
      statement(c.env.DB, `SELECT ${periodSql} AS bucket,e.category_id,SUM(e.amount_minor) AS amount_minor FROM ${joined} WHERE ${f.sql} AND e.type='expense' GROUP BY bucket,e.category_id ORDER BY bucket,e.category_id`, f.values),
    ]);
    const totals = result[0].results[0];
    for (const value of [totals.expense_minor, totals.income_minor]) if (!Number.isSafeInteger(value)) throw new ApiError(422, 'AMOUNT_OVERFLOW', '账本金额超出精确计算范围');
    return c.json({ from, to, bucket, buckets: buckets(from, to, bucket), totals, categories: result[1].results.map(categoryRow), series: result[2].results });
  });
  app.get('/api/export.csv', async c => {
    const f = filters(query(c), c.get('ledger').id);
    const rows = await all(c.env.DB, `SELECT ${entryColumns} FROM ${joined} WHERE ${f.sql} ORDER BY e.occurred_on,e.id`, f.values);
    return new Response(exportCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="moneytalk.csv"' } });
  });
  app.get('/api/backup', async c => c.json(await exportBackup(c.env.DB, c.get('ledger'))));
  registerRestores(app);
  app.all('/api/*', c => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));
  app.get('*', c => c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('MoneyTalk API', 200));
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof z.ZodError) return c.json({ error: { code: 'VALIDATION', message: '输入内容不符合要求，请检查金额、日期和分类', details: error.issues.map(e => `${e.path.join('.')}: ${e.message}`).slice(0, 10) } }, 400);
    if (error instanceof SyntaxError) return c.json({ error: { code: 'INVALID_JSON', message: '文件或请求不是有效的 JSON' } }, 400);
    if (/UNIQUE constraint failed: categories/.test(error.message)) return c.json({ error: { code: 'DUPLICATE_CATEGORY', message: '同类型下已有这个分类名称' } }, 409);
    // No request bodies, entry text, tokens, or personal financial data are logged.
    onUnexpectedError?.(error);
    console.error('moneytalk_request_failed', error.name);
    return c.json({ error: { code: 'SERVICE_ERROR', message: '服务暂时不可用，输入已保留，请稍后重试' } }, 500);
  });
  return app;
}
export default createApp();
