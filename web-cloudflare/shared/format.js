export const TIMEZONE = 'Asia/Shanghai';
export const MAX_AMOUNT = 9_999_999_999;
export const PALETTE = { blue: '#2F6FEB', orange: '#EF8C36', green: '#269C78', purple: '#8B65CE', slate: '#8A95A6', brown: '#B07B50', pink: '#C65AB1', red: '#CB5969', teal: '#258EAF', indigo: '#6066BD', olive: '#7F9347', amber: '#A87715' };
export const DEFAULT_CATEGORIES = [
  ['food', '餐饮', 'expense', 'blue', 'utensils'],
  ['transport', '交通', 'expense', 'green', 'bus'],
  ['shopping', '购物', 'expense', 'orange', 'shopping-bag'],
  ['entertainment', '娱乐', 'expense', 'pink', 'gamepad-2'],
  ['housing', '住房', 'expense', 'brown', 'house'],
  ['medical', '医疗', 'expense', 'red', 'circle-plus'],
  ['education', '教育', 'expense', 'teal', 'graduation-cap'],
  ['living', '生活', 'expense', 'purple', 'leaf'],
  ['other', '其他', 'expense', 'slate', 'ellipsis'],
  ['salary', '工资', 'income', 'green', 'banknote'],
  ['bonus', '奖金', 'income', 'amber', 'gift'],
  ['other-income', '其他收入', 'income', 'teal', 'wallet'],
].map(([id, name, type, color_key, icon], sort_order) => ({ id, name, type, color_key, icon, sort_order, archived: false }));
export const ICONS = ['utensils', 'bus', 'shopping-bag', 'gamepad-2', 'house', 'circle-plus', 'graduation-cap', 'leaf', 'ellipsis', 'banknote', 'gift', 'wallet'];

export function today(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function parseAmount(text) {
  const value = String(text ?? '').trim();
  if (!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error('请输入大于 0 的金额，最多保留两位小数');
  const [whole, fraction = ''] = value.replaceAll(',', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result < 1n || result > BigInt(MAX_AMOUNT)) throw new Error('金额须在 0.01 至 99,999,999.99 元之间');
  return Number(result);
}
export function decimal(minor) {
  if (!Number.isSafeInteger(minor)) throw new Error('金额超出精确计算范围');
  const sign = minor < 0 ? '-' : '';
  const n = Math.abs(minor);
  return `${sign}${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}
export function money(minor, symbol = true) {
  const [whole, fraction] = decimal(minor).split('.');
  return `${symbol ? '¥ ' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
export function periodRange(month, kind = 'month', currentDay = today()) {
  const [year, m] = month.split('-').map(Number);
  const startMonth = kind === 'year' ? 1 : kind === 'quarter' ? Math.floor((m - 1) / 3) * 3 + 1 : m;
  const count = kind === 'year' ? 12 : kind === 'quarter' ? 3 : 1;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const until = new Date(Date.UTC(year, startMonth - 1 + count, 0)).toISOString().slice(0, 10);
  return { from, to: from <= currentDay && currentDay < until ? currentDay : until, bucket: kind === 'month' ? 'day' : 'month' };
}
export function buckets(from, to, bucket) {
  const result = [];
  const d = new Date(`${from}T00:00:00Z`);
  if (bucket === 'month') d.setUTCDate(1);
  while (d.toISOString().slice(0, 10) <= to) {
    result.push(d.toISOString().slice(0, bucket === 'day' ? 10 : 7));
    if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return result;
}
export function exactSum(values) {
  const sum = values.reduce((a, b) => a + BigInt(b), 0n);
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('账本汇总超出精确计算范围');
  return Number(sum);
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
