const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules', 'playwright', 'cli.js');

const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  cwd: root,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
