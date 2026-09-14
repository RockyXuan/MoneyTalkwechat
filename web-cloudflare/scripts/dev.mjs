import { spawn, spawnSync } from 'node:child_process';
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const args of [['build'], ['db:local']]) {
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
const children = [spawn(executable, ['preview'], { stdio: 'inherit' }), spawn(executable, ['exec', 'vite'], { stdio: 'inherit' })];
let closing = false;
const stop = () => { if (closing) return; closing = true; children.forEach(child => child.kill('SIGTERM')); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { if (!closing) { stop(); process.exitCode = code || 0; } }));
