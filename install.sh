#!/bin/bash

# Cursor Usage Summary Extension - Installation Script
# This script automatically installs dependencies and builds the extension

set -e  # Exit on any error

echo "=========================================="
echo "Cursor Usage Summary Extension Installer"
echo "=========================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if Node.js is installed
if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command_exists npm; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Display Node.js and npm versions
echo "Detected versions:"
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo ""

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found in current directory"
    echo "   Please run this script from the extension root directory"
    exit 1
fi

# Clean previous builds if they exist
echo "📁 Cleaning previous builds..."
if [ -d "node_modules" ]; then
    echo "  Removing existing node_modules..."
    rm -rf node_modules
fi

if [ -d "out" ]; then
    echo "  Removing existing out directory..."
    rm -rf out
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Run compilation
echo ""
echo "🔨 Building extension..."
npm run compile

# Verify build success
if [ ! -d "out" ]; then
    echo "❌ Build failed: 'out' directory was not created"
    exit 1
fi

if [ ! -f "out/extension.js" ]; then
    echo "❌ Build failed: 'out/extension.js' was not created"
    exit 1
fi

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Open Cursor"
echo "  2. Press Ctrl+Shift+P (or Cmd+Shift+P on Mac)"
echo "  3. Type 'Developer: Reload Window' and run it"
echo "  4. Configure your API token by running 'Configure API Token' command"
echo ""
echo "🔗 For setup instructions, see README.md"
echo "=========================================="
