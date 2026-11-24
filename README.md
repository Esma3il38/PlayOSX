<div align="center">

<img src="renderer/assets/icon.png" alt="PlayOSX" width="120">

# PlayOSX

**A controller-first game launcher for Windows with a PS5-style interface.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white) ![Version](https://img.shields.io/badge/version-1.0.1--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Languages](https://img.shields.io/badge/languages-6-orange)

**English** · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md)

</div>

---

## 🎮 Preview

<p align="center">
  <img src="docs/screenshot.png" alt="PlayOSX" width="900">
</p>

### 🎬 Watch the demo

<p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="docs/video-thumbnail.png" alt="Watch the demo" width="700">
  </a>
</p>

## ✨ About

PlayOSX turns your PC into a living-room console. Everything is built for a controller: a smooth PS5-style home screen, a game hub with artwork, an in-game overlay and a quick menu. All your games (Steam, Epic, emulators, shortcuts) live in one place.

## 🚀 Features

- **PS5-style interface**: animated boot logo, bokeh background, hero artwork, smooth tile carousel and sounds.
- **One library for everything**: Steam (including owned but not installed), Epic, desktop shortcuts and Nintendo Switch emulators (yuzu and its forks).
- **Game hub**: artwork from SteamGridDB, Steam details (description, Metacritic, requirements) and per-game theme music.
- **In-game overlay and quick menu**: a transparent always-on-top window; nothing is injected into or read from the game.
- **Capture and clips** through OBS Studio, running silently in the background.
- **Controller tools**: DualSense support, button remap per game, trigger curve, rumble, lightbar, controller-as-mouse and passthrough.
- **Performance overlay**: FPS, temperatures and RAM, plus Windows power plans.
- **Social**: Steam friends, Discord voice control and Steam downloads / updates screen.
- **Sound themes**: Steam Deck sound packs from deckthemes.com (or a local .zip / folder).
- **Night Light schedule**, idle screen, user profiles with PIN, and updates from GitHub Releases.

## 🌍 Languages

English, العربية (full RTL), Français, Deutsch, Español and Português.

## 📦 Getting started

### Download

Grab the latest installer or ZIP from the [Releases](https://github.com/itsfizys/PlayOSX/releases) page (Windows 10/11, x64).

### Run from source

You need [Node.js](https://nodejs.org) and an internet connection (native helpers are fetched on the first run).

```bash
git clone https://github.com/itsfizys/PlayOSX.git
cd PlayOSX
npm install
npm start        # run
npm run dist     # build the Windows installer (dist/)
```

## 🗂️ Project structure

```
main/        Electron main process (library, launcher, OBS, Discord, overlay, updater…)
  native/    Windows helpers (syshelper, display, PresentMon, libVIIPER)
renderer/    UI (HTML / CSS / ES modules)
  js/views/  Home, Library, Game Hub, Settings, Downloads…
  js/locales/ ar · de · en · es · fr · pt
build/       Installer scripts
scripts/     Fetch / build helpers for native tools
```

## 🤝 Contributing

Issues and pull requests are welcome. Please open an issue first for big changes.

## 📄 License

Released under the MIT License. © 2026 Esma3iL Magdey

## ⚠️ Disclaimer

PlayOSX is an independent fan project. It is not affiliated with or endorsed by Sony Interactive Entertainment. PlayStation and PS5 are trademarks of their respective owners.
