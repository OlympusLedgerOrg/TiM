/**
 * Environment configuration for TiM frontend.
 *
 * Centralises access to build-time and runtime configuration.
 * Values come from Vite's import.meta.env or sensible defaults.
 *
 * Usage:
 *   import { env } from '../config/env';
 *   console.log(env.API_BASE);
 */

interface ImportMetaEnvTiM {
  readonly VITE_API_BASE?: string;
  readonly VITE_APP_VERSION?: string;
  readonly MODE?: string;
  readonly PROD?: boolean;
  readonly DEV?: boolean;
}

const meta: ImportMetaEnvTiM = (import.meta as { env?: ImportMetaEnvTiM }).env ?? {};

export const env = {
  /** Base URL for API requests (default: '/api/v1') */
  API_BASE: meta.VITE_API_BASE ?? '/api/v1',

  /** Current environment mode */
  MODE: meta.MODE ?? 'development',

  /** Whether we are running in production */
  IS_PROD: meta.PROD === true || meta.MODE === 'production',

  /** Whether we are running in development */
  IS_DEV: meta.DEV === true || meta.MODE === 'development',

  /** Application version from package.json (injected at build time) */
  APP_VERSION: meta.VITE_APP_VERSION ?? '1.0.0',
} as const;
