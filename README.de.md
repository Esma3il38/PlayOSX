<div align="center">

<img src="renderer/assets/icon.png" alt="PlayOSX" width="120">

# PlayOSX

**Ein Controller-first-Spielelauncher für Windows mit PS5-ähnlicher Oberfläche.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white) ![Version](https://img.shields.io/badge/version-1.0.1--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Languages](https://img.shields.io/badge/languages-6-orange)

[English](README.md) · [العربية](README.ar.md) · [Français](README.fr.md) · **Deutsch** · [Español](README.es.md) · [Português](README.pt.md)

</div>

---

## 🎮 Vorschau

<p align="center">
  <img src="docs/screenshot.png" alt="PlayOSX" width="900">
</p>

### 🎬 Demo ansehen

<p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="docs/video-thumbnail.png" alt="Demo ansehen" width="700">
  </a>
</p>

## ✨ Über das Projekt

PlayOSX macht aus deinem PC eine Wohnzimmerkonsole. Alles ist für den Controller gebaut: ein flüssiger Startbildschirm im PS5-Stil, ein Spiele-Hub mit Artwork, ein In-Game-Overlay und ein Schnellmenü. Alle Spiele (Steam, Epic, Emulatoren, Verknüpfungen) an einem Ort.

## 🚀 Funktionen

- **PS5-Oberfläche**: animiertes Boot-Logo, Bokeh-Hintergrund, große Artworks, flüssiges Karussell und Sounds.
- **Eine Bibliothek für alles**: Steam (auch besessene, aber nicht installierte Spiele), Epic, Desktop-Verknüpfungen und Nintendo-Switch-Emulatoren (yuzu und Forks).
- **Spiele-Hub**: Artwork von SteamGridDB, Steam-Details (Beschreibung, Metacritic, Systemanforderungen) und Titelmusik pro Spiel.
- **In-Game-Overlay und Schnellmenü**: transparentes Fenster im Vordergrund; nichts wird ins Spiel injiziert oder daraus gelesen.
- **Aufnahmen und Clips** über OBS Studio, das still im Hintergrund läuft.
- **Controller-Tools**: DualSense, Tastenbelegung pro Spiel, Trigger-Kurve, Vibration, Lightbar, Controller als Maus und Passthrough.
- **Performance-Overlay**: FPS, Temperaturen und RAM sowie Windows-Energiepläne.
- **Social**: Steam-Freunde, Discord-Sprachsteuerung und Steam-Download-/Update-Ansicht.
- **Sound-Themes**: Steam-Deck-Soundpakete von deckthemes.com (oder lokale .zip / Ordner).
- **Nachtmodus-Zeitplan**, Ruhebildschirm, Profile mit PIN und Updates über GitHub Releases.

## 🌍 Sprachen

English, العربية (volle RTL-Unterstützung), Français, Deutsch, Español und Português.

## 📦 Erste Schritte

### Download

Lade den neuesten Installer oder das ZIP von der Seite [Releases](https://github.com/itsfizys/PlayOSX/releases) herunter (Windows 10/11, x64).

### Aus dem Quellcode starten

Du brauchst [Node.js](https://nodejs.org) und eine Internetverbindung (native Hilfsprogramme werden beim ersten Start geladen).

```bash
git clone https://github.com/itsfizys/PlayOSX.git
cd PlayOSX
npm install
npm start        # run
npm run dist     # build the Windows installer (dist/)
```

## 🗂️ Projektstruktur

```
main/        Electron main process (library, launcher, OBS, Discord, overlay, updater…)
  native/    Windows helpers (syshelper, display, PresentMon, libVIIPER)
renderer/    UI (HTML / CSS / ES modules)
  js/views/  Home, Library, Game Hub, Settings, Downloads…
  js/locales/ ar · de · en · es · fr · pt
build/       Installer scripts
scripts/     Fetch / build helpers for native tools
```

## 🤝 Mitwirken

Issues und Pull Requests sind willkommen. Bei größeren Änderungen bitte zuerst ein Issue öffnen.

## 📄 Lizenz

Veröffentlicht unter der MIT-Lizenz. © 2026 Esma3iL Magdey

## ⚠️ Hinweis

PlayOSX ist ein unabhängiges Fan-Projekt und weder mit Sony Interactive Entertainment verbunden noch von ihr unterstützt. PlayStation und PS5 sind Marken ihrer jeweiligen Inhaber.
