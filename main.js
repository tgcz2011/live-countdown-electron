const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

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

// 使用 PowerShell 调用 Windows API 将窗口置于桌面图标下方
function setAsDesktopWallpaper(win) {
  if (process.platform !== 'win32') return;

  const hwnd = win.getNativeWindowHandle();
  if (!hwnd) return;

  const hwndValue = hwnd.readUInt32LE(0);
  if (!hwndValue) return;

  // PowerShell 脚本：将窗口嵌入到 WorkerW（桌面图标窗口）
  const psScript = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class WinAPI {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
      }
"@

    $progman = [WinAPI]::FindWindow("Progman", $null)
    if ($progman -eq [IntPtr]::Zero) { exit 1 }

    # 发送 0x052C 消息让 Progman 创建 WorkerW
    [WinAPI]::SendMessageTimeout($progman, 0x052C, 0, 0, 0, 1000, [ref]0) | Out-Null

    Start-Sleep -Milliseconds 100

    # 查找 WorkerW 窗口
    $workerw = [WinAPI]::FindWindowEx($progman, [IntPtr]::Zero, "WorkerW", $null)
    if ($workerw -eq [IntPtr]::Zero) {
      # 备用：查找 SHELLDLL_DefView 的父窗口
      $shellView = [WinAPI]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
      if ($shellView -ne [IntPtr]::Zero) {
        $workerw = [WinAPI]::FindWindowEx([IntPtr]::Zero, $shellView, "WorkerW", $null)
      }
    }

    if ($workerw -ne [IntPtr]::Zero) {
      # 将窗口设置为 WorkerW 的子窗口
      [WinAPI]::SetParent($hwndValue, $workerw) | Out-Null

      # 确保窗口覆盖整个屏幕
      $HWND_BOTTOM = 1
      $SWP_NOMOVE = 0x0002
      $SWP_NOSIZE = 0x0001
      $SWP_NOZORDER = 0x0004
      $SWP_FRAMECHANGED = 0x0020

      [WinAPI]::SetWindowPos($hwndValue, $HWND_BOTTOM, 0, 0, 0, 0,
        $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOZORDER -bor $SWP_FRAMECHANGED) | Out-Null
      Write-Host "Success: Window set behind desktop icons"
    } else {
      Write-Host "Error: WorkerW not found"
      exit 1
    }
  `;

  exec(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to set desktop wallpaper:', error.message);
    } else {
      console.log('Desktop wallpaper setup:', stdout.trim() || stderr);
    }
  });
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const windows = [];

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
      alwaysOnTop: false,
      focusable: false,
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

    if (config.clickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }

    win.setVisibleOnAllWorkspaces(true);

    win.loadFile('index.html');

    // 窗口准备就绪后设置为桌面壁纸
    win.once('ready-to-show', () => {
      setAsDesktopWallpaper(win);
    });

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
