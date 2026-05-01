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
  const primaryDisplay = displays[0];
  const { width, height } = primaryDisplay.workAreaSize;

  const windowOptions = {
    width: width,
    height: height,
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  };

  if (config.transparent !== false) {
    windowOptions.transparent = true;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (config.clickThrough) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  mainWindow.setVisibleOnAllWorkspaces(true);

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Window loses focus - hide (optional)
  mainWindow.on('blur', () => {
    if (config.clickThrough && mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      // mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    let icon;

    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('Dynamic Wallpaper');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示/隐藏',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          }
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
            if (mainWindow) {
              mainWindow.reload();
            }
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
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
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
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  globalShortcut.register('CommandOrControl+Alt+R', () => {
    if (mainWindow) {
      mainWindow.reload();
    }
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

  // IPC handlers
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