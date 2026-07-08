import { config } from './config.js';
import { logger } from './logger.js';
import { createServer } from './server.js';

if (!config.anthropicApiKey) {
  logger.warn(
    'ANTHROPIC_API_KEY is not set — the moderation engine and Claude Code provider will fail. ' +
      (config.moderation.failClosed
        ? 'FAIL_CLOSED is on, so all requests will be blocked until a key is provided.'
        : 'FAIL_CLOSED is off, so moderation will fail OPEN (unsafe) until a key is provided.'),
  );
}

const app = createServer();

const server = app.listen(config.port, config.host, () => {
  logger.info('child-safe-ai gateway listening', {
    host: config.host,
    port: config.port,
    moderationModel: config.moderation.model,
    maxConcurrentRequests: config.http.maxConcurrentRequests,
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
  });
}
