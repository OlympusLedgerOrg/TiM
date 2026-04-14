/**
 * TiM Android — Capacitor Configuration
 *
 * Capacitor wraps the PWA for native Android distribution.
 * This enables easy installation via APK or Play Store.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trelleborg.tim',
  appName: 'TiM Production Manager',
  webDir: '../frontend/dist',
  bundledWebRuntime: false,

  // Android-specific configuration
  android: {
    // Allow mixed content for local development
    allowMixedContent: true,
    // Enable Chrome DevTools for debugging
    webContentsDebuggingEnabled: true,
    // Background color while loading
    backgroundColor: '#354a5f',
  },

  // Server configuration for connecting to backend
  server: {
    // For development: connect to local backend
    // url: 'http://10.0.2.2:4000',  // Android emulator localhost
    // For production: use the hosted backend URL
    // url: 'https://tim.trelleborg.local',
    
    // Clear text allowed for local network
    cleartext: true,
    // Allow navigation to all origins
    allowNavigation: ['*'],
  },

  // Plugins configuration
  plugins: {
    // Splash screen configuration
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#354a5f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#0a6ed1',
    },
    // Keyboard configuration for better form handling
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    // Status bar configuration
    StatusBar: {
      style: 'dark',
      backgroundColor: '#354a5f',
    },
    // Push notifications (future)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
