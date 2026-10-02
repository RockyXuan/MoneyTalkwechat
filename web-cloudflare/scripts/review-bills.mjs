import { readFile, mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import { resolve, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFiles, REVIEW_LIMITS } from '../shared/bill-review.js';

export async function reviewLocalBills(inputPaths, outputDirectory, account) {
  const project = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const output = resolve(outputDirectory), parent = await realpath(resolve(output, '..'));
  const actualOutput = resolve(parent, basename(output));
  const repo = await realpath(resolve(project, '..'));
  const inside = relative(repo, actualOutput);
  if (!inside || (!inside.startsWith(`..${sep}`) && !inside.startsWith(`web-cloudflare${sep}local-data${sep}`))) throw new Error('真实报告不得写入 Git 跟踪目录；请选择项目外的目录或 local-data 下的新目录');
  const files = [];
  for (const path of inputPaths) {
    const full = resolve(path), info = await stat(full);
    if (!info.isFile()) throw new Error('输入必须是原始账单文件');
    if (info.size > REVIEW_LIMITS.file_bytes) throw new Error('每份原始 CSV 最大 4 MB');
    if (files.reduce((n, file) => n + file.size, info.size) > REVIEW_LIMITS.batch_bytes) throw new Error('单批文件合计最大 20 MB');
    const bytes = await readFile(full);
    files.push({ name: basename(full), size: bytes.byteLength, arrayBuffer: async () => bytes, bytes });
  }
  const report = await reviewFiles(files, { account });
  await mkdir(actualOutput, { mode: 0o700 }); // No recursive/overwrite: existing directory is an error.
  for (const [index, file] of files.entries()) {
    const name = `${String(index + 1).padStart(2, '0')}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, '_')}`;
    await writeFile(resolve(actualOutput, name), file.bytes, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(resolve(actualOutput, 'review-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(actualOutput, 'completed.json'), JSON.stringify({ read_only: true, originals: files.length, report: 'review-report.json' }), { flag: 'wx', mode: 0o600 });
  return report;
}
async function main() {
  const [output, account, ...inputs] = process.argv.slice(2);
  if (!output || !account || !inputs.length) throw new Error('用法：pnpm bills:review <全新输出目录> <来源账户标记> <原始CSV...>');
  const report = await reviewLocalBills(inputs, output, account);
  console.log(`仅完成离线核对：候选 ${report.totals.candidate_count} 笔，待核对 ${report.totals.review_count} 笔，文件异常 ${report.issues.length} 项，重复证据 ${report.duplicates.length} 行。未写入任何账本。`);
  if (report.issues.length) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
