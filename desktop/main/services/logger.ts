/**
 * TiM Desktop — Logger Service
 *
 * Provides file-based logging with rotation.
 * Logs are stored in the platform-specific app data directory.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private logPath: string;
  private logStream: fs.WriteStream | null = null;
  private currentLogLevel: LogLevel = 'info';
  private maxFileSize = 10 * 1024 * 1024; // 10MB
  private maxFiles = 5;

  constructor() {
    // Initialize with a default path until app is ready
    this.logPath = '';
  }

  /**
   * Initialize the logger (call after app is ready)
   */
  init(): void {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      this.logPath = path.join(logsDir, 'tim-desktop.log');

      // Rotate logs if needed
      this.rotateIfNeeded();

      // Open log file for appending
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });

      this.info('Logger initialized');
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  /**
   * Get the current log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    // Check log level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.currentLogLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0
      ? ' ' + args.map(a => JSON.stringify(a)).join(' ')
      : '';
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}\n`;

    // Write to console
    switch (level) {
      case 'debug':
        console.debug(logLine.trim());
        break;
      case 'info':
        console.log(logLine.trim());
        break;
      case 'warn':
        console.warn(logLine.trim());
        break;
      case 'error':
        console.error(logLine.trim());
        break;
    }

    // Write to file if stream is available
    if (this.logStream) {
      this.logStream.write(logLine);

      // Check if rotation is needed
      this.rotateIfNeeded();
    }
  }

  /**
   * Rotate log files if the current one is too large
   */
  private rotateIfNeeded(): void {
    try {
      if (!this.logPath || !fs.existsSync(this.logPath)) {
        return;
      }

      const stats = fs.statSync(this.logPath);
      if (stats.size < this.maxFileSize) {
        return;
      }

      // Close current stream
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }

      // Rotate existing files
      const logsDir = path.dirname(this.logPath);
      const baseName = path.basename(this.logPath, '.log');

      // Delete oldest file if we have too many
      const oldestFile = path.join(logsDir, `${baseName}.${this.maxFiles}.log`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      // Shift existing numbered files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldPath = path.join(logsDir, `${baseName}.${i}.log`);
        const newPath = path.join(logsDir, `${baseName}.${i + 1}.log`);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }

      // Move current log to .1.log
      const rotatedPath = path.join(logsDir, `${baseName}.1.log`);
      fs.renameSync(this.logPath, rotatedPath);

      // Open new log file
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  /**
   * Close the logger
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Initialize logger when module loads (if app is ready)
if (app.isReady()) {
  logger.init();
} else {
  app.on('ready', () => {
    logger.init();
  });
}
