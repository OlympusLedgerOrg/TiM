/**
 * TiM Desktop Application — Main Process
 *
 * This is the entry point for the Electron main process.
 * It handles:
 * - Window creation and management
 * - Backend server spawning
 * - First-run setup
 * - App lifecycle events
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupApp, isFirstRun, getConfig } from './setup.js';
import { startBackend, stopBackend, isBackendHealthy } from './services/backend.js';
import { logger } from './services/logger.js';

// Handle Squirrel events for Windows installer
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep references to windows to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

// Track setup progress
let setupComplete = false;

/**
 * Create the splash screen window shown during setup
 */
function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the splash screen HTML
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    splashWindow.loadFile(path.join(__dirname, '../splash/index.html'));
  } else {
    splashWindow.loadFile(path.join(__dirname, '../splash/index.html'));
  }

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  logger.info('Splash window created');
}

/**
 * Create the main application window
 */
function createMainWindow(): void {
  const config = getConfig();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false, // Don't show until loaded
    title: 'TiM — Work Order Management',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for some features
    },
  });

  // Load the frontend from the backend server
  const frontendUrl = `http://localhost:${config.port}`;
  mainWindow.loadURL(frontendUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    // Close splash and show main window
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow?.show();
    mainWindow?.focus();
    logger.info('Main window shown');
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Main window created');
}

/**
 * Run the first-time setup process
 */
async function runSetup(): Promise<void> {
  try {
    sendSplashMessage('status', 'Checking environment...');
    await sleep(500);

    if (isFirstRun()) {
      sendSplashMessage('status', 'First run detected — configuring...');
      sendSplashMessage('progress', 10);
      await sleep(500);
    }

    // Run automated setup
    sendSplashMessage('status', 'Setting up environment...');
    sendSplashMessage('progress', 20);

    await setupApp((step, progress) => {
      sendSplashMessage('status', step);
      sendSplashMessage('progress', progress);
    });

    sendSplashMessage('progress', 70);
    sendSplashMessage('status', 'Starting backend server...');

    // Start the backend server
    await startBackend();

    // Wait for backend to be healthy
    sendSplashMessage('status', 'Waiting for server...');
    sendSplashMessage('progress', 85);

    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      if (await isBackendHealthy()) {
        break;
      }
      await sleep(1000);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Backend server failed to start within timeout');
    }

    sendSplashMessage('progress', 100);
    sendSplashMessage('status', 'Ready!');
    await sleep(500);

    setupComplete = true;
    logger.info('Setup completed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Setup failed: ${message}`);
    sendSplashMessage('error', message);

    // Show error dialog
    await dialog.showMessageBox({
      type: 'error',
      title: 'Setup Failed',
      message: 'TiM failed to start',
      detail: `${message}\n\nCheck the logs at: ${logger.getLogPath()}`,
      buttons: ['OK'],
    });

    app.quit();
  }
}

/**
 * Send a message to the splash window
 */
function sendSplashMessage(type: string, data: string | number): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-update', { type, data });
  }
}

/**
 * Simple sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Vite dev server URL (set during development)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

/**
 * Application ready handler
 */
app.whenReady().then(async () => {
  logger.info('TiM Desktop starting...');
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Electron: ${process.versions.electron}`);
  logger.info(`Node: ${process.versions.node}`);

  // Create splash window
  createSplashWindow();

  // Run setup
  await runSetup();

  // Create main window if setup succeeded
  if (setupComplete) {
    createMainWindow();
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && setupComplete) {
      createMainWindow();
    }
  });
});

/**
 * Quit when all windows are closed (except on macOS)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Clean up before quit
 */
app.on('before-quit', async () => {
  logger.info('Application shutting down...');
  await stopBackend();
  logger.info('Shutdown complete');
});

/**
 * IPC Handlers
 */

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Get log file path
ipcMain.handle('get-log-path', () => {
  return logger.getLogPath();
});

// Open log folder
ipcMain.handle('open-log-folder', () => {
  shell.openPath(path.dirname(logger.getLogPath()));
});

// Restart application
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.quit();
});

// Get backend status
ipcMain.handle('get-backend-status', async () => {
  return await isBackendHealthy();
});
