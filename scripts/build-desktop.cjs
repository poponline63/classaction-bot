const { spawnSync } = require('node:child_process');

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(command, ['run', 'build'], {
  env: {
    ...process.env,
    NEXT_STANDALONE: 'true',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
