const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/* Save data to preferencesData */
function saveAppData() {
  const userDataPath = app.getPath('userData');
  const dataFilePath = path.join(userDataPath, 'appdata.json');
  const serializedData = JSON.stringify(global.preferencesData, null, 2);
  fs.writeFileSync(dataFilePath, serializedData);
}

/* Load preferencesData on disk */
function loadData() {
  const userDataPath = app.getPath('userData');
  const dataFilePath = path.join(userDataPath, 'appdata.json');

  try {
    const fileContents = fs.readFileSync(dataFilePath, 'utf-8');
    const loadedData = JSON.parse(fileContents);
    return loadedData;
  } catch (error) {
    /* Default json */
    const baseData = {
      folderLocation: "C:\\",
      sortMode: "date",
      recursion: 0,
      loadSpeed: 'medium',
      backgroundColor: '#000000',
      folderPaths: [],
    }
    const serializedData = JSON.stringify(baseData, null, 2);
    fs.writeFileSync(dataFilePath, serializedData);
    console.log(`${error}`);
    return baseData;
  }
}

/* Load a folder from a path, save to preferencesData on disk, and refresh browser window */
function loadFolder (browserWindow, selectedFolderPath) {
  console.log('Selected folder:', selectedFolderPath);
  selectFolderPath(selectedFolderPath);
  loadIndex(browserWindow);
}

function getFolderPaths() {
  const saved = Array.isArray(global.preferencesData.folderPaths) ? global.preferencesData.folderPaths : [];
  const paths = [...saved, global.preferencesData.folderLocation].filter(value => typeof value === 'string' && value.length);
  const seen = new Set();
  return paths.map(value => path.resolve(value)).filter(value => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectFolderPath(selected, added = [selected]) {
  const previous = global.preferencesData;
  global.preferencesData = { ...previous, folderPaths: [...getFolderPaths(), ...added], folderLocation: path.resolve(selected) };
  global.preferencesData.folderPaths = getFolderPaths();
  try { saveAppData(); }
  catch (error) { global.preferencesData = previous; throw error; }
  return { ...global.preferencesData, folderPaths: getFolderPaths() };
}

function removeFolderPath(selected) {
  if (typeof selected !== 'string' || !path.isAbsolute(selected)) throw new Error('文件夹路径无效');
  const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  const paths = getFolderPaths();
  const remaining = paths.filter(value => key(value) !== key(selected));
  if (remaining.length === paths.length) throw new Error('文件夹不在列表中');
  const previous = global.preferencesData;
  const removingCurrent = previous.folderLocation && key(previous.folderLocation) === key(selected);
  global.preferencesData = { ...previous, folderPaths: remaining, folderLocation: removingCurrent ? (remaining[0] || '') : previous.folderLocation };
  try { saveAppData(); }
  catch (error) { global.preferencesData = previous; throw error; }
  return { ...global.preferencesData, folderPaths: getFolderPaths() };
}

function truncateFilePathToNearestFolder(filePath) {
  const lastDotIndex = filePath.lastIndexOf('.');
  
  if (filePath === `./mains/main.js` || filePath.toLowerCase().includes("meisunry")) return global.preferencesData.folderLocation;
  
  if (lastDotIndex !== -1) {
    // If a dot (.) is found (indicating a file extension),
    // find the last directory separator (slash or backslash)
    const lastSeparatorIndex = filePath.lastIndexOf('/');
    if (lastSeparatorIndex === -1) {
      const lastBackslashIndex = filePath.lastIndexOf('\\');
      if (lastBackslashIndex !== -1) {
        return filePath.substring(0, lastBackslashIndex + 1);
      }
    } else {
      return filePath.substring(0, lastSeparatorIndex + 1);
    }
  }
  
  // If no file extension or directory separators are found, return the original path
  return filePath;
}

function loadIndex(browserWindow) {
  const parentDir = path.join(__dirname, '..');
  browserWindow.loadURL(`file://${parentDir}/renderers/index.html`);
}

function refreshGrid (browserWindow) {
  browserWindow.webContents.send('refresh-grid-update'); 
}
module.exports = { saveAppData, truncateFilePathToNearestFolder, loadFolder, loadData, loadIndex, refreshGrid, getFolderPaths, selectFolderPath, removeFolderPath };
