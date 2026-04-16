/**
 * TiM Desktop — Database Service
 *
 * Handles database initialization and management for desktop mode.
 * Uses SQLite for standalone operation (no external PostgreSQL required).
 */

import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';
import { getAppDataPath, getBackendPath } from '../setup.js';

/**
 * Database configuration for desktop mode
 */
export interface DatabaseConfig {
  path: string;
  url: string;
}

/**
 * Get database configuration
 */
export function getDatabaseConfig(): DatabaseConfig {
  const dbDir = path.join(getAppDataPath(), 'database');
  const dbPath = path.join(dbDir, 'tim.db');

  return {
    path: dbPath,
    url: `file:${dbPath}`,
  };
}

/**
 * Ensure database directory exists
 */
export function ensureDatabaseDirectory(): void {
  const config = getDatabaseConfig();
  const dbDir = path.dirname(config.path);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }
}

/**
 * Check if database file exists
 */
export function databaseExists(): boolean {
  const config = getDatabaseConfig();
  return fs.existsSync(config.path);
}

/**
 * Get database file size
 */
export function getDatabaseSize(): number {
  const config = getDatabaseConfig();

  if (!fs.existsSync(config.path)) {
    return 0;
  }

  const stats = fs.statSync(config.path);
  return stats.size;
}

/**
 * Backup the database
 */
export async function backupDatabase(): Promise<string> {
  const config = getDatabaseConfig();

  if (!fs.existsSync(config.path)) {
    throw new Error('Database does not exist');
  }

  const backupDir = path.join(getAppDataPath(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `tim-backup-${timestamp}.db`);

  // Copy the database file
  fs.copyFileSync(config.path, backupPath);

  logger.info(`Database backed up to: ${backupPath}`);
  return backupPath;
}

/**
 * Restore database from backup
 */
export async function restoreDatabase(backupPath: string): Promise<void> {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const config = getDatabaseConfig();

  // Create a backup of current database before restore
  if (fs.existsSync(config.path)) {
    const preRestoreBackup = config.path + '.pre-restore';
    fs.copyFileSync(config.path, preRestoreBackup);
    logger.info(`Created pre-restore backup: ${preRestoreBackup}`);
  }

  // Restore from backup
  fs.copyFileSync(backupPath, config.path);
  logger.info(`Database restored from: ${backupPath}`);
}

/**
 * List available backups
 */
export function listBackups(): string[] {
  const backupDir = path.join(getAppDataPath(), 'backups');

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir);
  return files
    .filter(f => f.startsWith('tim-backup-') && f.endsWith('.db'))
    .map(f => path.join(backupDir, f))
    .sort()
    .reverse();
}

/**
 * Delete old backups, keeping only the most recent N
 */
export function pruneBackups(keepCount: number = 5): void {
  const backups = listBackups();

  if (backups.length <= keepCount) {
    return;
  }

  const toDelete = backups.slice(keepCount);
  for (const backupPath of toDelete) {
    fs.unlinkSync(backupPath);
    logger.info(`Deleted old backup: ${backupPath}`);
  }
}

/**
 * Reset database (delete and allow recreation)
 */
export async function resetDatabase(): Promise<void> {
  const config = getDatabaseConfig();

  // Backup first
  if (fs.existsSync(config.path)) {
    await backupDatabase();
    fs.unlinkSync(config.path);
    logger.info('Database reset - old database backed up and removed');
  }
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  exists: boolean;
  size: number;
  sizeFormatted: string;
  backupCount: number;
  lastBackup: string | null;
} {
  const exists = databaseExists();
  const size = getDatabaseSize();
  const backups = listBackups();

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return {
    exists,
    size,
    sizeFormatted: formatSize(size),
    backupCount: backups.length,
    lastBackup: backups.length > 0 ? backups[0] : null,
  };
}
