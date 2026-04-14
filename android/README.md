# TiM Android Application

This directory contains the Capacitor configuration for building TiM as a native Android application.

## Overview

TiM uses [Capacitor](https://capacitorjs.com/) to wrap the Progressive Web App (PWA) as a native Android application, enabling:

- **Easy installation** via APK or Google Play Store
- **Native barcode scanning** using device camera
- **Push notifications** for equipment alerts
- **Offline support** via service worker caching
- **Native haptic feedback** for user interactions

## Prerequisites

1. **Node.js** >= 22.0.0
2. **Android Studio** with:
   - Android SDK 34 (Android 14)
   - Android SDK Build-Tools
   - Android Emulator (optional)
3. **Java JDK** 17 or later

## Quick Start

### 1. Install Dependencies

```bash
# From the android directory
npm install

# Build the frontend first
npm run build:frontend
```

### 2. Initialize Android Project

```bash
# Add Android platform (first time only)
npm run add-android

# Sync web assets to Android
npm run sync
```

### 3. Build & Run

```bash
# Open in Android Studio
npm run open

# Or run directly on connected device/emulator
npm run run:android
```

## Project Structure

```
android/
├── capacitor.config.ts    # Capacitor configuration
├── package.json           # Dependencies and scripts
├── android/               # Native Android project (generated)
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/com/trelleborg/tim/
│   │   │   └── res/
│   │   └── build.gradle
│   └── build.gradle
└── README.md
```

## Configuration

### Backend Connection

Edit `capacitor.config.ts` to configure the backend URL:

```typescript
server: {
  // Development (Android emulator)
  url: 'http://10.0.2.2:4000',
  
  // Production
  url: 'https://tim.trelleborg.com',
}
```

### App Icons

Place icons in `android/app/src/main/res/`:
- `mipmap-mdpi/ic_launcher.png` (48x48)
- `mipmap-hdpi/ic_launcher.png` (72x72)
- `mipmap-xhdpi/ic_launcher.png` (96x96)
- `mipmap-xxhdpi/ic_launcher.png` (144x144)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192)

### Splash Screen

Place splash screen in `android/app/src/main/res/drawable/`:
- `splash.png` (2732x2732)

## Building APK

### Debug APK

```bash
# From Android Studio
Build → Build Bundle(s) / APK(s) → Build APK(s)

# Or via command line
cd android/android
./gradlew assembleDebug
```

Output: `android/android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (Signed)

1. Create a keystore:
```bash
keytool -genkey -v -keystore tim-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias tim
```

2. Configure signing in `android/android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('tim-release-key.jks')
            storePassword 'your-store-password'
            keyAlias 'tim'
            keyPassword 'your-key-password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

3. Build release APK:
```bash
cd android/android
./gradlew assembleRelease
```

Output: `android/android/app/build/outputs/apk/release/app-release.apk`

## Native Features

### Barcode Scanning

TiM supports native barcode scanning for:
- Badge login (employee ID)
- Lot number scanning
- Work order scanning

The app uses the device camera via `@capacitor/barcode-scanner`.

### Offline Mode

The PWA service worker provides offline support:
- Cached UI assets
- Offline queue for mutations
- Background sync when online

### Haptic Feedback

Native haptic patterns for:
- Button presses
- Error alerts
- Success confirmations
- Warning notifications

## Troubleshooting

### "SDK location not found"

Create `android/android/local.properties`:
```properties
sdk.dir=/path/to/Android/sdk
```

### Build fails with Java version error

Ensure JAVA_HOME points to JDK 17:
```bash
export JAVA_HOME=/path/to/jdk-17
```

### App can't connect to backend

1. Check `capacitor.config.ts` server URL
2. Ensure backend allows CORS from app origin
3. For emulator, use `10.0.2.2` for localhost

## License

MIT
