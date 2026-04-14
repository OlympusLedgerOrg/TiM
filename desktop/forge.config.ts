import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'TiM',
    executableName: 'tim',
    icon: './assets/icon',
    asar: true,
    extraResource: [
      '../backend',
      '../frontend/dist',
    ],
    ignore: [
      /^\/node_modules$/,
      /^\/\.git$/,
      /^\/\.vscode$/,
      /\.ts$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    // Windows installer (NSIS-style via Squirrel)
    new MakerSquirrel({
      name: 'TiM',
      setupExe: 'TiM-Setup.exe',
      setupIcon: './assets/icon.ico',
      iconUrl: 'https://raw.githubusercontent.com/OlympusLedgerOrg/TiM/main/desktop/assets/icon.ico',
      loadingGif: './assets/installing.gif',
      description: 'TiM — Work Order Management System',
      authors: 'TiM Development Team',
    }),
    // macOS DMG
    new MakerDMG({
      name: 'TiM',
      icon: './assets/icon.icns',
      format: 'ULFO',
      overwrite: true,
    }),
    // Linux DEB package
    new MakerDeb({
      options: {
        name: 'tim',
        productName: 'TiM',
        genericName: 'Work Order Management',
        description: 'TiM — Work Order Management System for manufacturing',
        categories: ['Office', 'Utility'],
        icon: './assets/icon.png',
        maintainer: 'TiM Development Team',
      },
    }),
    // Linux RPM package
    new MakerRpm({
      options: {
        name: 'tim',
        productName: 'TiM',
        description: 'TiM — Work Order Management System for manufacturing',
        categories: ['Office', 'Utility'],
        icon: './assets/icon.png',
      },
    }),
    // ZIP for all platforms (fallback)
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // Build settings for the main process
      build: [
        {
          entry: 'main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'splash_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
