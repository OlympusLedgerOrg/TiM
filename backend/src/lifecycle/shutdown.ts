import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../prisma/client.js';
import { logger } from '../services/logger.js';

/**
 * Registers SIGTERM / SIGINT handlers that perform an orderly shutdown:
 *
 * 1. Run `hooks.beforeClose` — background workers stop here.
 * 2. Disconnect all Socket.IO clients gracefully.
 * 3. Stop accepting new connections.
 * 4. Close the Prisma database connection pool.
 * 5. Exit with code 0.
 *
 * A hard-kill timeout ensures the process never hangs indefinitely
 * (e.g. when a TCP connection is stuck in CLOSE_WAIT).
 */
export function registerGracefulShutdown(
  httpServer: Server,
  io: SocketIOServer,
  timeoutMs = 15_000,
  hooks: {
    /**
     * Awaited before anything is torn down, so background workers finish their
     * in-flight work rather than issuing queries against a closing pool.
     */
    beforeClose?: () => Promise<void>;
  } = {},
) {
  let shuttingDown = false; // Prevent duplicate handling

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // Hard-kill safety net
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, timeoutMs);
    forceExit.unref(); // Don't keep the event loop open for the timer

    try {
      // 1. Stop background workers first — they hold the DB pool open and must
      //    not be cut off mid-submission.
      if (hooks.beforeClose) {
        await hooks.beforeClose();
        logger.info('Background workers stopped');
      }

      // 2. Close Socket.IO (disconnects all clients)
      await new Promise<void>((resolve) => {
        io.close(() => {
          logger.info('Socket.IO connections closed');
          resolve();
        });
      });

      // 3. Stop accepting new HTTP connections and drain existing ones
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            logger.error({ err }, 'Error closing HTTP server');
            return reject(err);
          }
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // 4. Disconnect Prisma
      await prisma.$disconnect();
      logger.info('Database connection closed');

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
