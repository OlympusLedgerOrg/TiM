/**
 * TiM Desktop Application — First-Run Setup
 *
 * Handles:
 * - Environment variable generation
 * - Database initialization
 * - Port detection and allocation
 * - JWT secret generation
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Store from 'electron-store';
import { findAvailablePort } from './services/ports.js';
import { logger } from './services/logger.js';

// Persistent configuration store
const store = new Store<AppConfig>({
  name: 'tim-config',
  defaults: {
    firstRunComplete: false,
    port: 4000,
    jwtSecret: '',
    databasePath: '',
    logLevel: 'info',
  },
});

export interface AppConfig {
  firstRunComplete: boolean;
  port: number;
  jwtSecret: string;
  databasePath: string;
  logLevel: string;
}

/**
 * Get the application data directory
 */
export function getAppDataPath(): string {
  return app.getPath('userData');
}

/**
 * Get the path to the backend directory
 */
export function getBackendPath(): string {
  // In development, use the local backend folder
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return path.join(process.cwd(), '..', 'backend');
  }

  // In production, use the bundled backend in resources
  return path.join(process.resourcesPath, 'backend');
}

/**
 * Get the path to the frontend build directory
 */
export function getFrontendPath(): string {
  // In development, use the local frontend folder
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return path.join(process.cwd(), '..', 'frontend', 'dist');
  }

  // In production, use the bundled frontend in resources
  return path.join(process.resourcesPath, 'frontend', 'dist');
}

/**
 * Check if this is the first run
 */
export function isFirstRun(): boolean {
  return !store.get('firstRunComplete');
}

/**
 * Get the current configuration
 */
export function getConfig(): AppConfig {
  return store.store;
}

/**
 * Save configuration
 */
export function saveConfig(config: Partial<AppConfig>): void {
  Object.entries(config).forEach(([key, value]) => {
    store.set(key as keyof AppConfig, value);
  });
}

/**
 * Generate a secure random JWT secret
 */
function generateJwtSecret(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Create the .env file for the backend
 */
function createEnvFile(config: {
  port: number;
  jwtSecret: string;
  databaseUrl: string;
}): void {
  const backendPath = getBackendPath();
  const envPath = path.join(backendPath, '.env');

  const envContent = `# TiM Desktop — Auto-generated configuration
# Generated: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY — Use TiM settings to modify

# Database connection (SQLite for desktop mode)
DATABASE_URL="${config.databaseUrl}"

# JWT authentication secret
JWT_SECRET="${config.jwtSecret}"

# Server configuration
PORT=${config.port}
NODE_ENV=production
LOG_LEVEL=info

# Socket.IO
SOCKET_IO_PATH="/socket.io"

# HTTPS redirect disabled (local app)
DISABLE_HTTPS_REDIRECT=true

# SAP integration (disabled for desktop mode)
SAP_MIDDLEWARE_ENABLED=false
AXXOS_ENABLED=false

# Rate limiting (relaxed for desktop)
RATE_LIMIT_GLOBAL=500
RATE_LIMIT_SAP=100
RATE_LIMIT_AUTH=50
`;

  fs.writeFileSync(envPath, envContent, 'utf-8');
  logger.info(`Created .env file at ${envPath}`);
}

/**
 * Setup callback type for progress reporting
 */
type SetupCallback = (step: string, progress: number) => void;

/**
 * Run the complete setup process
 */
export async function setupApp(onProgress?: SetupCallback): Promise<void> {
  const report = (step: string, progress: number) => {
    logger.info(`Setup: ${step} (${progress}%)`);
    onProgress?.(step, progress);
  };

  try {
    // Step 1: Check/create app data directory
    report('Creating data directories...', 25);
    const dataPath = getAppDataPath();
    const dbDir = path.join(dataPath, 'database');
    const logsDir = path.join(dataPath, 'logs');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Step 2: Find available port
    report('Finding available port...', 30);
    const defaultPort = store.get('port', 4000);
    const port = await findAvailablePort(defaultPort);
    logger.info(`Using port: ${port}`);

    // Step 3: Generate or retrieve JWT secret
    report('Configuring security...', 35);
    let jwtSecret = store.get('jwtSecret');
    if (!jwtSecret) {
      jwtSecret = generateJwtSecret();
      store.set('jwtSecret', jwtSecret);
      logger.info('Generated new JWT secret');
    }

    // Step 4: Set up database
    report('Setting up database...', 40);
    const dbPath = path.join(dbDir, 'tim.db');
    const databaseUrl = `file:${dbPath}`;
    store.set('databasePath', dbPath);

    // Step 5: Create environment file
    report('Creating configuration...', 50);
    createEnvFile({
      port,
      jwtSecret,
      databaseUrl,
    });

    // Step 6: Run Prisma migrations
    report('Running database migrations...', 55);
    await runPrismaMigrations();

    // Step 7: Seed database if empty
    report('Checking database...', 65);
    // Note: Seeding will be handled by the backend on first run

    // Save final configuration
    store.set('port', port);
    store.set('firstRunComplete', true);

    report('Setup complete!', 70);
    logger.info('Setup completed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Setup failed: ${message}`);
    throw error;
  }
}

/**
 * Run Prisma migrations
 */
async function runPrismaMigrations(): Promise<void> {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath();
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // First generate Prisma client
    const generate = spawn(npxCommand, ['prisma', 'generate'], {
      cwd: backendPath,
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: `file:${path.join(getAppDataPath(), 'database', 'tim.db')}`,
      },
    });

    let genOutput = '';
    generate.stdout?.on('data', (data) => {
      genOutput += data.toString();
    });
    generate.stderr?.on('data', (data) => {
      genOutput += data.toString();
    });

    generate.on('close', (code) => {
      if (code !== 0) {
        logger.warn(`Prisma generate exited with code ${code}: ${genOutput}`);
        // Continue anyway - client might already exist
      }

      // Then run migrations
      const migrate = spawn(npxCommand, ['prisma', 'migrate', 'deploy'], {
        cwd: backendPath,
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL: `file:${path.join(getAppDataPath(), 'database', 'tim.db')}`,
        },
      });

      let migrateOutput = '';
      migrate.stdout?.on('data', (data) => {
        migrateOutput += data.toString();
        logger.debug(`Prisma: ${data.toString().trim()}`);
      });
      migrate.stderr?.on('data', (data) => {
        migrateOutput += data.toString();
        logger.warn(`Prisma: ${data.toString().trim()}`);
      });

      migrate.on('close', (migrateCode) => {
        if (migrateCode === 0) {
          logger.info('Database migrations completed');
          resolve();
        } else {
          // Check if it's just "no migrations to run" error
          if (migrateOutput.includes('No migrations to apply') ||
              migrateOutput.includes('database is up to date')) {
            logger.info('Database is already up to date');
            resolve();
          } else {
            reject(new Error(`Database migration failed: ${migrateOutput}`));
          }
        }
      });

      migrate.on('error', (err) => {
        reject(new Error(`Failed to run migrations: ${err.message}`));
      });
    });

    generate.on('error', (err) => {
      reject(new Error(`Failed to generate Prisma client: ${err.message}`));
    });
  });
}

/**
 * Reset the application (for troubleshooting)
 */
export async function resetApp(): Promise<void> {
  logger.info('Resetting application...');

  // Clear config
  store.clear();

  // Delete database
  const dbPath = path.join(getAppDataPath(), 'database');
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { recursive: true, force: true });
  }

  // Delete env file
  const envPath = path.join(getBackendPath(), '.env');
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
  }

  logger.info('Application reset complete');
}
