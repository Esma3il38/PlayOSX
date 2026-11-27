// The full-screen "Installing the update" window (same look as the launcher). It is a small HTA page (Windows' own mshta.exe runs
// it), so it keeps running while the launcher is closed and its files are
// replaced. The page itself does the install: it waits for the launcher to
// exit, stops anything left running from the install folder, runs the setup
// silently, shows "Restarting…" and makes sure the launcher starts again.
// If the silent setup fails it opens the normal setup window instead.

const TEXT = {
  en: {
    prep: 'Preparing the update…',
    title: 'Installing the update',
    sub: 'Please wait. Don’t turn off your PC.',
    doneTitle: 'Update installed',
    doneSub: 'Restarting PlayOSX…',
    failTitle: 'Couldn’t install automatically',
    failSub: 'Opening the setup window. Finish the installation there.',
  },
  ar: {
    prep: 'جارٍ تجهيز التحديث…',
    title: 'جارٍ تثبيت التحديث',
    sub: 'من فضلك انتظر ولا تُطفئ الجهاز.',
    doneTitle: 'تم تثبيت التحديث',
    doneSub: 'جارٍ إعادة تشغيل PlayOSX…',
    failTitle: 'تعذّر التثبيت تلقائيًا',
    failSub: 'جارٍ فتح نافذة التثبيت. أكمل التثبيت منها.',
  },
  es: {
    prep: 'Preparando la actualización…',
    title: 'Instalando la actualización',
    sub: 'Espera, por favor. No apagues el PC.',
    doneTitle: 'Actualización instalada',
    doneSub: 'Reiniciando PlayOSX…',
    failTitle: 'No se pudo instalar automáticamente',
    failSub: 'Abriendo la ventana de instalación. Termina la instalación allí.',
  },
  de: {
    prep: 'Update wird vorbereitet…',
    title: 'Update wird installiert',
    sub: 'Bitte warten. Schalte den PC nicht aus.',
    doneTitle: 'Update installiert',
    doneSub: 'PlayOSX wird neu gestartet…',
    failTitle: 'Automatische Installation nicht möglich',
    failSub: 'Das Setup-Fenster wird geöffnet. Schließe die Installation dort ab.',
  },
  fr: {
    prep: 'Préparation de la mise à jour…',
    title: 'Installation de la mise à jour',
    sub: 'Patiente un instant. N’éteins pas le PC.',
    doneTitle: 'Mise à jour installée',
    doneSub: 'Redémarrage de PlayOSX…',
    failTitle: 'Installation automatique impossible',
    failSub: 'Ouverture de la fenêtre d’installation. Termine l’installation depuis celle-ci.',
  },
  pt: {
    prep: 'Preparando a atualização…',
    title: 'Instalando a atualização',
    sub: 'Aguarde. Não desligue o PC.',
    doneTitle: 'Atualização instalada',
    doneSub: 'Reiniciando o PlayOSX…',
    failTitle: 'Não foi possível instalar automaticamente',
    failSub: 'Abrindo a janela de instalação. Conclua a instalação por lá.',
  },
};

const PAGE = String.raw`<!DOCTYPE html>
<html>
<head>
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>PlayOSX</title>
<hta:application id="upd" applicationname="PlayOSX Update" border="none" caption="no" contextmenu="no" selection="no" scroll="no" showintaskbar="yes" singleinstance="yes" sysmenu="no" windowstate="normal" />
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
body {
  background: #05070d;
  background: radial-gradient(ellipse at 50% 35%, #101a33 0%, #080d1a 48%, #05070d 100%);
  color: #fff;
  font-family: "Segoe UI Variable Display", "Segoe UI", Tahoma, Arial, sans-serif;
  cursor: default;
  -ms-user-select: none;
}
.stage { position: absolute; left: 0; top: 0; right: 0; bottom: 0; display: -ms-flexbox; display: flex; -ms-flex-direction: column; flex-direction: column; -ms-flex-align: center; align-items: center; -ms-flex-pack: center; justify-content: center; text-align: center; }
.logo-wrap { position: relative; width: 150px; height: 150px; margin-bottom: 44px; }
.logo { position: absolute; left: 25px; top: 25px; width: 100px; height: 100px; color: #fff; }
.logo svg { width: 100%; height: 100%; display: block; }
.ring { position: absolute; left: 0; top: 0; width: 142px; height: 142px; border: 3px solid rgba(255, 255, 255, 0.12); border-top-color: rgba(255, 255, 255, 0.9); border-radius: 50%; -ms-animation: spin 1.1s linear infinite; animation: spin 1.1s linear infinite; }
.done .ring { border-color: rgba(255, 255, 255, 0.85); -ms-animation: none; animation: none; }
@keyframes spin { to { transform: rotate(360deg); } }
h1 { margin: 0 0 14px 0; font-size: 46px; font-weight: 700; color: #fff; letter-spacing: 0.2px; }
p { margin: 0; font-size: 22px; color: rgba(255, 255, 255, 0.62); }
.bar { width: 560px; max-width: 80%; height: 10px; margin: 46px 0 14px 0; border-radius: 99px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.bar i { display: block; width: 0%; height: 100%; border-radius: 99px; background: #fff; }
.pct { font-size: 22px; font-weight: 600; color: rgba(255, 255, 255, 0.85); height: 30px; }
.ver { position: absolute; bottom: 36px; left: 0; right: 0; font-size: 18px; color: rgba(255, 255, 255, 0.4); }
</style>
</head>
<body>
<div class="stage" id="stage">
  <div class="logo-wrap"><div class="ring"></div><div class="logo"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z"/></svg></div></div>
  <h1 id="title"></h1>
  <p id="sub"></p>
  <div class="bar"><i id="fill"></i></div>
  <div class="pct" id="pct"></div>
  <div class="ver" id="ver"></div>
</div>
<script type="text/javascript">
var CFG = __CFG__;
var sh = null, fso = null, wmi = null;
var pct = 0, target = 0, tick = null;

function el(id) { return document.getElementById(id); }
function now() { return new Date().getTime(); }
function log(m) {
  try { var f = fso.OpenTextFile(CFG.log, 8, true); f.WriteLine(new Date().toLocaleTimeString() + '  ' + m); f.Close(); } catch (e) {}
}
function setResult(v) {
  try { var f = fso.CreateTextFile(CFG.result, true); f.Write(v); f.Close(); } catch (e) {}
}
function say(title, sub) { el('title').innerText = title; el('sub').innerText = sub; }
function paint() {
  var w = Math.round(pct);
  el('fill').style.width = w + '%';
  el('pct').innerText = target > 0 ? w + '%' : '';
}
function startProgress() {
  target = 92;
  if (tick) return;
  tick = setInterval(function () {
    if (pct < target) { pct += Math.max(0.12, (target - pct) * 0.025); if (pct > target) pct = target; paint(); }
  }, 150);
}
function closeSoon(ms) { setTimeout(function () { try { window.close(); } catch (e) {} }, ms); }

function count(query) {
  try { return wmi.ExecQuery(query).Count; } catch (e) { return 0; }
}
function killLeftovers() {
  try {
    var dir = CFG.dir.toLowerCase();
    var e = new Enumerator(wmi.ExecQuery('select ProcessId, Name, ExecutablePath from Win32_Process'));
    for (; !e.atEnd(); e.moveNext()) {
      var p = e.item();
      var path = p.ExecutablePath;
      if (path && path.toLowerCase().indexOf(dir) === 0) {
        log('stopping ' + p.Name);
        try { p.Terminate(); } catch (x) {}
      }
    }
  } catch (x) { log('could not list processes: ' + x.message); }
}

/* 1. wait for the launcher to close */
function waitLauncher() {
  if (!wmi) { log('no WMI: waiting a few seconds instead'); return setTimeout(stopLeftovers, 6000); }
  var t0 = now();
  (function poll() {
    if (count('select ProcessId from Win32_Process where ProcessId=' + CFG.pid) === 0) { log('launcher closed'); return stopLeftovers(); }
    if (now() - t0 > 20000) { log('launcher is still open, ending it'); return stopLeftovers(); }
    setTimeout(poll, 300);
  })();
}

/* 2. end what is still running from the install folder (the setup can't replace files in use) */
function stopLeftovers() {
  var n = 0;
  (function round() {
    killLeftovers();
    n++;
    if (n < 3) setTimeout(round, 700); else setTimeout(runSetup, 700);
  })();
}

/* 3. run the setup silently */
function runSetup() {
  say(CFG.t.title, CFG.t.sub);
  startProgress();
  var cmd = '"' + CFG.setup + '" /S --updated --force-run';
  log('running: ' + cmd);
  var proc = null;
  try { proc = sh.Exec(cmd); } catch (e) {
    log('Exec failed (' + e.message + '), trying Run');
    try { var code = sh.Run(cmd, 0, true); log('setup exit code ' + code); return code === 0 ? success() : fail(); } catch (e2) { log('Run failed: ' + e2.message); return fail(); }
  }
  (function poll() {
    if (proc.Status === 0) { setTimeout(poll, 400); return; }
    var code = proc.ExitCode;
    log('setup exit code ' + code);
    if (code === 0) success(); else fail();
  })();
}

/* 4. done: restart the launcher */
function success() {
  setResult('ok');
  target = 100; pct = 100; paint();
  el('stage').className = 'stage done';
  say(CFG.t.doneTitle, CFG.t.doneSub);
  var t0 = now(), started = false;
  (function chk() {
    if (count("select ProcessId from Win32_Process where Name='" + CFG.exeName + "'") > 0) { log('launcher is running'); return closeSoon(1800); }
    if (!started && wmi && now() - t0 > 4000) {
      started = true;
      log('starting the launcher');
      try { sh.Run('"' + CFG.exe + '"', 1, false); } catch (e) { log('could not start it: ' + e.message); }
    }
    if (!wmi && now() - t0 > 6000) return closeSoon(500);
    if (now() - t0 > 20000) return closeSoon(500);
    setTimeout(chk, 600);
  })();
}

function fail() {
  setResult('failed');
  el('stage').className = 'stage fail';
  target = 0; paint();
  say(CFG.t.failTitle, CFG.t.failSub);
  try { sh.Run('"' + CFG.setup + '"', 1, false); } catch (e) { log('could not open the setup: ' + e.message); }
  closeSoon(5000);
}

/* Full screen even when Windows keeps the title bar: size the window so its content area is the whole screen,
   then move it up and left so the frame sits off-screen. (A maximized window can't be moved or resized.) */
function fullscreen() {
  try {
    var w = screen.width, h = screen.height;
    window.moveTo(0, 0);
    window.resizeTo(w, h);
    var padX = w - document.documentElement.clientWidth;
    var padY = h - document.documentElement.clientHeight;
    if (padX > 0 || padY > 0) {
      var b = Math.round(padX / 2);
      window.resizeTo(w + padX, h + padY);
      window.moveTo(-b, -(padY - b));
    }
  } catch (e) {}
}

window.onerror = function (m) { log('error: ' + m); return true; };
window.onload = function () {
  fullscreen();
  setTimeout(fullscreen, 400);
  try {
    sh = new ActiveXObject('WScript.Shell');
    fso = new ActiveXObject('Scripting.FileSystemObject');
  } catch (e) { say(CFG.t.failTitle, e.message); return; }
  try { wmi = new ActiveXObject('WbemScripting.SWbemLocator').ConnectServer('.', 'root\\cimv2'); } catch (e) { wmi = null; log('WMI is not available: ' + e.message); }
  if (CFG.rtl) { document.body.style.direction = 'rtl'; }
  el('ver').innerText = 'PlayOSX ' + CFG.version;
  say(CFG.t.title, CFG.t.prep);
  log('update page opened');
  waitLauncher();
};
</script>
</body>
</html>
`;

/** The page's HTML for this update; `cfg` holds paths, the launcher's pid and the language. */
function buildPage(cfg) {
  const lang = TEXT[cfg.lang] ? cfg.lang : 'en';
  const data = {
    pid: cfg.pid,
    setup: cfg.setup,
    exe: cfg.exe,
    exeName: cfg.exeName,
    dir: cfg.dir.endsWith('\\') ? cfg.dir : `${cfg.dir}\\`,
    log: cfg.log,
    result: cfg.result,
    version: cfg.version,
    rtl: lang === 'ar',
    t: TEXT[lang],
  };
  // "<" is escaped so nothing in a path can end the script block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return PAGE.replace('__CFG__', () => json);
}

module.exports = { buildPage };
