# Dynamic Wallpaper

一个将动态网页设置为桌面壁纸的 Windows 应用程序。

## 功能特性

- ✅ 将透明窗口覆盖整个桌面
- ✅ 加载指定动态网页（默认：http://zztool.free.nf/countdown_project/?i=1）
- ✅ 自动适应多显示器设置
- ✅ 点击穿透（不影响桌面操作）
- ✅ 系统托盘支持
- ✅ 快捷键支持（Ctrl+Alt+W 退出，Ctrl+Alt+Q 隐藏）
- ✅ 自动生成桌面和开始菜单快捷方式

## 安装方法

### 方法1：下载安装包（推荐）
1. 从 [Releases](https://github.com/tgcz2011/live-countdown-electron/releases) 下载最新版本
2. 运行 `Dynamic Wallpaper Setup.exe`
3. 按照向导完成安装

### 方法2：便携版
下载 `Dynamic Wallpaper Portable.exe` 直接运行即可

## 使用方法

### 启动
- 安装后自动添加到开机启动
- 手动启动：开始菜单 → Dynamic Wallpaper
- 或双击桌面快捷方式

### 托盘操作
程序运行时在系统托盘显示图标：
- **单击**：显示/隐藏窗口
- **右键菜单**：
  - 显示窗口
  - 退出程序

### 快捷键
- `Ctrl + Alt + W`：完全退出程序
- `Ctrl + Alt + Q`：隐藏窗口（可再次显示）

## 配置

### 更换壁纸网址

编辑安装目录下的 `config.json`（首次运行后自动生成）：

```json
{
  "url": "http://zztool.free.nf/countdown_project/?i=1",
  "autoStart": true,
  "transparent": true,
  "clickThrough": true
}
```

保存后按 `Ctrl+Alt+Q` 然后重新启动程序生效。

## 开发

### 环境要求
- Node.js 18+
- npm

### 本地运行
```bash
git clone https://github.com/tgcz2011/live-countdown-electron.git
cd live-countdown-electron
npm install
npm start
```

### 构建
```bash
npm run build
```

生成的安装包在 `dist/` 目录下

## 技术栈

- Electron 27
- Node.js
- HTML5 Webview
- Windows NSIS 安装器

## 项目结构

```
live-countdown-electron/
├── main.js           # Electron 主进程
├── index.html        # 窗口内容（加载 webview）
├── package.json      # 项目配置
├── config.json       # 用户配置（运行时生成）
├── assets/           # 图标资源
├── dist/             # 构建输出
└── README.md
```

## 常见问题

**Q: 窗口不显示？**  
A: 检查 config.json 中的 URL 是否正确，或按 Ctrl+Alt+Q 隐藏后重新启动。

**Q: 无法点击桌面图标？**  
A: 这是正常现象，程序设置了点击穿透。想操作桌面时请按 Ctrl+Alt+Q 隐藏窗口。

**Q: 开机自启动失效？**  
A: 检查任务管理器 → 启动应用，确保 Dynamic Wallpaper 已启用。

**Q: 多显示器支持？**  
A: 当前版本仅在主显示器显示。多显示器版本正在开发中。

## 许可证

MIT License - 可自由使用、修改和分发

## 反馈与贡献

欢迎提交 Issue 和 Pull Request！

---
Made with ❤️ by Operit