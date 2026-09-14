import { z } from 'zod';
import { MAX_AMOUNT, ICONS, PALETTE, TIMEZONE, validDate, exactSum } from './format.js';
export * from './format.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const date = z.string().refine(validDate, '日期无效');
const timestamp = z.iso.datetime();
export const entryInput = z.object({
  type: z.enum(['expense', 'income']), amount_minor: z.number().int().min(1).max(MAX_AMOUNT),
  category_id: id, occurred_on: date, note: z.string().trim().max(200).default(''),
}).strict();
export const categoryInput = z.object({
  name: z.string().trim().min(1).max(32), type: z.enum(['expense', 'income']),
  color_key: z.enum(Object.keys(PALETTE)), icon: z.enum(ICONS),
  sort_order: z.number().int().min(0).max(10000).default(100), archived: z.boolean().default(false),
}).strict();
export const backupCategory = categoryInput.extend({ id });
export const backupEntry = entryInput.extend({ id, version: z.number().int().min(1), created_at: timestamp, updated_at: timestamp, deleted_at: timestamp.nullable() });
export const backupSchema = z.object({
  format: z.literal('moneytalk-backup'), version: z.literal(1), exported_at: timestamp,
  ledger: z.object({ name: z.string().trim().min(1).max(64), currency: z.literal('CNY'), timezone: z.literal(TIMEZONE) }).strict(),
  categories: z.array(backupCategory).max(100), entries: z.array(backupEntry).max(50000),
}).strict();
export function validateBackup(raw) {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.slice(0, 30).map(x => `${x.path.join('.')}: ${x.message}`) };
  const data = parsed.data;
  const errors = [];
  const cats = new Map();
  const names = new Set();
  for (const c of data.categories) {
    if (cats.has(c.id)) errors.push(`分类 ID 重复：${c.id}`);
    const nameKey = `${c.type}:${c.name}`;
    if (names.has(nameKey)) errors.push(`同类型分类名称重复：${c.name}`);
    names.add(nameKey); cats.set(c.id, c);
  }
  const ids = new Set();
  for (const e of data.entries) {
    if (ids.has(e.id)) errors.push(`账目 ID 重复：${e.id}`);
    ids.add(e.id);
    if (cats.get(e.category_id)?.type !== e.type) errors.push(`账目 ${e.id} 的分类缺失或类型不符`);
    if (e.updated_at < e.created_at) errors.push(`账目 ${e.id} 的修改时间早于创建时间`);
  }
  if (errors.length) return { valid: false, errors: errors.slice(0, 30) };
  const active = data.entries.filter(e => !e.deleted_at);
  return { valid: true, data, errors: [], summary: {
    entries: data.entries.length, active: active.length, deleted: data.entries.length - active.length, categories: data.categories.length,
    expense_minor: exactSum(active.filter(e => e.type === 'expense').map(e => e.amount_minor)),
    income_minor: exactSum(active.filter(e => e.type === 'income').map(e => e.amount_minor)),
    from: active.map(e => e.occurred_on).sort()[0] ?? null, to: active.map(e => e.occurred_on).sort().at(-1) ?? null,
  } };
}
export function backupContent(data) {
  return { ledger: data.ledger, categories: [...data.categories].sort((a, b) => a.id.localeCompare(b.id)), entries: [...data.entries].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
