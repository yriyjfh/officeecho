const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

const forceLocalFile = process.env.OFFICEECHO_FORCE_LOCAL_FILE === '1';
const packagedEntry = path.join(__dirname, '../visitor.html');
const localBuiltEntry = path.join(__dirname, '../dist/elderly/visitor.html');

// 禁用 Chromium 的自动播放策略限制
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// 禁用硬件加速（如果遇到渲染问题可以尝试启用）
// app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true, // 全屏模式
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 允许自动播放音频和视频
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // 开发模式下加载本地服务器
  if (!forceLocalFile && (process.env.NODE_ENV === 'development' || !app.isPackaged)) {
    mainWindow.loadURL('http://localhost:3000');
    // 打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    // 打包应用读取根目录 visitor.html，本地回退模式读取 dist/elderly/visitor.html
    mainWindow.loadFile(forceLocalFile ? localBuiltEntry : packagedEntry);
  }

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理窗口最大化
  mainWindow.on('maximize', () => {
    console.log('Window maximized');
  });

  // 处理窗口恢复
  mainWindow.on('unmaximize', () => {
    console.log('Window unmaximized');
  });

  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '切换全屏',
      click: () => {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    },
    {
      label: '开发者工具',
      click: () => {
        mainWindow.webContents.toggleDevTools();
      }
    },
    { type: 'separator' },
    {
      label: '关闭应用',
      click: () => {
        app.quit();
      }
    }
  ]);

  // 监听右键事件
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
    contextMenu.popup(mainWindow);
  });
}

// 应用准备就绪时创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS 上点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（除了 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
