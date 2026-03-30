# AppVault
[![website](https://img.shields.io/badge/Website-blue?style=for-the-badge&color=red)](https://appvlt.pages.dev/)

[![version](https://img.shields.io/github/v/release/k3fya/AppVault?label=version&style=for-the-badge)](https://github.com/k3fya/AppVault/releases)
![Platform](https://img.shields.io/badge/Platform-Windows_10%2F11-gray?style=for-the-badge&labelColor=gray&color=blue)
![License: MIT|123](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
[![Downloads](https://img.shields.io/github/downloads/k3fya/AppVault/total?style=for-the-badge)](https://github.com/k3fya/AppVault/releases)

**AppVault** is a convenient and flexible shortcut manager for Windows, designed to organize your workspace and provide quick access to your essential applications.

![](https://i.imgur.com/yWEyWgX.png)

## ✨ Features
- **Shortcut grouping:** Create sections to structure your applications.
- **Drag-and-Drop:** Add programs by simply dragging their shortcuts or `.exe` files directly into the app window.
- **Context menu:** Quick access to actions via right‑click for shortcuts and sections.
- **Run as administrator:** Launch programs with elevated privileges directly from the menu.
- **Localization:** Full support for both English and Russian languages.

### ⚡  Quick Access & System Tray
- **Quick launch window:** Instantly open your program list using the `Win + Shift + D` hotkey (customizable) when the app is minimized to the tray.
- **Advanced tray menu:** Displays up to 5 frequently used shortcuts.
- **Background mode:** Option to minimize to tray on close and start automatically with Windows.

### 🎨 Interface Personalization
- **Themes & scaling:** Light and dark themes, UI scaling from 100% to 150%.
- **Display modes:** Switch between “List” and “Grid” shortcut layouts.
- **Flexible sidebar:** Adjust the sidebar width and position (left or right).
- **Discord Status:** Option to display your activity in your Discord profile.

### 💾 Data Safety
- **Export & import:** Full backup of your settings and data for transferring to another PC.
- **Data reset:** Quickly clear user data without losing application settings.
- **Security:** All your data and settings are stored locally on your device and never transmitted anywhere.

## 📥 Installation
1. Go to the Releases page, choose the latest version, and download either the installer (`.exe`) or the portable build (`.zip`).
2. Installer: run `AppVault Setup <version>.exe` and follow the instructions.
3. Portable: extract the archive and run `AppVault.exe`.

**System requirements:** Windows 10/11 (x64).

## ⚙️ Settings & Configuration
Example (default structure from `data.json`):
```json
{
  "settings": {
    "window": {
      "width": 1248,
      "height": 688,
      "isMaximized": false
    },
    "lang": "en",
    "startWithSystem": false,
    "trayOnClose": false,
    "showDiscordStatus": false,
    "hotkey": "Super+Shift+D",
    "theme": "dark",
    "scale": "1.00",
    "sidebarPosition": "left",
    "sidebarWidth": 215,
    "shortcutsLayout": "list"
  }
}
```

- Data location: `%APPDATA%/AppVault`
- Export/import: in **Settings → General → Data** — creates a copy of `data.json` containing your database and settings.

# 📝 Contacts
If you have bugs or suggestions, feel free to open an issue on GitHub or join our Discord server via [this link](https://discord.gg/DDJvjdnJ8t)
