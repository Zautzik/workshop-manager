import pino from 'pino';

/**
 * Application-wide structured logger (pino).
 *
 * Usage in API routes:
 *   import logger from '@/lib/logger';
 *   logger.info({ requestId, userId }, 'OT updated');
 *   logger.error({ err, requestId }, 'DB write failed');
 *
 * The request ID is injected by src/middleware.ts and forwarded via the
 * 'x-request-id' header. API routes can read it with:
 *   req.headers.get('x-request-id') ?? 'unknown'
 *
 * Log level is controlled by the LOG_LEVEL env var (default: 'info').
 * In tests the level is silenced automatically.
 */
const logger = pino({
	level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
});

export default logger;
