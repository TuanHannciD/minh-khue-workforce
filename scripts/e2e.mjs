import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--experimental-sqlite', 'node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
