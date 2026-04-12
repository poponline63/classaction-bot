// PM2 ecosystem — two processes share the SQLite database.
// Start with: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'classaction-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
      },
      max_memory_restart: '512M',
      error_file: './logs/web.err.log',
      out_file: './logs/web.out.log',
      time: true,
    },
    {
      name: 'classaction-worker',
      cwd: __dirname,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'worker/index.ts',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      error_file: './logs/worker.err.log',
      out_file: './logs/worker.out.log',
      time: true,
      // worker is single-instance — do NOT fork it or crons will double-fire
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
