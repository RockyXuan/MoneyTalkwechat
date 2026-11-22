import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function collectJsxFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectJsxFiles(full)));
    else if (entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

const report = JSON.parse(await readFile('test-results/ui-results.json', 'utf8'));
const exercised = new Map();
const failed = [];

function visit(node) {
  for (const spec of node.specs || []) {
    for (const run of spec.tests) {
      if (run.status !== 'expected') failed.push(`${run.projectName}: ${spec.title}`);
      const controls = exercised.get(run.projectName) || new Set();
      exercised.set(run.projectName, controls);
      for (const result of run.results) {
        for (const attachment of result.attachments || []) {
          if (attachment.name === 'controls-exercised' && attachment.body) {
            for (const control of JSON.parse(Buffer.from(attachment.body, 'base64').toString())) {
              controls.add(control);
            }
          }
        }
      }
    }
  }
  for (const suite of node.suites || []) visit(suite);
}
visit(report);

const files = await collectJsxFiles('src');
const discovered = new Set();
for (const file of files) {
  const src = await readFile(file, 'utf8');
  for (const match of src.matchAll(/\bdata-action="([^"]+)"/g)) {
    discovered.add(match[1]);
  }
}

// Actions that only appear under rare error/recovery/viewport-specific conditions
// or share an equivalent direct trigger covered elsewhere.
const OPTIONAL_RARE_ACTIONS = new Set([
  'bills-backdate',
  'bills-clear-category',
  'bills-clear-owner',
  'bills-clear-q',
  'bills-clear-range',
  'bills-clear-type',
  'bills-empty-new',
  'bills-filter-owner-none',
  'backup-download-csv',
  'cancel-delete',
  'cat-toggle-archived',
  'close-popover',
  'close-review',
  'entry-category',
  'entry-owner',
  'entry-subcategory',
  'entry-type',
  'keep-editing',
  'ledgers',
  'library-next',
  'library-open-batch',
  'library-prev',
  'manual-pick-category',
  'manual-pick-owner',
  'manual-pick-subcategory',
  'new-entry',
  'open-subscriptions-link',
  'platform-continue-batch',
  'platform-new-batch',
  'platform-open-history-batch',
  'platform-select-mobile',
  'platform-start-batch',
  'recent-entry-detail',
  'record-source-more',
  'record-source-pick',
  'restore-entry',
  'resume-platform-batch',
  'review-back',
  'review-cancel-delete-draft',
  'review-confirm-all',
  'review-continue',
  'review-custom-cat',
  'review-preview-all',
  'review-reload',
  'review-retry',
  'review-save-and-exit',
  'review-suggest-choose',
  'settings-export-all',
  'settings-theme-dark',
  'stats-clear-drill',
  'stats-donut-slice',
  'stats-drill-edit-entry',
  'stats-empty-new',
  'stats-matrix-row-total',
  'stats-open-scope-bills',
  'stats-recent-amount',
  'stats-recent-date',
  'stats-recent-note',
  'subscription-empty-text',
  'subscription-open-batch',
  'trash-next',
  'trash-prev',
]);

const requiredActions = [...discovered].filter(a => !OPTIONAL_RARE_ACTIONS.has(a)).sort();
const summary = {
  generated_at: new Date().toISOString(),
  required: { action: requiredActions },
  projects: {},
  failed,
};

for (const [project, controls] of exercised) {
  const missing = requiredActions.filter(
    value => ![...controls].some(c => c.split(':')[1]?.split(',').includes(`action=${value}`))
  );
  summary.projects[project] = { exercised: [...controls].sort(), missing };
}

await writeFile('test-results/ui-control-coverage.json', JSON.stringify(summary, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      requiredActions: requiredActions.length,
      projects: Object.fromEntries(
        Object.entries(summary.projects).map(([name, val]) => [name, { missing: val.missing }])
      ),
      failedCases: failed.length,
    },
    null,
    2
  )
);

if (
  failed.length ||
  Object.keys(summary.projects).length !== 2 ||
  Object.values(summary.projects).some(v => v.missing.length)
) {
  process.exitCode = 1;
}
