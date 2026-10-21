const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const staging = path.join(root, 'dist', 'release-source');
if (!staging.startsWith(root + path.sep) || path.relative(root, staging) !== path.join('dist', 'release-source')) throw new Error('Invalid staging path');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
for (const name of ['mains', 'renderers', 'shared', 'app-icons', 'package.json', 'package-lock.json', 'LICENSE']) {
  fs.cpSync(path.join(root, name), path.join(staging, name), {
    recursive: true,
    filter: source => !['demo.gif', 'MeisunryKey.png', 'commandKey.png', 'Success.png'].includes(path.basename(source)),
  });
}
// Only runtime dependencies enter the isolated build directory.
execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund'], {
  cwd: staging,
  stdio: 'inherit',
});
console.log('Prepared isolated release source without local settings or caches.');
