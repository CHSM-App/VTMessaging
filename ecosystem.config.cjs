// PM2 process file. From the repository root:
//   npm --prefix backend run build
//   pm2 start ecosystem.config.cjs && pm2 save
// API and worker are separate processes: the worker owns the WhatsApp connections.
const common = {
  cwd: `${__dirname}/backend`, // backend/.env is loaded from here
  env: { NODE_ENV: 'production' },
  autorestart: true,
  max_restarts: 50,
  exp_backoff_restart_delay: 1000,
  max_memory_restart: '700M',
  shutdown_with_message: true, // graceful shutdown on Windows too (no POSIX signals there)
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'vengurla-messaging-api',
      script: 'dist/app/server.js',
      kill_timeout: 20000,
    },
    {
      ...common,
      name: 'vengurla-messaging-worker',
      script: 'dist/worker.js',
      // One worker only: a Baileys session must never be opened by two processes at once.
      instances: 1,
      kill_timeout: 35000, // lets in-flight sends finish and Baileys save its session
    },
  ],
};
