const { app, BrowserWindow, ipcMain, globalShortcut, screen, nativeTheme, dialog, nativeImage } = require('electron');
const { getPalette } = require('../shared/theme');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { loadFolder, saveAppData, loadData, loadIndex, getFolderPaths, selectFolderPath, removeFolderPath } = require('./main-functions');
const { readMediaMetadata } = require('./media-metadata');
const { createThumbnailCache } = require('./thumbnail-cache');

global.preferencesData = loadData();

function getBackgroundColor() {
  return getPalette(global.preferencesData.backgroundColor).background;
}

function getTextColor(color) {
  return getPalette(color).text;
}

function refreshWindowMaterial(window) {
  window.setBackgroundColor('#00000000');
  if (process.platform === 'win32') window.setBackgroundMaterial('acrylic');
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const backgroundColor = getBackgroundColor();
  const mainWindow = new BrowserWindow({
    width: Math.min(1440, Math.floor(workArea.width * 0.92)),
    height: Math.min(960, Math.floor(workArea.height * 0.92)),
    center: true,
    icon: 'app-icons/logo.png',
    webPreferences: {
      nodeIntegration: true,
      audio: true,
      zoomFactor: 0.25,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: backgroundColor, symbolColor: getTextColor(backgroundColor), height: 48 },
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => refreshWindowMaterial(mainWindow));

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(.25);
    // Reapply after navigation so Chromium's page background cannot cover DWM.
    refreshWindowMaterial(mainWindow);
  });

  loadIndex(mainWindow);

  ipcMain.handle('add-photo-folders', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '添加照片文件夹', properties: ['openDirectory', 'multiSelections'],
      defaultPath: global.preferencesData.folderLocation
    });
    if (result.canceled || !result.filePaths.length) return null;
    return selectFolderPath(result.filePaths[0], result.filePaths);
  });
  ipcMain.handle('select-photo-folder', async (_event, folderPath) => {
    if (!getFolderPaths().includes(folderPath)) throw new Error('文件夹不在列表中');
    if (!(await fs.promises.stat(folderPath)).isDirectory()) throw new Error('文件夹不存在');
    return selectFolderPath(folderPath);
  });
  ipcMain.handle('read-media-metadata', (_event, filePath) => readMediaMetadata(filePath));
  ipcMain.handle('remove-photo-folder', (_event, folderPath) => removeFolderPath(folderPath));
  const thumbnailCache = createThumbnailCache(path.join(app.getPath('userData'), 'thumbnail-cache'));
  ipcMain.handle('get-thumbnail-cache-info', () => thumbnailCache.info());
  ipcMain.handle('clear-thumbnail-cache', () => thumbnailCache.clear());
  ipcMain.handle('get-image-thumbnail', (_event, filePath) => thumbnailCache.run(async () => {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) throw new Error('图片文件不存在');

    const cacheDir = path.join(app.getPath('userData'), 'thumbnail-cache');
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const normalizedPath = path.resolve(filePath);
    const cacheKey = crypto.createHash('sha1').update(process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath).digest('hex');
    const jpegSource = /\.(jpe?g|jfif)$/i.test(filePath);
    const thumbnailPath = path.join(cacheDir, cacheKey + (jpegSource ? '.jpg' : '.png'));
    const metadataPath = path.join(cacheDir, cacheKey + '.json');
    const sourceInfo = { size: stats.size, modifiedAt: stats.mtimeMs };

    try {
      const cachedInfo = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
      await fs.promises.access(thumbnailPath, fs.constants.R_OK);
      if (cachedInfo.size === sourceInfo.size && cachedInfo.modifiedAt === sourceInfo.modifiedAt) {
        return pathToFileURL(thumbnailPath).href;
      }
    } catch {}

    let thumbnail;
    if (process.platform === 'darwin' || process.platform === 'win32') {
      thumbnail = await nativeImage.createThumbnailFromPath(filePath, { width: 640, height: 640 });
    } else {
      thumbnail = nativeImage.createFromPath(filePath).resize({ width: 640, height: 640, quality: 'good' });
    }
    if (thumbnail.isEmpty()) throw new Error('无法生成图片缩略图');
    const temporaryImage = thumbnailPath + '.tmp';
    const temporaryMetadata = metadataPath + '.tmp';
    await fs.promises.writeFile(temporaryImage, jpegSource ? thumbnail.toJPEG(82) : thumbnail.toPNG());
    await fs.promises.writeFile(temporaryMetadata, JSON.stringify(sourceInfo));
    await fs.promises.rename(temporaryImage, thumbnailPath);
    await fs.promises.rename(temporaryMetadata, metadataPath);
    return pathToFileURL(thumbnailPath).href;
  }));

  ipcMain.handle('set-background-color', (_event, color) => {
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error('背景颜色格式无效');
    }
    const previous = global.preferencesData.backgroundColor;
    global.preferencesData.backgroundColor = color.toLowerCase();
    try {
      saveAppData();
    } catch (error) {
      global.preferencesData.backgroundColor = previous;
      throw error;
    }
    mainWindow.setTitleBarOverlay({ color, symbolColor: getTextColor(color), height: 48 });
    return global.preferencesData.backgroundColor;
  });
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('enter-full-screen'); 
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('leave-full-screen'); 
  });

  /* Handler for when folder is dropped */
  ipcMain.on('folderDropped', (event, folder) => {
    loadFolder(mainWindow, folder);
  });

  /* Handler for when image is dropped. Relocates file from one folder to another. */
  ipcMain.on('imageDropped', async (event, imagePath) => {
    if (!global.preferencesData.folderLocation) return;
    const destinationFilePath = path.join(global.preferencesData.folderLocation, path.basename(imagePath));

    if (fs.existsSync(destinationFilePath)) return;

    fs.rename(imagePath, destinationFilePath, async (err) => {
      if (!err) {
        console.log(`Moved file to ${destinationFilePath}`);
        try {
          const stats = await fs.promises.stat(destinationFilePath);
          const fileDate = stats.mtime; // Modification date of the file
          const newImageFile = { name: path.basename(destinationFilePath), date: fileDate, fullPath: destinationFilePath, isImage: isFileAnImage(destinationFilePath), };
          mainWindow.webContents.send('added-file', newImageFile); 
        } catch (error) {
          console.error(`Error reading file: ${filename}`);
        }
      } else {
        console.log(`Move file error ${err}`);
      }
    });
  });

  ipcMain.handle('getIsFullscreen', () => {
    return mainWindow.isFullScreen();
  });

  return mainWindow;
}

app.whenReady().then(() => {
  
  // The application entry script is not a user-selected photo folder.
  const launchPath = process.argv.slice(app.isPackaged ? 1 : 2).find(value => value && !value.startsWith('-'));
  if (launchPath) {
    try {
      const resolved = path.resolve(launchPath);
      const stat = fs.statSync(resolved);
      selectFolderPath(stat.isDirectory() ? resolved : path.dirname(resolved));
    } catch (error) {
      console.error('无法打开启动路径:', error.message);
    }
  }

  var browserWindow = createWindow();

  globalShortcut.register('Escape', () => {
    browserWindow.webContents.send('hide-focus-img');
  });


  ipcMain.handle('loadAppData', () => {
    return { ...loadData(), folderPaths: getFolderPaths() };
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('readFilesFromDisk', async (event, filePath) => {
  if (!filePath) return [];
  // Assuming fileList is an array of file names without dates
  const updatedFileList = [];
  try {

    await addFolderToList(filePath, 0);
    
    async function addFolderToList(targetFolderPath, depth) {
        // Add contents of current folder to final list
        files = await fs.promises.readdir(targetFolderPath);
        await pushFilteredFilesToList(files, targetFolderPath);
        // If our depth allows it, scan the current folder and recurse
        depth++;
        if (depth <= global.preferencesData.recursion)
        {
            // Find directories
            const folders = files.filter(item => {
                const itemPath = path.join(targetFolderPath, item);
                return fs.statSync(itemPath).isDirectory();
            });

            for (const index in folders) {
                var nestedFolder = path.join(targetFolderPath, folders[index]);
                console.log(nestedFolder);
                await addFolderToList(nestedFolder, depth);
            }
        }
    }

    // Push filtered file group to final list 
    async function pushFilteredFilesToList(targetFiles, targetFilePath) {
      targetFiles = targetFiles.filter(file => file.match(/\.(jpg|jpeg|png|gif|jfif|webp|mp4|webm|mkv|avi|mov|wmv|flv|mts)$/i));
      for (const filename of targetFiles) {
        const fullFilePath = path.join(targetFilePath, filename);
    
        try {
          const stats = await fs.promises.stat(fullFilePath);
          const fileDate = stats.mtime; // Modification date of the file
          isImage = isFileAnImage(filename);
          if ((isImage && !preferencesData.DisableImages) || (!isImage && !preferencesData.DisableVideos)) updatedFileList.push({ name: filename, date: fileDate, fullPath: fullFilePath, isImage: isImage });
        } catch (error) {
          console.error(`Error reading file: ${filename}`);
        }
      }
    }

    // Sorting the fileList array by date
    updatedFileList.sort((a, b) => b.date - a.date);
    return updatedFileList;
  } catch (error) {
    throw error;
  }
});

/* Close when window-all-closed */
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// When the app is about to quit, unregister all shortcuts
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function isFileAnImage(fileName) {
  const isImagePattern = /\.(jpg|jpeg|png|gif|jfif|webp)$/i;
  return isImagePattern.test(fileName);
}

const contextMenuJS = require('./context-menu');
