// Downloads Intel PresentMon (MIT) to main/native/PresentMon.exe for the FPS counter. Never fails the build.
const fs = require('fs'), path = require('path'), https = require('https');
const dest = path.join(__dirname, '..', 'main', 'native', 'PresentMon.exe');
if (process.platform !== 'win32' || fs.existsSync(dest)) process.exit(0);
const get = (url, cb) => https.get(url, { headers: { 'User-Agent': 'playosx' } }, (r) => (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location ? get(r.headers.location, cb) : cb(r))).on('error', () => process.exit(0));
get('https://api.github.com/repos/GameTechDev/PresentMon/releases/latest', (r) => {
  let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => {
    try {
      const a = JSON.parse(b).assets.find((x) => /PresentMon.*x64.*\.exe$/i.test(x.name));
      if (!a) return process.exit(0);
      get(a.browser_download_url, (f) => f.pipe(fs.createWriteStream(dest)).on('finish', () => console.log('PresentMon downloaded')));
    } catch { process.exit(0); }
  });
});
