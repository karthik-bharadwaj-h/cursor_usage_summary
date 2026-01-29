# <img src="assets/icon.png" width="32" height="32" align="center" /> Cursor Usage Summary Extension

Display your Cursor AI usage statistics directly in VS Code's status bar.

## Features

- 📊 **Real-time Usage Display** - See your individual usage in the status bar.
- 📈 **Detailed Breakdown** - Click to view team usage, pooled usage, and billing info.
- 🔄 **Auto-refresh** - Updates every 1 minute automatically.
- 🔐 **Secure** - Uses your Cursor authentication token (stored in VS Code settings).
- 🌐 **Proxy Support** - Automatic detection and support for corporate proxies.
- 🛠️ **Customizable UI** - Configure status bar alignment, priority, and compact mode.

## Quick Start

### 1. Install Dependencies
```bash
npm install
npm run compile
```

### 2. Get Your Authentication Token

1. Open https://cursor.com in your browser (make sure you're logged in).
2. Press `F12` to open Developer Tools.
3. Go to **Application** tab → **Cookies** → **https://cursor.com**.
4. Find `WorkosCursorSessionToken` and copy the **entire value**.

Example token format:
`user_01XXX...::eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 3. Configure the Extension

**Option A: Use the Command Palette**
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac).
2. Type: `Configure API Token`.
3. Paste your token and press Enter.

**Option B: Use Settings**
1. Open Settings: `Ctrl+,` (or `Cmd+,`).
2. Search for: `Cursor Usage Summary: Api Token`.
3. Paste your token.

## Commands

- **Configure API Token** - Easy setup wizard for your authentication token.
- **Show Usage Details** - Display detailed usage breakdown in a webview.
- **Test API Connectivity** - Verify your configuration and network access.

## Configuration

### Required Settings
- **Api Token** (`cursorUsageSummary.apiToken`): Your Cursor authentication token.

### Optional Settings
- **Proxy** (`cursorUsageSummary.proxy`): Proxy URL (e.g., `http://proxy-server:8080`). Auto-detected from environment variables (`https_proxy`, `http_proxy`) if not set.
- **Status Bar Alignment** (`cursorUsageSummary.statusBarAlignment`): `Left` or `Right` alignment.
- **Status Bar Priority** (`cursorUsageSummary.statusBarPriority`): Higher values move it towards the center/left.
- **Compact Mode** (`cursorUsageSummary.compactMode`): Show only icon and percentage to save space.

## Troubleshooting

- **Redirect loop detected**: Your token is likely invalid or expired. Get a fresh token from cursor.com.
- **Network error**: Check your internet connection. If you're behind a proxy, ensure it's correctly configured or detected.
- **Using demo data**: The extension falls back to mock data if it can't connect. Check the Developer Console (`Help` → `Toggle Developer Tools`) for logs prefixed with `[UsageService]`.

## Technical Implementation

This extension uses Node.js native `https` module to handle requests, providing better reliability with redirects and cookies compared to external libraries. It handles up to 5 redirects while preserving authentication cookies.

## License
See [LICENSE.md](LICENSE.md) for details.

---
**Made with ❤️ by Karthik Halagur Bharadwaj for Cursor community**

