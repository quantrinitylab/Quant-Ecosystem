# @quant/quant-desktop

The cross-platform native desktop client for the Quant Ecosystem, powered by Tauri 2.0 and Rust.

## Target Architecture

- **Memory Footprint**: ~35 MB idle RAM (compared to ~450 MB for Electron).
- **System Tray & Hotkey**: Background menu bar presence with global `Cmd+K` / `Ctrl+K` for instant Quanty AI command launcher.
- **Local File System Virtual Drive**: Rust driver integrating with Windows Cloud Files API (ProjFS), macOS FileProvider, and Linux FUSE to expose QuantDrive directly in file explorers.
- **Offline Cache**: Local embedded SQLite with FTS5 for sub-10ms offline search across emails, files, and repositories.
