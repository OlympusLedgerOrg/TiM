#
# TiM Desktop — Build Script (Windows PowerShell)
#
# This script builds the complete desktop application including:
# - Frontend (React/Vite)
# - Backend (Node.js/Express)
# - Electron wrapper
#
# Usage:
#   .\scripts\build-desktop.ps1 [-Platform <platform>] [-Clean]
#
# Options:
#   -Platform <platform>  Target platform: win32, linux, darwin, or all
#   -Clean                Clean build directories before building
#
# Requirements:
#   - Node.js >= 22.0.0
#   - npm
#

param(
    [string]$Platform = "",
    [switch]$Clean = $false
)

# Stop on errors
$ErrorActionPreference = "Stop"

# Script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

# Colors for output
function Write-Info($message) {
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $message
}

function Write-Success($message) {
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $message
}

function Write-Warning($message) {
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $message
}

function Write-Error($message) {
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $message
}

# Check Node.js version
function Test-NodeVersion {
    Write-Info "Checking Node.js version..."

    try {
        $nodeVersion = node -v
        $nodeVersion = $nodeVersion -replace 'v', ''
        $nodeMajor = [int]($nodeVersion.Split('.')[0])

        if ($nodeMajor -lt 22) {
            Write-Error "Node.js version $nodeVersion is too old. Please upgrade to >= 22.0.0"
            exit 1
        }

        Write-Success "Node.js v$nodeVersion detected"
    }
    catch {
        Write-Error "Node.js is not installed. Please install Node.js >= 22.0.0"
        exit 1
    }
}

# Clean build directories
function Clear-Builds {
    Write-Info "Cleaning build directories..."

    $dirsToClean = @(
        "$RootDir\frontend\dist",
        "$RootDir\backend\dist",
        "$RootDir\desktop\.vite",
        "$RootDir\desktop\out",
        "$RootDir\desktop\node_modules\.vite"
    )

    foreach ($dir in $dirsToClean) {
        if (Test-Path $dir) {
            Remove-Item -Path $dir -Recurse -Force
        }
    }

    Write-Success "Build directories cleaned"
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Installing dependencies..."

    # Frontend
    Write-Info "Installing frontend dependencies..."
    Set-Location "$RootDir\frontend"
    npm ci --silent
    if ($LASTEXITCODE -ne 0) { throw "Frontend npm install failed" }

    # Backend
    Write-Info "Installing backend dependencies..."
    Set-Location "$RootDir\backend"
    npm ci --silent
    if ($LASTEXITCODE -ne 0) { throw "Backend npm install failed" }

    # Desktop
    Write-Info "Installing desktop dependencies..."
    Set-Location "$RootDir\desktop"
    npm ci --silent
    if ($LASTEXITCODE -ne 0) { throw "Desktop npm install failed" }

    Write-Success "All dependencies installed"
}

# Build frontend
function Build-Frontend {
    Write-Info "Building frontend..."

    Set-Location "$RootDir\frontend"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

    if (-not (Test-Path "$RootDir\frontend\dist")) {
        throw "Frontend build failed - dist directory not found"
    }

    Write-Success "Frontend built successfully"
}

# Build backend
function Build-Backend {
    Write-Info "Building backend..."

    Set-Location "$RootDir\backend"

    # Generate Prisma client
    Write-Info "Generating Prisma client..."
    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma generate failed" }

    # TypeScript compilation
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }

    if (-not (Test-Path "$RootDir\backend\dist")) {
        throw "Backend build failed - dist directory not found"
    }

    Write-Success "Backend built successfully"
}

# Package desktop app
function Build-DesktopPackage {
    Write-Info "Packaging desktop application..."

    Set-Location "$RootDir\desktop"

    if ($Platform -ne "") {
        if ($Platform -eq "all") {
            Write-Info "Building for all platforms..."
            npm run make -- --platform=win32
            npm run make -- --platform=linux
            npm run make -- --platform=darwin
        }
        else {
            Write-Info "Building for platform: $Platform"
            npm run make -- --platform=$Platform
        }
    }
    else {
        Write-Info "Building for current platform..."
        npm run make
    }

    if ($LASTEXITCODE -ne 0) { throw "Desktop packaging failed" }

    Write-Success "Desktop application packaged"
}

# Main build process
function Main {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║        TiM Desktop Build Script            ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""

    # Check prerequisites
    Test-NodeVersion

    # Clean if requested
    if ($Clean) {
        Clear-Builds
    }

    # Install dependencies
    Install-Dependencies

    # Build components
    Build-Frontend
    Build-Backend
    Build-DesktopPackage

    Write-Host ""
    Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║           Build Complete!                  ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Info "Output files are in: $RootDir\desktop\out\make\"
    Write-Host ""

    # List output files
    $outDir = "$RootDir\desktop\out\make"
    if (Test-Path $outDir) {
        Write-Info "Generated installers:"
        Get-ChildItem -Path $outDir -Recurse -Include "*.exe", "*.dmg", "*.deb", "*.rpm", "*.AppImage", "*.zip" | ForEach-Object {
            Write-Host "  - $($_.FullName)"
        }
    }

    # Return to root
    Set-Location $RootDir
}

# Run main
try {
    Main
}
catch {
    Write-Error $_.Exception.Message
    Set-Location $RootDir
    exit 1
}
