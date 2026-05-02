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

// Windows API 函数
let user32, setWindowPos, setParent, findWindow, findWindowEx, sendMessageTimeout;

function initWindowsAPI() {
  if (process.platform !== 'win32') return false;

  try {
    const ffi = require('ffi-napi');
    const ref = require('ref-napi');

    user32 = ffi.DynamicLibrary('user32', 'stdcall');

    // BOOL SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, UINT uFlags);
    setWindowPos = user32.dynamicFunc(
      'SetWindowPos',
      'bool',
      ['int', 'int', 'int', 'int', 'int', 'int', 'uint32']
    );

    // HWND SetParent(HWND hWndChild, HWND hWndNewParent);
    setParent = user32.dynamicFunc(
      'SetParent',
      'int',
      ['int', 'int']
    );

    // HWND FindWindowA(LPCSTR lpClassName, LPCSTR lpWindowName);
    findWindow = user32.dynamicFunc(
      'FindWindowA',
      'int',
      ['string', 'string']
    );

    // HWND FindWindowExA(HWND hWndParent, HWND hWndChildAfter, LPCSTR lpszClass, LPCSTR lpszWindow);
    findWindowEx = user32.dynamicFunc(
      'FindWindowExA',
      'int',
      ['int', 'int', 'string', 'string']
    );

    // LRESULT SendMessageTimeoutA(HWND hWnd, UINT Msg, WPARAM wParam, LPARAM lParam, ...);
    sendMessageTimeout = user32.dynamicFunc(
      'SendMessageTimeoutA',
      'int',
      ['int', 'int', 'int', 'int', 'uint32', 'uint32', 'pointer']
    );

    return true;
  } catch (error) {
    console.error('Failed to init Windows API:', error.message);
    return false;
  }
}

// 将窗口设置为桌面壁纸（置于桌面图标下方）
function setAsDesktopWallpaper(win) {
  if (process.platform !== 'win32' || !user32) return;

  try {
    const hwnd = win.getNativeWindowHandle();
    if (!hwnd) return;

    const hwndValue = hwnd.readUInt32LE(0);
    if (!hwndValue) return;

    // 查找 Progman 窗口
    const progman = findWindow('Progman', null);
    if (!progman) {
      console.error('Failed to find Progman window');
      return;
    }

    // 发送 0x052C 消息让 Progman 创建 WorkerW
    const SMTO_NORMAL = 0x0000;
    const result = sendMessageTimeout(
      progman,
      0x052C,
      0,
      0,
      SMTO_NORMAL,
      1000,
      null
    );

    // 等待一小段时间让 WorkerW 创建
    const { setTimeout } = require('timers');
    setTimeout(() => {
      // 查找 WorkerW 窗口（它是 Progman 的子窗口，包含桌面图标）
      let workerw = findWindowEx(progman, 0, 'WorkerW', null);
      if (!workerw) {
        // 备用方案：查找 SHELLDLL_DefView 的父窗口
        const shellView = findWindowEx(0, 0, 'SHELLDLL_DefView', null);
        if (shellView) {
          workerw = findWindowEx(0, shellView, 'WorkerW', null);
        }
      }

      if (workerw) {
        // 关键：将我们的窗口设置为 WorkerW 的子窗口
        // 这样窗口就会在桌面图标下方
        setParent(hwndValue, workerw);
        console.log('Window set as desktop wallpaper (behind icons)');

        // 确保窗口覆盖整个屏幕
        const SWP_NOSIZE = 0x0001;
        const SWP_NOMOVE = 0x0002;
        const SWP_NOZORDER = 0x0004;
        const SWP_FRAMECHANGED = 0x0020;
        const HWND_BOTTOM = 1;

        setWindowPos(hwndValue, HWND_BOTTOM, 0, 0, 0, 0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
      } else {
        console.error('Failed to find WorkerW window');
      }
    }, 100);

  } catch (error) {
    console.error('setAsDesktopWallpaper error:', error);
  }
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const windows = [];

  // 初始化 Windows API
  if (process.platform === 'win32') {
    initWindowsAPI();
  }

  displays.forEach((display, index) => {
    const { width, height, x, y } = display.bounds;

    console.log(`Creating window for display ${index}: ${width}x${height} at (${x},${y})`);

    const windowOptions = {
      width: width,
      height: height,
      x: x,
      y: y,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      // 关键：不要设置 alwaysOnTop，让桌面 API 控制层级
      alwaysOnTop: false,
      focusable: false,
      // 确保窗口在最底层
      type: 'desktop',
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

    // 点击穿透
    if (config.clickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }

    // 显示在所有工作区
    win.setVisibleOnAllWorkspaces(true);

    // 加载网页
    win.loadFile('index.html');

    // 窗口创建后，设置为桌面壁纸（Windows 特定）
    if (process.platform === 'win32') {
      win.once('ready-to-show', () => {
        setAsDesktopWallpaper(win);
      });
    }

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
          BrowserWindow.getAllWindows().forEach(win => {
            if (win.isVisible()) {
              win.hide();
            } else {
              win.show();
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
