import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile('test-results/ui-results.json', 'utf8'));
const exercised = new Map();
const failed = [];
function visit(node) {
  for (const spec of node.specs || []) for (const run of spec.tests) {
    if (run.status !== 'expected') failed.push(`${run.projectName}: ${spec.title}`);
    const controls = exercised.get(run.projectName) || new Set();
    exercised.set(run.projectName, controls);
    for (const result of run.results) for (const attachment of result.attachments || []) {
      if (attachment.name === 'controls-exercised' && attachment.body) {
        for (const control of JSON.parse(Buffer.from(attachment.body, 'base64').toString())) controls.add(control);
      }
    }
  }
  for (const suite of node.suites || []) visit(suite);
}
visit(report);
const sources = { action: await readFile('src/app.js', 'utf8'), textAction: await readFile('src/text-record-ui.js', 'utf8') };
const required = Object.fromEntries(Object.entries(sources).map(([kind, source]) => [kind, [...new Set([...source.matchAll(/\baction\s*===\s*['"]([^'"]+)['"]/g)].map(match => match[1]))].sort()]));
const summary = { generated_at: new Date().toISOString(), required, projects: {}, failed };
for (const [project, controls] of exercised) {
  const missing = [];
  for (const [kind, actions] of Object.entries(required)) for (const value of actions) {
    if (![...controls].some(control => control.split(':')[1]?.split(',').includes(`${kind}=${value}`))) missing.push(`${kind}=${value}`);
  }
  summary.projects[project] = { exercised: [...controls].sort(), missing };
}
await writeFile('test-results/ui-control-coverage.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ requiredMainActions: required.action.length, requiredTextActions: required.textAction.length, projects: Object.fromEntries(Object.entries(summary.projects).map(([name, value]) => [name, { missing: value.missing }])), failedCases: failed.length }, null, 2));
if (failed.length || Object.keys(summary.projects).length !== 2 || Object.values(summary.projects).some(value => value.missing.length)) process.exitCode = 1;
