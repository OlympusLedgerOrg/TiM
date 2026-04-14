/**
 * TiM Desktop — Backend Process Manager
 *
 * Spawns and manages the Node.js backend server as a child process.
 * Handles:
 * - Starting and stopping the server
 * - Health checks
 * - Process restart on crash
 * - Graceful shutdown
 */

import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { getBackendPath, getConfig, getFrontendPath } from '../setup.js';
import { logger } from './logger.js';

let backendProcess: ChildProcess | null = null;
let isShuttingDown = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

/**
 * Start the backend server
 */
export async function startBackend(): Promise<void> {
  if (backendProcess) {
    logger.warn('Backend already running');
    return;
  }

  const config = getConfig();
  const backendPath = getBackendPath();
  const frontendPath = getFrontendPath();

  logger.info(`Starting backend from: ${backendPath}`);
  logger.info(`Frontend build at: ${frontendPath}`);

  return new Promise((resolve, reject) => {
    try {
      // Determine the entry point
      const entryPoint = path.join(backendPath, 'dist', 'src', 'app.js');

      // Environment variables for the backend
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(config.port),
        // Serve static frontend files from the backend
        STATIC_FILES_PATH: frontendPath,
        // Desktop mode flag
        TIM_DESKTOP_MODE: 'true',
        // Disable HTTPS redirect for local app
        DISABLE_HTTPS_REDIRECT: 'true',
      };

      // Spawn the Node.js process
      backendProcess = spawn(process.execPath, [entryPoint], {
        cwd: backendPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      // Handle stdout
      backendProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            logger.debug(`[Backend] ${line}`);
          }
        });
      });

      // Handle stderr
      backendProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            logger.warn(`[Backend] ${line}`);
          }
        });
      });

      // Handle process exit
      backendProcess.on('exit', (code, signal) => {
        logger.info(`Backend exited with code ${code}, signal ${signal}`);
        backendProcess = null;

        // Attempt restart if not shutting down and haven't exceeded attempts
        if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          logger.info(`Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`);
          setTimeout(() => {
            startBackend().catch(err => {
              logger.error(`Restart failed: ${err.message}`);
            });
          }, 2000);
        }
      });

      // Handle errors
      backendProcess.on('error', (err) => {
        logger.error(`Backend process error: ${err.message}`);
        reject(err);
      });

      // Give the server a moment to start
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          restartAttempts = 0; // Reset on successful start
          resolve();
        } else {
          reject(new Error('Backend process died immediately'));
        }
      }, 1000);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to start backend: ${message}`);
      reject(error);
    }
  });
}

/**
 * Stop the backend server
 */
export async function stopBackend(): Promise<void> {
  isShuttingDown = true;

  if (!backendProcess) {
    logger.info('Backend not running');
    return;
  }

  logger.info('Stopping backend...');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if graceful shutdown takes too long
      if (backendProcess) {
        logger.warn('Force killing backend process');
        backendProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    backendProcess.on('exit', () => {
      clearTimeout(timeout);
      backendProcess = null;
      logger.info('Backend stopped');
      resolve();
    });

    // Send graceful shutdown signal
    backendProcess.kill('SIGTERM');
  });
}

/**
 * Check if the backend is healthy
 */
export async function isBackendHealthy(): Promise<boolean> {
  const config = getConfig();
  const healthUrl = `http://localhost:${config.port}/health`;

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get backend status information
 */
export function getBackendStatus(): {
  running: boolean;
  pid: number | null;
  uptime: number | null;
} {
  if (!backendProcess) {
    return {
      running: false,
      pid: null,
      uptime: null,
    };
  }

  return {
    running: !backendProcess.killed,
    pid: backendProcess.pid || null,
    uptime: null, // Would need to track start time
  };
}

/**
 * Restart the backend server
 */
export async function restartBackend(): Promise<void> {
  logger.info('Restarting backend...');
  await stopBackend();
  isShuttingDown = false;
  await startBackend();
}
