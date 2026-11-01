// Keeps an installed Bopzi up to date. The latest version is described in a file signed with the owner's key,
// so a new installer is only ever run if the owner published it, whatever happens to the place it is hosted.
const { createHash, verify } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createWriteStream, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARN3BcZ6XU0hZ2mwuWwkHhKJ5KqvBf1nxPOGvUvGaMnI=
-----END PUBLIC KEY-----
`;
const CONTEXT = 'bopzi-update-v1\n';
const REPO = 'Blvxl/bopzi-licenses';
const MANIFEST_API = `https://api.github.com/repos/${REPO}/contents/latest.json`;
const MANIFEST_RAW = `https://raw.githubusercontent.com/${REPO}/main/latest.json`;
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`;
const CHECK_EVERY_MS = 3_600_000;
const CHECK_ON_FOCUS_MS = 10 * 60_000;

const parts = (version) => String(version).split('.').map((n) => Number.parseInt(n, 10) || 0);
/** Whether `next` is a later version than `current`, so an old release can never be pushed back on anyone. */
function isNewer(next, current) {
  const [a, b] = [parts(next), parts(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** Returns the release described by a signed file, or null if the owner did not sign it or it looks wrong. */
function readManifest(text, publicKey = PUBLIC_KEY) {
  try {
    const { body, signature } = JSON.parse(text);
    if (!verify(null, Buffer.from(CONTEXT + body), publicKey, Buffer.from(signature, 'base64url'))) return null;
    const release = JSON.parse(body);
    if (typeof release.version !== 'string' || !release.files || typeof release.files !== 'object') return null;
    for (const file of Object.values(release.files)) {
      if (!String(file.url).startsWith(DOWNLOADS) || !/^[a-f0-9]{128}$/.test(file.sha512) || !Number.isSafeInteger(file.size)) return null;
    }
    return release;
  } catch {
    return null;
  }
}

async function fetchManifest() {
  for (const [url, headers] of [[MANIFEST_API, { accept: 'application/vnd.github.raw', 'user-agent': 'Bopzi' }], [MANIFEST_RAW, {}]]) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      const release = res.ok ? readManifest(await res.text()) : null;
      if (release) return release;
    } catch { /* the next address, or the next check */ }
  }
  return null;
}

/** Downloads the installer and keeps it only if it is exactly the file the owner signed. */
async function download(file, target, onProgress) {
  const res = await fetch(file.url);
  if (!res.ok || !res.body) throw new Error('The download could not start.');
  const hash = createHash('sha512');
  const out = createWriteStream(target);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      onProgress(Math.min(received / file.size, 1));
    }
  } finally {
    await new Promise((resolve) => out.end(resolve));
  }
  if (received !== file.size || hash.digest('hex') !== file.sha512) {
    rmSync(target, { force: true });
    throw new Error('The download did not match the published update.');
  }
}

function startUpdates(getWindow, getAppUrl) {
  const { app, dialog, ipcMain } = require('electron');
  let release = null;
  let state = null;

  const show = (next) => {
    state = next;
    getWindow()?.webContents.send('update:state', state);
  };

  async function check() {
    if (state?.progress != null) return;
    const latest = await fetchManifest();
    if (!latest?.files[process.arch] || !isNewer(latest.version, app.getVersion())) return;
    release = latest;
    show({ version: latest.version, progress: null });
  }

  async function install() {
    if (!release || state?.progress != null) return;
    const { version } = release;
    show({ version, progress: 0 });
    try {
      const folder = path.join(app.getPath('temp'), 'bopzi-update');
      mkdirSync(folder, { recursive: true });
      const target = path.join(folder, `Bopzi-Setup-${version}.exe`);
      let shown = 0;
      await download(release.files[process.arch], target, (done) => {
        if (done - shown < 0.01) return;
        shown = done;
        getWindow()?.setProgressBar(done);
        show({ version, progress: done });
      });
      getWindow()?.setProgressBar(-1);
      // Installing restarts Bopzi, which shouldn't log anyone out.
      const url = getAppUrl();
      await fetch(`${url}/api/access`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1', origin: url }, body: '{"action":"keep-for-update"}' }).catch(() => undefined);
      // The installer replaces this app, so Bopzi closes and the installer opens it again when it is done.
      spawn(target, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } catch (error) {
      getWindow()?.setProgressBar(-1);
      show({ version, progress: null });
      const window = getWindow();
      if (window) await dialog.showMessageBox(window, { type: 'warning', title: 'Update failed', message: 'Bopzi could not update', detail: `${error instanceof Error ? error.message : 'Try again later.'} Your projects are safe.`, buttons: ['OK'] });
    }
  }

  ipcMain.handle('update:state', () => state);
  ipcMain.handle('update:install', install);
  setTimeout(() => void check(), 8000);
  setInterval(() => void check(), CHECK_EVERY_MS);
  // Coming back to Bopzi is a good moment to look, so a new version doesn't wait for the hourly check.
  let lastLook = Date.now();
  app.on('browser-window-focus', () => {
    if (Date.now() - lastLook < CHECK_ON_FOCUS_MS) return;
    lastLook = Date.now();
    void check();
  });
}

module.exports = { isNewer, readManifest, startUpdates, CONTEXT, DOWNLOADS, PUBLIC_KEY };
