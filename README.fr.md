<div align="center">

<img src="renderer/assets/icon.png" alt="PlayOSX" width="120">

# PlayOSX

**Un lanceur de jeux pour Windows, pensé pour la manette, avec une interface façon PS5.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white) ![Version](https://img.shields.io/badge/version-1.0.1--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Languages](https://img.shields.io/badge/languages-6-orange)

[English](README.md) · [العربية](README.ar.md) · **Français** · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md)

</div>

---

## 🎮 Aperçu

<p align="center">
  <img src="docs/screenshot.png" alt="PlayOSX" width="900">
</p>

### 🎬 Voir la démo

<p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="docs/video-thumbnail.png" alt="Voir la démo" width="700">
  </a>
</p>

## ✨ À propos

PlayOSX transforme votre PC en console de salon. Tout est conçu pour la manette : un écran d'accueil fluide façon PS5, un hub de jeu avec illustrations, une surcouche en jeu et un menu rapide. Tous vos jeux (Steam, Epic, émulateurs, raccourcis) au même endroit.

## 🚀 Fonctionnalités

- **Interface façon PS5** : logo de démarrage animé, fond bokeh, grandes illustrations, carrousel fluide et sons.
- **Une seule bibliothèque** : Steam (même les jeux possédés mais non installés), Epic, raccourcis du bureau et émulateurs Nintendo Switch (yuzu et ses forks).
- **Hub de jeu** : illustrations SteamGridDB, détails Steam (description, Metacritic, configuration requise) et musique de thème par jeu.
- **Surcouche en jeu et menu rapide** : fenêtre transparente toujours au premier plan ; rien n'est injecté dans le jeu ni lu depuis celui-ci.
- **Capture et clips** via OBS Studio, lancé discrètement en arrière-plan.
- **Outils manette** : DualSense, remappage par jeu, courbe des gâchettes, vibrations, barre lumineuse, manette-souris et passthrough.
- **Surcouche de performance** : FPS, températures et RAM, plus les modes d'alimentation Windows.
- **Social** : amis Steam, contrôle vocal Discord et écran des téléchargements / mises à jour Steam.
- **Thèmes sonores** : packs de sons Steam Deck de deckthemes.com (ou .zip / dossier local).
- **Veilleuse programmée**, écran de veille, profils avec code PIN et mises à jour depuis GitHub Releases.

## 🌍 Langues

English, العربية (RTL complet), Français, Deutsch, Español et Português.

## 📦 Démarrage

### Téléchargement

Récupérez l'installeur ou l'archive ZIP la plus récente sur la page [Releases](https://github.com/itsfizys/PlayOSX/releases) (Windows 10/11, x64).

### Lancer depuis les sources

Il faut [Node.js](https://nodejs.org) et une connexion Internet (les outils natifs sont récupérés au premier lancement).

```bash
git clone https://github.com/itsfizys/PlayOSX.git
cd PlayOSX
npm install
npm start        # run
npm run dist     # build the Windows installer (dist/)
```

## 🗂️ Structure du projet

```
main/        Electron main process (library, launcher, OBS, Discord, overlay, updater…)
  native/    Windows helpers (syshelper, display, PresentMon, libVIIPER)
renderer/    UI (HTML / CSS / ES modules)
  js/views/  Home, Library, Game Hub, Settings, Downloads…
  js/locales/ ar · de · en · es · fr · pt
build/       Installer scripts
scripts/     Fetch / build helpers for native tools
```

## 🤝 Contribuer

Les issues et pull requests sont les bienvenues. Ouvrez d'abord une issue pour les gros changements.

## 📄 Licence

Publié sous licence MIT. © 2026 Esma3iL Magdey

## ⚠️ Avertissement

PlayOSX est un projet indépendant de fans. Il n'est ni affilié à Sony Interactive Entertainment ni approuvé par elle. PlayStation et PS5 sont des marques de leurs propriétaires respectifs.
