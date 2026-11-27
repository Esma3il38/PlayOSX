// Bundles yt-dlp (Unlicense) into main/native/yt-dlp.exe so players don't install it.
// Checked against the release's SHA2-256SUMS. Never fails the build: without it the app
// downloads yt-dlp itself on first run.
const fs = require('fs'), path = require('path'), https = require('https'), crypto = require('crypto');
const dest = path.join(__dirname, '..', 'main', 'native', 'yt-dlp.exe');
if (process.platform !== 'win32' || fs.existsSync(dest)) process.exit(0);
const get = (url, cb) => https.get(url, { headers: { 'User-Agent': 'PlayOSX-build', Accept: 'application/vnd.github+json' } }, (r) => (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location ? get(r.headers.location, cb) : cb(r))).on('error', () => process.exit(0));
const read = (url, cb) => get(url, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(Buffer.concat(c))); });
read('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', (b) => {
  try {
    const rel = JSON.parse(b.toString());
    const exe = rel.assets.find((x) => x.name === 'yt-dlp.exe'), sums = rel.assets.find((x) => x.name === 'SHA2-256SUMS');
    if (!exe || !sums) return process.exit(0);
    read(sums.browser_download_url, (list) => {
      const want = (/^([0-9a-f]{64})\s+\*?yt-dlp\.exe$/im.exec(list.toString()) || [])[1];
      read(exe.browser_download_url, (bin) => {
        if (!want || crypto.createHash('sha256').update(bin).digest('hex') !== want.toLowerCase()) return process.exit(0);
        fs.writeFileSync(dest, bin);
        console.log('yt-dlp bundled', rel.tag_name);
      });
    });
  } catch { process.exit(0); }
});
