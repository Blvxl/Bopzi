const { app, BrowserWindow, Menu, shell, dialog, utilityProcess } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const isPackaged = app.isPackaged;
const projectRoot = path.resolve(__dirname, '..');
const appServerRoot = isPackaged ? path.join(process.resourcesPath, 'app-server') : projectRoot;
const appUrlHost = '127.0.0.1';
let serverProcess;
let serverExitCode = null;
let mainWindow;
let appUrl;
let quitting = false;
let serverOutput = '';

app.setAppUserModelId('com.bopzi.studio');

// An installed copy refuses debugging switches, which could reach into a signed-in session.
if (isPackaged && process.argv.some(arg => /^--(remote-debugging|inspect)/.test(arg))) app.exit(1);

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(startApp).catch(showStartupError);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
  });
  app.on('activate', () => {
    if (mainWindow) mainWindow.show();
  });
}

/** Projects are stored per address, so a changing port would hide them. The same port is used every launch when it is free. */
const HOME_PORTS = [47721, 47722, 47723, 47724, 47725];
async function isFree(port) {
  const server = net.createServer();
  const free = await new Promise(resolve => {
    server.once('error', () => resolve(false));
    server.listen(port, appUrlHost, () => resolve(true));
  });
  if (free) await new Promise(resolve => server.close(resolve));
  return free;
}
async function availablePort() {
  for (const port of HOME_PORTS) if (await isFree(port)) return port;
  throw new Error('Bopzi could not find a free local port. Close other copies of Bopzi and try again.');
}

function startLocalServer(port) {
  const env = {
    ...process.env,
    NODE_ENV: isPackaged ? 'production' : 'development',
    HOSTNAME: appUrlHost,
    PORT: String(port),
    BOPZI_LOCAL_CHATGPT: '1',
    BOPZI_DATA_DIR: app.getPath('userData'),
  };

  if (isPackaged) {
    const binDir = path.join(process.resourcesPath, 'bin');
    const ffmpeg = path.join(binDir, 'ffmpeg.exe');
    const ffprobe = path.join(binDir, 'ffprobe.exe');
    const codex = path.join(binDir, 'codex.exe');
    if (require('node:fs').existsSync(codex)) env.BOPZI_CODEX = codex;
    if (require('node:fs').existsSync(ffmpeg) && require('node:fs').existsSync(ffprobe)) {
      env.BOPZI_FFMPEG = ffmpeg;
      env.BOPZI_FFPROBE = ffprobe;
    }
    return utilityProcess.fork(path.join(appServerRoot, 'server.js'), [], {
      cwd: appServerRoot,
      env,
      serviceName: 'Bopzi local web server',
      stdio: 'pipe',
    });
  }

  const nextCli = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  return spawn(process.execPath, [nextCli, 'dev', '--hostname', appUrlHost, '--port', String(port)], {
    cwd: projectRoot,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!serverProcess || serverExitCode !== null) throw new Error(`The Bopzi server stopped before it was ready.

${serverOutput.slice(-1200)}`);
    try {
      const response = await fetch(appUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* The server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('Bopzi took too long to start.');
}

async function startApp() {
  const port = await availablePort();
  appUrl = `http://${appUrlHost}:${port}`;
  serverProcess = startLocalServer(port);
  serverExitCode = null;
  for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
    stream?.on('data', chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-5000); });
  }
  serverProcess.on('exit', (code, signal) => {
    serverExitCode = code ?? 1;
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Bopzi stopped', `The local app server exited (${signal || code}).\n\n${serverOutput.slice(-2200)}`);
      app.quit();
    }
  });
  await waitForServer();
  buildMenu();
  createWindow();
}

function buildMenu() {
  const go = route => mainWindow?.loadURL(`${appUrl}${route}`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'New thumbnail', accelerator: 'CmdOrCtrl+N', click: () => go('/studio') },
      { label: 'New icon', click: () => go('/studio?format=icon') },
      { label: 'Projects', accelerator: 'CmdOrCtrl+O', click: () => go('/projects') },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'View', submenu: [
      { role: 'reload' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      ...(isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
    ] },
    { label: 'Help', submenu: [
      { label: 'About Bopzi', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'About Bopzi', message: 'Bopzi', detail: `Roblox thumbnail and icon studio · version ${app.getVersion()}` }) },
    ] },
  ]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Bopzi',
    width: 1500,
    height: 980,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#111110',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`${appUrl}/studio`);
}

function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('Could not open Bopzi', `${message}\n\nMake sure this computer can run Bopzi, then try again.`);
  app.quit();
}
