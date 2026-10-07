const { spawnSync } = require('child_process');

const args = process.argv.slice(2).map((a) => a.replace(/^[/\\]?apps[/\\]quantube[/\\]/, ''));
const res = spawnSync('npx', ['vitest', 'run', ...args], {
  stdio: 'inherit',
  shell: true,
});

process.exit(res.status ?? 0);
