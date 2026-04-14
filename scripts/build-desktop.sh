#!/usr/bin/env bash
#
# TiM Desktop — Build Script (Unix/macOS/Linux)
#
# This script builds the complete desktop application including:
# - Frontend (React/Vite)
# - Backend (Node.js/Express)
# - Electron wrapper
#
# Usage:
#   ./scripts/build-desktop.sh [--platform <platform>] [--clean]
#
# Options:
#   --platform <platform>  Target platform: linux, darwin (macOS), win32, or all
#   --clean                Clean build directories before building
#
# Requirements:
#   - Node.js >= 22.0.0
#   - npm
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults
PLATFORM=""
CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --clean)
      CLEAN=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--platform <platform>] [--clean]"
      echo ""
      echo "Options:"
      echo "  --platform <platform>  Target platform: linux, darwin, win32, or all"
      echo "  --clean                Clean build directories before building"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Log functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check Node.js version
check_node_version() {
  log_info "Checking Node.js version..."

  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js >= 22.0.0"
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2)
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

  if [ "$NODE_MAJOR" -lt 22 ]; then
    log_error "Node.js version $NODE_VERSION is too old. Please upgrade to >= 22.0.0"
    exit 1
  fi

  log_success "Node.js v$NODE_VERSION detected"
}

# Clean build directories
clean_builds() {
  log_info "Cleaning build directories..."

  rm -rf "$ROOT_DIR/frontend/dist"
  rm -rf "$ROOT_DIR/backend/dist"
  rm -rf "$ROOT_DIR/desktop/.vite"
  rm -rf "$ROOT_DIR/desktop/out"
  rm -rf "$ROOT_DIR/desktop/node_modules/.vite"

  log_success "Build directories cleaned"
}

# Install dependencies
install_deps() {
  log_info "Installing dependencies..."

  # Frontend
  log_info "Installing frontend dependencies..."
  cd "$ROOT_DIR/frontend"
  npm ci --silent

  # Backend
  log_info "Installing backend dependencies..."
  cd "$ROOT_DIR/backend"
  npm ci --silent

  # Desktop
  log_info "Installing desktop dependencies..."
  cd "$ROOT_DIR/desktop"
  npm ci --silent

  log_success "All dependencies installed"
}

# Build frontend
build_frontend() {
  log_info "Building frontend..."

  cd "$ROOT_DIR/frontend"
  npm run build

  if [ ! -d "$ROOT_DIR/frontend/dist" ]; then
    log_error "Frontend build failed - dist directory not found"
    exit 1
  fi

  log_success "Frontend built successfully"
}

# Build backend
build_backend() {
  log_info "Building backend..."

  cd "$ROOT_DIR/backend"

  # Generate Prisma client
  log_info "Generating Prisma client..."
  npx prisma generate

  # TypeScript compilation
  npm run build

  if [ ! -d "$ROOT_DIR/backend/dist" ]; then
    log_error "Backend build failed - dist directory not found"
    exit 1
  fi

  log_success "Backend built successfully"
}

# Package desktop app
package_desktop() {
  log_info "Packaging desktop application..."

  cd "$ROOT_DIR/desktop"

  if [ -n "$PLATFORM" ]; then
    if [ "$PLATFORM" = "all" ]; then
      log_info "Building for all platforms..."
      npm run make -- --platform=linux
      npm run make -- --platform=darwin
      npm run make -- --platform=win32
    else
      log_info "Building for platform: $PLATFORM"
      npm run make -- --platform="$PLATFORM"
    fi
  else
    log_info "Building for current platform..."
    npm run make
  fi

  log_success "Desktop application packaged"
}

# Main build process
main() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║        TiM Desktop Build Script            ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
  echo ""

  # Check prerequisites
  check_node_version

  # Clean if requested
  if [ "$CLEAN" = true ]; then
    clean_builds
  fi

  # Install dependencies
  install_deps

  # Build components
  build_frontend
  build_backend
  package_desktop

  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║           Build Complete!                  ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
  echo ""
  log_info "Output files are in: $ROOT_DIR/desktop/out/make/"
  echo ""

  # List output files
  if [ -d "$ROOT_DIR/desktop/out/make" ]; then
    log_info "Generated installers:"
    find "$ROOT_DIR/desktop/out/make" -type f \( -name "*.exe" -o -name "*.dmg" -o -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" -o -name "*.zip" \) -exec echo "  - {}" \;
  fi
}

# Run main
main
