/**
 * PM2 ecosystem configuration for production deployment.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs        # Start the bot
 *   pm2 restart 28k-bot                   # Restart after deploy
 *   pm2 logs 28k-bot                      # View logs
 *   pm2 monit                              # Monitor in real-time
 */
module.exports = {
  apps: [
    {
      name: '28k-bot',
      script: './apps/bot/dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: '28k-api',
      script: './apps/api/dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
