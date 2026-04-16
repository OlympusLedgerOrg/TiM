# TiM Desktop Application

This directory contains the Electron wrapper that converts TiM into a standalone desktop application.

## Overview

The desktop app bundles:
- **Frontend**: React/Vite PWA
- **Backend**: Node.js/Express API server
- **Database**: SQLite (embedded, no PostgreSQL required)

## Development

### Prerequisites

- Node.js >= 22.0.0
- npm

### Setup

```bash
# Install dependencies for all packages
cd ../frontend && npm install
cd ../backend && npm install
cd ../desktop && npm install
```

### Running in Development

```bash
# From the desktop directory
npm run start
```

This will:
1. Start the backend server
2. Launch Electron with the splash screen
3. Show the main application window

## Building Installers

### Build for Current Platform

```bash
npm run make
```

### Build for Specific Platform

```bash
# Windows
npm run make -- --platform=win32

# macOS
npm run make -- --platform=darwin

# Linux
npm run make -- --platform=linux
```

### Using the Build Scripts

From the repository root:

```bash
# Unix/macOS/Linux
./scripts/build-desktop.sh

# Windows PowerShell
.\scripts\build-desktop.ps1
```

Options:
- `--platform <platform>`: Build for specific platform (win32, darwin, linux, all)
- `--clean`: Clean build directories before building

## Output

Installers are generated in `out/make/`:

| Platform | File | Location |
|----------|------|----------|
| Windows | `TiM-Setup.exe` | `out/make/squirrel.windows/x64/` |
| macOS | `TiM.dmg` | `out/make/dmg/` |
| Linux | `tim_x.x.x_amd64.deb` | `out/make/deb/x64/` |
| Linux | `tim-x.x.x.x86_64.rpm` | `out/make/rpm/x64/` |

## Architecture

```
desktop/
├── main/                    # Electron main process
│   ├── main.ts             # Entry point
│   ├── preload.ts          # Context bridge
│   ├── setup.ts            # First-run setup
│   └── services/
│       ├── backend.ts      # Backend process manager
│       ├── database.ts     # Database management
│       ├── logger.ts       # File logging
│       └── ports.ts        # Port detection
├── splash/                  # Splash screen
│   ├── index.html
│   └── styles.css
├── assets/                  # Icons and resources
├── forge.config.ts         # Electron Forge config
└── package.json
```

## How It Works

1. **First Run**: 
   - Creates app data directory
   - Generates secure JWT secret
   - Initializes SQLite database
   - Runs Prisma migrations
   - Creates environment configuration

2. **Startup**:
   - Shows splash screen with progress
   - Starts backend server as child process
   - Waits for backend health check
   - Opens main application window

3. **Shutdown**:
   - Gracefully stops backend server
   - Cleans up resources

## Data Locations

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/TiM/` |
| macOS | `~/Library/Application Support/TiM/` |
| Linux | `~/.config/TiM/` |

Contents:
- `database/tim.db` — SQLite database
- `logs/` — Application logs
- `backups/` — Database backups
- `tim-config.json` — Configuration

## Troubleshooting

### View Logs

Logs are located in the app data directory under `logs/`.

From the app: Menu → Help → Open Log Folder

### Reset Application

To reset the app to factory defaults:
1. Close the application
2. Delete the app data folder
3. Restart the application

### Common Issues

**Port already in use**: The app will automatically find an available port.

**Database migration fails**: Check logs for details. May need to reset the app.

**Backend won't start**: Ensure Node.js is properly installed and PATH is set.

## Security Notes

- JWT secret is auto-generated on first run
- Database is local SQLite (not encrypted by default)
- All network communication is localhost-only
- No external services required

## License

MIT
