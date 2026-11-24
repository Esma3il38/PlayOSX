<div align="center">

<img src="renderer/assets/icon.png" alt="PlayOSX" width="120">

# PlayOSX

**Um launcher de jogos para Windows feito para controle, com interface estilo PS5.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white) ![Version](https://img.shields.io/badge/version-1.0.1--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Languages](https://img.shields.io/badge/languages-6-orange)

[English](README.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Português**

</div>

---

## 🎮 Pré-visualização

<p align="center">
  <img src="docs/screenshot.png" alt="PlayOSX" width="900">
</p>

### 🎬 Ver a demonstração

<p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="docs/video-thumbnail.png" alt="Ver a demonstração" width="700">
  </a>
</p>

## ✨ Sobre

O PlayOSX transforma seu PC em um console de sala. Tudo é pensado para o controle: uma tela inicial fluida no estilo PS5, um hub de jogo com artes, um overlay durante o jogo e um menu rápido. Todos os seus jogos (Steam, Epic, emuladores, atalhos) em um só lugar.

## 🚀 Recursos

- **Interface estilo PS5**: logo de inicialização animado, fundo bokeh, grandes artes, carrossel fluido e sons.
- **Uma biblioteca para tudo**: Steam (inclusive jogos que você tem mas não instalou), Epic, atalhos da área de trabalho e emuladores de Nintendo Switch (yuzu e forks).
- **Hub do jogo**: artes do SteamGridDB, detalhes da Steam (descrição, Metacritic, requisitos) e música-tema por jogo.
- **Overlay no jogo e menu rápido**: janela transparente sempre no topo; nada é injetado no jogo nem lido dele.
- **Capturas e clipes** pelo OBS Studio, rodando em silêncio em segundo plano.
- **Ferramentas de controle**: DualSense, remapeamento de botões por jogo, curva dos gatilhos, vibração, lightbar, controle como mouse e passthrough.
- **Overlay de desempenho**: FPS, temperaturas e RAM, além dos planos de energia do Windows.
- **Social**: amigos da Steam, controle de voz do Discord e tela de downloads / atualizações da Steam.
- **Temas de som**: pacotes de som do Steam Deck de deckthemes.com (ou .zip / pasta local).
- **Luz noturna agendada**, tela de descanso, perfis com PIN e atualizações pelo GitHub Releases.

## 🌍 Idiomas

English, العربية (RTL completo), Français, Deutsch, Español e Português.

## 📦 Primeiros passos

### Download

Baixe o instalador ou o ZIP mais recente na página de [Releases](https://github.com/itsfizys/PlayOSX/releases) (Windows 10/11, x64).

### Executar a partir do código

Você precisa do [Node.js](https://nodejs.org) e de internet (as ferramentas nativas são baixadas na primeira execução).

```bash
git clone https://github.com/itsfizys/PlayOSX.git
cd PlayOSX
npm install
npm start        # run
npm run dist     # build the Windows installer (dist/)
```

## 🗂️ Estrutura do projeto

```
main/        Electron main process (library, launcher, OBS, Discord, overlay, updater…)
  native/    Windows helpers (syshelper, display, PresentMon, libVIIPER)
renderer/    UI (HTML / CSS / ES modules)
  js/views/  Home, Library, Game Hub, Settings, Downloads…
  js/locales/ ar · de · en · es · fr · pt
build/       Installer scripts
scripts/     Fetch / build helpers for native tools
```

## 🤝 Contribuindo

Issues e pull requests são bem-vindos. Abra uma issue antes para mudanças grandes.

## 📄 Licença

Publicado sob a licença MIT. © 2026 Esma3iL Magdey

## ⚠️ Aviso

O PlayOSX é um projeto independente de fãs. Não é afiliado nem endossado pela Sony Interactive Entertainment. PlayStation e PS5 são marcas de seus respectivos proprietários.
