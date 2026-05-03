const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// Import recorder logic
const { startRecording, analyzeUrl, renderPreviewState, disposePreviewState } = require('./recorder');

let mainWindow;

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (err) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
  });

  mainWindow.setMenuBarVisibility(false);
  
  await ensureDir(path.join(__dirname, '..', 'projects'));
  await ensureDir(path.join(__dirname, '..', 'output'));

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

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

app.on('before-quit', async () => {
  try {
    await disposePreviewState();
  } catch {}
});

// IPC Handlers
ipcMain.handle('open-file', async (event, filePath) => {
  await shell.openPath(filePath)
})

ipcMain.on('close-window', () => {
  app.quit();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('toggle-maximize-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }
  mainWindow.maximize();
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-html-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-flow-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath, 'utf8');

  return {
    path: filePath,
    content: JSON.parse(data)
  };
});

ipcMain.handle('save-flow', async (event, { urlSlug, steps }) => {
  const projectDir = path.join(__dirname, '..', 'projects', urlSlug);
  await ensureDir(projectDir);
  await fs.writeFile(
    path.join(projectDir, 'flow.json'),
    JSON.stringify(steps, null, 2)
  );
  return { success: true };
});

ipcMain.handle('load-flow', async (event, { urlSlug }) => {
  try {
    const flowPath = path.join(__dirname, '..', 'projects', urlSlug, 'flow.json');
    const data = await fs.readFile(flowPath, 'utf8');
    return { success: true, steps: JSON.parse(data) };
  } catch (err) {
    return { success: false, error: 'Not found' };
  }
});

ipcMain.handle('analyze-url', async (event, { url }) => {
  return await analyzeUrl(url);
});

ipcMain.handle('render-preview-state', async (event, { url, steps, timeMs, browserConfig }) => {
  return await renderPreviewState(url, steps, timeMs, browserConfig);
});

ipcMain.handle('start-recording', async (event, { url, urlSlug, steps, durationSec, bgColor, bgImagePath, borderRadius, zoomPercent, camera, quality, browserConfig, placement, cursor, interaction, mockup, motion, render }) => {
  try {
    const outputPath = path.join(__dirname, '..', 'output', `${urlSlug}-${Date.now()}.mp4`);
    
    // We send an event back to renderer when progress updates
    const onProgress = (msg) => {
      // Check if this is a preview frame
      if (msg && msg.startsWith('__preview_frame__:')) {
        mainWindow.webContents.send('recording-preview-frame', msg.slice('__preview_frame__:'.length));
        return;
      }
      mainWindow.webContents.send('recording-progress', msg);
    };

    await startRecording(url, steps, durationSec, bgColor, bgImagePath, borderRadius, zoomPercent, camera, quality, browserConfig, placement, cursor, interaction, mockup, motion, render, outputPath, onProgress);
    
    return { success: true, outputPath };
  } catch (err) {
    console.error('Recording error:', err);
    return { success: false, error: err.message || String(err) };
  }
});
