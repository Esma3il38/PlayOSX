<div align="center">

<img src="renderer/assets/icon.png" alt="PlayOSX" width="120">

# PlayOSX

**لانشر ألعاب للويندوز بواجهة بتشبه PS5 ومصمم للتحكم بالذراع.**

![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white) ![Version](https://img.shields.io/badge/version-1.0.1--beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Languages](https://img.shields.io/badge/languages-6-orange)

[English](README.md) · **العربية** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md)

</div>

---

<div dir="rtl">

## 🎮 معاينة

<p align="center">
  <img src="docs/screenshot.png" alt="PlayOSX" width="900">
</p>

### 🎬 شاهد العرض التوضيحي

<p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="docs/video-thumbnail.png" alt="شاهد العرض التوضيحي" width="700">
  </a>
</p>

## ✨ نبذة

PlayOSX بيحوّل جهازك لكونسول في الصالون. كل حاجة مصممة للذراع: شاشة رئيسية سلسة بشكل PS5، وصفحة لكل لعبة بالأرتوورك، وأوفرلاي أثناء اللعب وقائمة سريعة. وكل ألعابك (Steam وEpic والمحاكيات والاختصارات) في مكان واحد.

## 🚀 المميزات

- **واجهة بشكل PS5**: لوجو تشغيل متحرك، خلفية bokeh، صور كبيرة للألعاب، كاروسيل سلس وأصوات.
- **مكتبة واحدة لكل حاجة**: Steam (حتى الألعاب المملوكة وغير المثبتة)، Epic، اختصارات سطح المكتب ومحاكيات Nintendo Switch (yuzu وفروعه).
- **صفحة اللعبة**: أرتوورك من SteamGridDB، تفاصيل Steam (الوصف وMetacritic والمتطلبات) وموسيقى خاصة بكل لعبة.
- **أوفرلاي أثناء اللعب وقائمة سريعة**: نافذة شفافة فوق كل شيء، ومفيش أي حاجة بتتحقن في اللعبة أو تتقرأ منها.
- **تسجيل ومقاطع** عن طريق OBS Studio بيشتغل بصمت في الخلفية.
- **أدوات الذراع**: دعم DualSense، تغيير الأزرار لكل لعبة، منحنى الزناد، الاهتزاز، اللايت بار، الذراع كماوس وpassthrough.
- **أوفرلاي الأداء**: FPS والحرارة والرام، وخطط الطاقة في ويندوز.
- **اجتماعي**: أصدقاء Steam، التحكم بصوت Discord وشاشة تنزيلات وتحديثات Steam.
- **ثيمات الصوت**: حزم أصوات Steam Deck من deckthemes.com (أو ملف .zip / مجلد محلي).
- **جدولة الإضاءة الليلية**، شاشة الخمول، ملفات مستخدمين بـ PIN، وتحديثات من GitHub Releases.

## 🌍 اللغات

English، العربية (دعم كامل لـ RTL)، Français، Deutsch، Español وPortuguês.

## 📦 البدء

### التحميل

نزّل آخر نسخة (Installer أو ZIP) من صفحة [Releases](https://github.com/itsfizys/PlayOSX/releases) (ويندوز 10/11، x64).

### التشغيل من الكود

محتاج [Node.js](https://nodejs.org) واتصال بالإنترنت (الأدوات الأصلية بتتحمل أول تشغيل).

```bash
git clone https://github.com/itsfizys/PlayOSX.git
cd PlayOSX
npm install
npm start        # run
npm run dist     # build the Windows installer (dist/)
```

## 🗂️ هيكل المشروع

```
main/        Electron main process (library, launcher, OBS, Discord, overlay, updater…)
  native/    Windows helpers (syshelper, display, PresentMon, libVIIPER)
renderer/    UI (HTML / CSS / ES modules)
  js/views/  Home, Library, Game Hub, Settings, Downloads…
  js/locales/ ar · de · en · es · fr · pt
build/       Installer scripts
scripts/     Fetch / build helpers for native tools
```

## 🤝 المساهمة

المشاكل (Issues) وطلبات الدمج (Pull Requests) مرحب بيها. افتح Issue الأول لو التعديل كبير.

## 📄 الترخيص

مُرخّص تحت رخصة MIT. © 2026 Esma3iL Magdey

## ⚠️ تنبيه

PlayOSX مشروع مستقل من محبي PlayStation، وغير تابع لشركة Sony Interactive Entertainment أو معتمد منها. PlayStation وPS5 علامات تجارية لأصحابها.

</div>
