const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let configPath;
let config = {
  url: 'http://zztool.free.nf/countdown_project/?i=1',
  autoStart: true,
  transparent: true,
  clickThrough: true
};

// Base64 图标 (16x16 PNG)
const TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAZklEQVQ4y2NgQAX8DIwMDAz/Q/8M/AwMDAwMDw38DAwMDA8N/AwMDAwMDw38DAwMDA8N/AwMDAwMDw38DAwMDA8N/AwMDAwMDw38DAwMDA8N/AwMDAwMDw38DAwMDA8N/AwMDAwMDw38BAGFgAAB45N59AAAAAElFTkSuQmCC';

function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

function loadConfig() {
  try {
    configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const savedConfig = JSON.parse(data);
      config = { ...config, ...savedConfig };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const windows = [];

  displays.forEach((display, index) => {
    const { width, height, x, y } = display.bounds;

    const windowOptions = {
      width: width,
      height: height,
      x: x,
      y: y,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      alwaysOnTop: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true
      }
    };

    if (config.transparent !== false) {
      windowOptions.transparent = true;
    }

    const win = new BrowserWindow(windowOptions);
    windows.push(win);

    if (config.clickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }

    win.setVisibleOnAllWorkspaces(true);
    // 设置为桌面层级（Windows: 置于桌面图标下方）
    win.setAlwaysOnTop(false, 'desktop');

    win.loadFile('index.html');

    win.on('closed', () => {
      const idx = windows.indexOf(win);
      if (idx > -1) windows.splice(idx, 1);
    });

    if (index === 0) {
      mainWindow = win;
    }
  });

  return windows;
}

function createTray() {
  try {
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,' + TRAY_ICON_BASE64
    );

    tray = new Tray(icon);
    tray.setToolTip('Dynamic Wallpaper');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示/隐藏',
        click: () => {
          BrowserWindow.getAllWindows().forEach(win => {
            if (win.isVisible()) {
              win.hide();
            } else {
              win.show();
              win.focus();
            }
          });
        }
      },
      {
        label: '更换壁纸地址',
        click: async () => {
          const result = await dialog.showInputBox({
            title: '更换壁纸地址',
            message: '请输入新的网页地址：',
            defaultText: config.url
          });

          if (result && !result.canceled) {
            config.url = result.text;
            saveConfig();
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send('update-url', config.url);
            });
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      });
    });
  } catch (error) {
    console.error('Tray creation error:', error);
  }
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Alt+W', () => {
    app.quit();
  });

  globalShortcut.register('CommandOrControl+Alt+Q', () => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    });
  });

  globalShortcut.register('CommandOrControl+Alt+R', () => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.reload();
    });
  });
}

function setupAutoStart() {
  if (config.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
  }
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createTray();
  registerShortcuts();
  setupAutoStart();

  ipcMain.handle('get-config', () => {
    return config;
  });

  ipcMain.handle('set-config', (event, newConfig) => {
    config = { ...config, ...newConfig };
    saveConfig();
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  if (tray) {
    tray.destroy();
  }
});
