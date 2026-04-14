#!/usr/bin/env bash
#
# TiM Android — Build Script
#
# This script builds the TiM Android APK using Capacitor.
#
# Usage:
#   ./scripts/build-android.sh [--debug|--release]
#
# Prerequisites:
#   - Node.js >= 22.0.0
#   - Android SDK with build-tools
#   - Java JDK 17+
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Build type (default: debug)
BUILD_TYPE="debug"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --debug)
      BUILD_TYPE="debug"
      shift
      ;;
    --release)
      BUILD_TYPE="release"
      shift
      ;;
    --help)
      echo "Usage: $0 [--debug|--release]"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

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

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        TiM Android Build Script            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  log_error "Node.js is not installed"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  log_error "Node.js version $NODE_VERSION is too old. Please upgrade to >= 22.0.0"
  exit 1
fi
log_success "Node.js v$NODE_VERSION"

# Check for ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
  log_warn "ANDROID_HOME is not set. Android build may fail."
fi

# Step 1: Install frontend dependencies
log_info "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm ci --silent
log_success "Frontend dependencies installed"

# Step 2: Build frontend
log_info "Building frontend..."
npm run build
if [ ! -d "$ROOT_DIR/frontend/dist" ]; then
  log_error "Frontend build failed"
  exit 1
fi
log_success "Frontend built"

# Step 3: Install Android dependencies
log_info "Installing Android wrapper dependencies..."
cd "$ROOT_DIR/android"
npm ci --silent
log_success "Android dependencies installed"

# Step 4: Initialize Capacitor if needed
if [ ! -d "$ROOT_DIR/android/android" ]; then
  log_info "Initializing Capacitor Android project..."
  npx cap add android
  log_success "Android project initialized"
fi

# Step 5: Sync web assets
log_info "Syncing web assets to Android..."
npx cap sync android
log_success "Assets synced"

# Step 6: Build APK
log_info "Building $BUILD_TYPE APK..."
cd "$ROOT_DIR/android/android"

if [ "$BUILD_TYPE" = "release" ]; then
  ./gradlew assembleRelease
  APK_PATH="$ROOT_DIR/android/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug
  APK_PATH="$ROOT_DIR/android/android/app/build/outputs/apk/debug/app-debug.apk"
fi

if [ -f "$APK_PATH" ]; then
  log_success "APK built: $APK_PATH"
  
  # Copy to output directory
  mkdir -p "$ROOT_DIR/out/android"
  cp "$APK_PATH" "$ROOT_DIR/out/android/"
  
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║           Build Complete!                  ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
  echo ""
  log_info "APK copied to: $ROOT_DIR/out/android/"
else
  log_error "APK not found at expected path"
  exit 1
fi
