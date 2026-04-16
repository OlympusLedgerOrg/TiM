/**
 * TiM Desktop — Port Detection Service
 *
 * Finds available ports for the backend server.
 * Handles port conflicts gracefully.
 */

import net from 'net';
import { logger } from './logger.js';

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other error - assume port is unavailable
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from the given port
 * Will try incrementing ports if the preferred one is taken
 */
export async function findAvailablePort(
  preferredPort: number,
  maxAttempts: number = 10
): Promise<number> {
  let port = preferredPort;

  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) {
      if (port !== preferredPort) {
        logger.info(`Port ${preferredPort} was in use, using ${port} instead`);
      }
      return port;
    }
    port++;
  }

  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts (tried ${preferredPort}-${port - 1})`
  );
}

/**
 * Find multiple available ports
 * Useful for running both backend and frontend dev servers
 */
export async function findAvailablePorts(
  count: number,
  startPort: number = 4000
): Promise<number[]> {
  const ports: number[] = [];
  let port = startPort;

  while (ports.length < count) {
    if (await isPortAvailable(port)) {
      ports.push(port);
    }
    port++;

    // Safety limit
    if (port > startPort + 100) {
      throw new Error(`Could not find ${count} available ports`);
    }
  }

  return ports;
}

/**
 * Wait for a port to become available (e.g., after server shutdown)
 */
export async function waitForPortToFree(
  port: number,
  timeoutMs: number = 10000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await isPortAvailable(port)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Wait for a port to become used (server started)
 */
export async function waitForPortInUse(
  port: number,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (!(await isPortAvailable(port))) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}
