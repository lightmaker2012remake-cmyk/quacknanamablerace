'use strict';

// Electron entry point: starts the game + local server and opens two windows,
// the game screen (capture this in OBS) and the control panel.

const { app, BrowserWindow, Menu, screen, shell, powerSaveBlocker, dialog } = require('electron');
const path = require('path');
const { startCore } = require('./core');

// keep the race running smoothly even when the window is hidden behind OBS
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ICON = path.join(__dirname, '..', 'web', 'icon.png');

let core = null;
let gameWin = null;
let controlWin = null;

function webPrefs() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,
    autoplayPolicy: 'no-user-gesture-required',
  };
}

function guard(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(core.url)) e.preventDefault();
  });
}

function openGame() {
  if (gameWin && !gameWin.isDestroyed()) {
    gameWin.show();
    gameWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const h = Math.min(1920, Math.round(wa.height * 0.94));
  const w = Math.round((h * 9) / 16);
  gameWin = new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    title: 'QuackNana Marble Race',
    backgroundColor: '#000000',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: webPrefs(),
  });
  gameWin.setAspectRatio(9 / 16);
  guard(gameWin);
  gameWin.loadURL(core.url + '?view=window');
  gameWin.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      gameWin.setFullScreen(!gameWin.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'Escape' && gameWin.isFullScreen()) {
      gameWin.setFullScreen(false);
    }
  });
  gameWin.on('closed', () => {
    gameWin = null;
  });
}

// 'full' = exactly 1080x1920 (for OBS Window Capture), 'fit' = fit the screen
function setGameSize(size) {
  openGame();
  if (gameWin.isFullScreen()) gameWin.setFullScreen(false);
  if (size === 'full') {
    gameWin.setContentSize(1080, 1920);
    gameWin.setPosition(0, 0);
  } else {
    const wa = screen.getPrimaryDisplay().workAreaSize;
    const h = Math.min(1920, Math.round(wa.height * 0.94));
    gameWin.setContentSize(Math.round((h * 9) / 16), h);
    gameWin.center();
  }
}

function openControl() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.show();
    controlWin.focus();
    return;
  }
  controlWin = new BrowserWindow({
    width: 1000,
    height: 900,
    minWidth: 640,
    minHeight: 500,
    title: 'QuackNana Marble Race - Control Panel',
    backgroundColor: '#14161f',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: webPrefs(),
  });
  guard(controlWin);
  controlWin.loadURL(core.url + 'control');
  controlWin.on('closed', () => {
    controlWin = null;
  });
}

// QMR_SELFTEST=<folder>: add test ducks, start a race, save screenshots of both windows, quit
function selfTest(dir) {
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (win, name) => {
    if (!win || win.isDestroyed()) return;
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, name), img.toPNG());
  };
  setTimeout(() => core.handleControl({ cmd: 'bots', n: 12 }), 1500);
  setTimeout(() => shot(controlWin, 'control.png'), 4000);
  setTimeout(() => shot(gameWin, 'lobby.png'), 4500);
  setTimeout(() => core.handleControl({ cmd: 'start' }), 5000);
  setTimeout(() => shot(gameWin, 'race.png'), 15000);
  setTimeout(() => {
    fs.writeFileSync(path.join(dir, 'done.txt'), 'ok ' + core.url);
    app.quit();
  }, 16000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (core) {
      openGame();
      openControl();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      core = await startCore({
        dataDir: app.getPath('userData'),
        fetch: globalThis.fetch,
        onOpenControl: openControl,
        onOpenGame: openGame,
        onWindowSize: setGameSize,
        version: app.getVersion(),
      });
    } catch (e) {
      dialog.showErrorBox('QuackNana Marble Race', 'Could not start the game:\n' + (e.stack || e));
      app.quit();
      return;
    }
    powerSaveBlocker.start('prevent-app-suspension');
    openGame();
    openControl();
    if (process.env.QMR_SELFTEST) selfTest(process.env.QMR_SELFTEST);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (core) core.shutdown();
    core = null;
  });
}
