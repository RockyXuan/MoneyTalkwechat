import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATEGORIES, parseAmount, validDate, digest, validateBackup } from '../shared/domain.js';

// Converts an explicitly selected owner's legacy expenses export. Never contacts a service.
export async function convertLegacyRows(rows, ownerId, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(rows) || !ownerId) throw new Error('需要 expenses JSON 数组与明确的旧 user_id');
  const categories = DEFAULT_CATEGORIES.map(c => ({ ...c })), entries = [], issues = [], ids = new Set();
  const report = { source_rows: rows.length, selected_rows: 0, other_owner_rows: 0, copied_creation_time: 0, issues };
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') { issues.push({ row: index + 1, reason: '记录不是对象' }); continue; }
    if (row.user_id !== ownerId) { report.other_owner_rows++; continue; }
    report.selected_rows++;
    try {
      if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,90}$/.test(row.id) || ids.has(row.id)) throw new Error('缺失、重复或无法安全保留的记录 ID');
      ids.add(row.id);
      if (row.status && !['confirmed', 'saved'].includes(row.status)) throw new Error('尚未确认的候选记录');
      if (row.type && row.type !== 'expense') throw new Error('expenses 表出现其他收支类型，须人工确认');
      const amount_minor = parseAmount(row.amount);
      if (!validDate(row.expense_date)) throw new Error('缺失或无效的记账日期，不从 UTC 时间猜测');
      if (typeof row.category !== 'string' || !row.category.trim() || row.category.trim().length > 32) throw new Error('分类缺失或超过 32 字');
      const name = row.category.trim();
      let category = categories.find(c => c.type === 'expense' && c.name === name);
      if (!category) { category = { id: `legacy-cat-${(await digest(name)).slice(0, 20)}`, name, type: 'expense', color_key: 'slate', icon: 'wallet', sort_order: categories.length, archived: false }; categories.push(category); }
      const entry = { id: `legacy-${row.id}`, type: 'expense', amount_minor, category_id: category.id, occurred_on: row.expense_date, note: row.note ?? '', version: 1, created_at: row.created_at, updated_at: row.updated_at || row.created_at, deleted_at: null };
      const check = validateBackup({ format: 'moneytalk-backup', version: 1, exported_at: exportedAt, ledger: { name: '旧账本核对候选', currency: 'CNY', timezone: 'Asia/Shanghai' }, categories, entries: [entry] });
      if (!check.valid) throw new Error(check.errors.join('；'));
      if (!row.updated_at) report.copied_creation_time++;
      entries.push(entry);
    } catch (error) { issues.push({ row: index + 1, id: row.id ?? null, reason: error.message }); }
  }
  const backup = { format: 'moneytalk-backup', version: 1, exported_at: exportedAt, ledger: { name: '旧账本核对候选', currency: 'CNY', timezone: 'Asia/Shanghai' }, categories, entries };
  const validation = validateBackup(backup);
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  return { backup, report: { ...report, accepted_rows: entries.length, needs_review: issues.length > 0, summary: validation.summary, assumptions: ['仅转换指定旧 user_id 的 expenses 表；全部按支出处理。', '缺失 updated_at 时保留 created_at，计入 copied_creation_time。', '原始文件完整另存，异常行不计入候选备份；禁止据此宣布迁移完成。'] } };
}
async function main() {
  const [input, outputDirectory, ownerId] = process.argv.slice(2);
  if (!input || !outputDirectory || !ownerId) throw new Error('用法：pnpm legacy:convert <expenses.json> <全新输出目录> <旧 user_id>');
  const source = resolve(input), target = resolve(outputDirectory);
  const { backup, report } = await convertLegacyRows(JSON.parse(await readFile(source, 'utf8')), ownerId);
  await mkdir(target, { mode: 0o700 }); // Fails if the directory exists: no overwrite.
  await copyFile(source, resolve(target, 'original-expenses.json'));
  for (const [name, data] of [['candidate-backup.json', backup], ['review-report.json', report]]) await writeFile(resolve(target, name), JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`仅完成离线核对：候选 ${report.accepted_rows} 笔，异常 ${report.issues.length} 行。未写入任何账本。`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
