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
      alwaysOnTop: false,  // 不在最顶层，避免遮挡桌面图标
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
    win.setAlwaysOnTop(false, 'desktop');  // 关键：设置为桌面层级

    win.loadFile('index.html');

    win.on('closed', () => {
      const idx = windows.indexOf(win);
      if (idx > -1) windows.splice(idx, 1);
    });

    // 保存第一个窗口引用
    if (index === 0) {
      mainWindow = win;
    }
  });

  // Windows 特定：将窗口置于桌面图标下方
  if (process.platform === 'win32') {
    setBehindDesktopIcons(windows);
  }

  return windows;
}

// Windows API：将窗口置于桌面图标下方
function setBehindDesktopIcons(windows) {
  try {
    const user32 = require('ffi-napi').DynamicLibrary('user32', 'stdcall');
    constHWND = require('ref-napi').refType('int');

    // 查找 WorkerW 窗口（桌面图标窗口）
    const FindWindowA = user32.dynamicFunc('FindWindowA', 'int', ['string', 'string']);
    const FindWindowExA = user32.dynamicFunc('FindWindowExA', 'int', ['int', 'int', 'string', 'string']);

    const HWND_BOTTOM = 1;
    const SWP_NOACTIVATE = 0x0010;
    const SWP_NOMOVE = 0x0002;
    const SWP_NOSIZE = 0x0001;
    const SWP_NOZORDER = 0x0004;

    // 查找 Progman 窗口
    const progman = FindWindowA('Progman', null);

    // 查找 WorkerW 窗口
    let workerw = FindWindowExA(progman, 0, 'WorkerW', null);
    if (!workerw) {
      // 发送 0x052C 消息以创建 WorkerW
      user32.dynamicFunc('SendMessageTimeoutA', 'int', ['int', 'int', 'int', 'string', 'int', 'int', 'pointer'])(
        progman, 0x052C, 0, 0, 0, 100, null
      );
      workerw = FindWindowExA(progman, 0, 'WorkerW', null);
    }

    if (workerw) {
      // 将我们的窗口设置为 WorkerW 的子窗口
      windows.forEach(win => {
        const hwnd = win.getNativeWindowHandle();
        if (hwnd) {
          user32.dynamicFunc('SetParent', 'int', ['int', 'int'])(hwnd.readUInt32LE(0), workerw);
        }
      });
    }
  } catch (error) {
    console.log('Windows desktop integration not available:', error.message);
  }
}

function createTray() {
  try {
    // 创建托盘图标（从 base64）
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,' + TRAY_ICON_BASE64
    );

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
            // 更新所有窗口
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
