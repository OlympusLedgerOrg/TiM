# TiM Desktop Assets

This directory contains icon files for the desktop application.

## Required Files

For packaging the desktop app, you need to provide icons in these formats:

### Windows
- `icon.ico` — Windows icon file (256x256, multi-resolution)

### macOS
- `icon.icns` — macOS icon file (1024x1024)

### Linux
- `icon.png` — PNG icon (512x512 or 1024x1024)

### Optional
- `installing.gif` — Animation shown during Windows installation

## Generating Icons

You can use tools like:
- **electron-icon-builder**: `npx electron-icon-builder --input=icon.png --output=./`
- **ImageMagick**: Convert PNG to ICO/ICNS formats
- **iconutil** (macOS): Create .icns from iconset

## Placeholder

Until proper icons are created, the build will use default Electron icons.
