// Device facts for Settings > About: PC name, CPU, RAM, graphics card, drives.
// One PowerShell query on Windows (cached for the session); plain Node os
// values everywhere else or if PowerShell fails.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DDR = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5' };
let cache = null;

function basic() {
  const cpus = os.cpus() || [];
  return {
    name: os.hostname(),
    cpu: { name: (cpus[0] && cpus[0].model || '').replace(/\s+/g, ' ').trim(), threads: cpus.length, cores: 0 },
    ram: { total: os.totalmem(), type: '', speed: 0 },
    gpus: [],
    disks: [],
    os: `${os.type()} ${os.release()}`,
  };
}

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$mem = @(Get-CimInstance Win32_PhysicalMemory)
$gpu = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Basic Display|Remote|Virtual|Parsec|Meta ' })
$dsk = @(Get-CimInstance Win32_DiskDrive | Where-Object { $_.MediaType -notmatch 'Removable' })
@{
  cpu = @{ name = $cpu.Name; cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors }
  ram = @{ type = ($mem | Select-Object -First 1).SMBIOSMemoryType; speed = ($mem | Measure-Object -Property ConfiguredClockSpeed -Maximum).Maximum }
  gpus = @($gpu | ForEach-Object { $_.Name })
  disks = @($dsk | ForEach-Object { @{ model = $_.Model; size = $_.Size } })
  os = (Get-CimInstance Win32_OperatingSystem).Caption
} | ConvertTo-Json -Compress -Depth 4
`;

function query() {
  return new Promise((resolve) => {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFile(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 12000 }, (err, stdout) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
      });
  });
}

async function deviceInfo(userDataDir) {
  if (cache) return cache;
  const info = basic();
  if (process.platform === 'win32') {
    const w = await query();
    if (w) {
      if (w.cpu && w.cpu.name) info.cpu = { name: String(w.cpu.name).replace(/\s+/g, ' ').trim(), cores: w.cpu.cores || 0, threads: w.cpu.threads || info.cpu.threads };
      if (w.ram) { info.ram.type = DDR[w.ram.type] || ''; info.ram.speed = w.ram.speed || 0; }
      info.gpus = [].concat(w.gpus || []).filter(Boolean);
      info.disks = [].concat(w.disks || []).filter((d) => d && d.model).map((d) => ({ model: String(d.model).trim(), size: Number(d.size) || 0 }));
      if (w.os) info.os = w.os;
    }
  }
  // Free space of the drive the launcher's data lives on.
  try {
    const st = await fs.promises.statfs(userDataDir);
    info.system = { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch {}
  cache = info;
  return info;
}

module.exports = { deviceInfo };
