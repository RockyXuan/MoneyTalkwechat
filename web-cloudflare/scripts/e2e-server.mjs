import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Entirely local acceptance DB, unrelated to personal/production D1.
const persist = await mkdtemp(join(tmpdir(), 'moneytalk-ui-e2e-'));
let child;
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Only terminate the process group created by this script, never other dev servers.
  if (child && child.exitCode === null) {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
async function run(args) {
  await new Promise((resolve, reject) => {
    child = spawn('pnpm', args, { stdio: 'inherit', detached: process.platform !== 'win32' });
    child.on('error', reject);
    child.on('exit', code => code === 0 || stopping ? resolve() : reject(new Error(`Local acceptance command exited ${code}`)));
  });
}
try {
  await run(['build']);
  if (!stopping) await run(['exec', 'wrangler', 'd1', 'migrations', 'apply', 'moneytalk-local', '--local', '--env', 'local', '--persist-to', persist]);
  if (!stopping) await run(['exec', 'wrangler', 'dev', '--env', 'local', '--ip', '127.0.0.1', '--port', '8791', '--persist-to', persist]);
} finally {
  // This directory was created above and contains only synthetic acceptance data.
  await rm(persist, { recursive: true, force: true });
}
