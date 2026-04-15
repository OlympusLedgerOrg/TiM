/**
 * Environment configuration for TiM frontend.
 *
 * Centralises access to build-time and runtime configuration.
 * Values come from Vite's import.meta.env or sensible defaults.
 *
 * Usage:
 *   import { env } from '@/config/env';
 *   console.log(env.API_BASE);
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const meta = (import.meta as any).env ?? {};

export const env = {
  /** Base URL for API requests (default: '/api/v1') */
  API_BASE: (meta.VITE_API_BASE as string) ?? '/api/v1',

  /** Current environment mode */
  MODE: (meta.MODE as string) ?? 'development',

  /** Whether we are running in production */
  IS_PROD: meta.PROD === true || meta.MODE === 'production',

  /** Whether we are running in development */
  IS_DEV: meta.DEV === true || meta.MODE === 'development',

  /** Application version from package.json (injected at build time) */
  APP_VERSION: (meta.VITE_APP_VERSION as string) ?? '1.0.0',
} as const;
