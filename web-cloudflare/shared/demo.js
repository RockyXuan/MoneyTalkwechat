import { DEFAULT_CATEGORIES, TIMEZONE } from './domain.js';

// Entirely synthetic records. The fixed fixture is also the visual acceptance dataset.
export function demoBackup() {
  const entries = [];
  const add = (id, day, category_id, amount_minor, note, type = 'expense', hour = '12:00') => entries.push({ id: `demo-${id}`, type, amount_minor, category_id, occurred_on: `2026-09-${String(day).padStart(2, '0')}`, note, version: 1, created_at: `2026-09-${String(day).padStart(2, '0')}T${hour}:00.000Z`, updated_at: `2026-09-${String(day).padStart(2, '0')}T${hour}:00.000Z`, deleted_at: null });
  add('lunch', 14, 'food', 3500, '午餐', 'expense', '04:28');
  add('metro', 14, 'transport', 600, '地铁', 'expense', '00:17');
  add('grocery', 13, 'shopping', 9800, '超市采购', 'expense', '11:43');
  add('coffee', 13, 'food', 2600, '咖啡', 'expense', '06:26');
  add('daily', 12, 'living', 12800, '日用品');
  add('salary', 10, 'salary', 1800000, '工资', 'income');
  const targets = { food: 124000 - 6100, shopping: 96800 - 9800, transport: 52000 - 600, living: 32000 - 12800, other: 20000 };
  for (const [category, total] of Object.entries(targets)) {
    const weights = [4, 6, 11, 18, 8, 5, 7, 10, 15, 10, 6];
    let assigned = 0;
    weights.forEach((weight, i) => {
      const amount = i === weights.length - 1 ? total - assigned : Math.floor(total * weight / 100);
      assigned += amount;
      add(`${category}-${i}`, i + 1, category, amount, `${DEFAULT_CATEGORIES.find(c => c.id === category).name}记录`);
    });
  }
  return { format: 'moneytalk-backup', version: 1, exported_at: '2026-09-14T08:00:00.000Z', ledger: { name: '演示账本', currency: 'CNY', timezone: TIMEZONE }, categories: DEFAULT_CATEGORIES, entries };
}
