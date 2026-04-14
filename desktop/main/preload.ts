/**
 * TiM Desktop Application — Preload Script
 *
 * This script runs in a sandboxed context and provides a secure bridge
 * between the renderer process and the main process via IPC.
 *
 * Security: Uses contextBridge to expose only specific, validated APIs.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * Exposed API for splash screen and main window
 */
const electronAPI = {
  // Splash screen updates
  onSplashUpdate: (callback: (data: { type: string; data: string | number }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { type: string; data: string | number }) => {
      callback(data);
    };
    ipcRenderer.on('splash-update', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('splash-update', handler);
    };
  },

  // App info
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version');
  },

  // Logging
  getLogPath: (): Promise<string> => {
    return ipcRenderer.invoke('get-log-path');
  },
  openLogFolder: (): Promise<void> => {
    return ipcRenderer.invoke('open-log-folder');
  },

  // App control
  restartApp: (): Promise<void> => {
    return ipcRenderer.invoke('restart-app');
  },

  // Backend status
  getBackendStatus: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-backend-status');
  },

  // Window controls (for frameless windows)
  minimizeWindow: () => {
    ipcRenderer.send('window-minimize');
  },
  maximizeWindow: () => {
    ipcRenderer.send('window-maximize');
  },
  closeWindow: () => {
    ipcRenderer.send('window-close');
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

export type ElectronAPI = typeof electronAPI;
