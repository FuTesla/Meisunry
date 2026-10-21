let folderLibraryBusy = false;
let folderReadVersion = 0;
let revealedFolderPath = '';
function closeFolderActions() {
  revealedFolderPath = '';
  for (const row of document.querySelectorAll('.folder-row')) {
    row.classList.remove('is-revealed');
    row.querySelector('.folder-list-item').setAttribute('aria-expanded', 'false');
    const remove = row.querySelector('.folder-delete'); remove.tabIndex = -1; remove.disabled = true;
  }
}
function revealFolderActions(row, folderPath) {
  const alreadyOpen = revealedFolderPath === folderPath;
  closeFolderActions();
  if (alreadyOpen || folderLibraryBusy) return;
  revealedFolderPath = folderPath;
  row.classList.add('is-revealed');
  row.querySelector('.folder-list-item').setAttribute('aria-expanded', 'true');
  const remove = row.querySelector('.folder-delete'); remove.tabIndex = 0; remove.disabled = false;
}


function renderFolderLibrary() {
  const list = document.getElementById('photo-folder-list');
  const paths = [...new Set([...(preferencesData.folderPaths || []), preferencesData.folderLocation].filter(Boolean))];
  list.replaceChildren();
  for (const folderPath of paths) {
    const row = document.createElement('div'); row.className = 'folder-row';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'folder-delete';
    remove.setAttribute('aria-label', '从列表移除文件夹 ' + folderPath);
    remove.title = '从列表移除，保留原始文件'; remove.tabIndex = -1; remove.disabled = true;
    remove.append(GalleryIcons.create('Trash2'), document.createTextNode('删除'));
    remove.addEventListener('click', () => removeFolderFromLibrary(folderPath));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-list-item';
    button.dataset.path = folderPath;
    button.title = folderPath + '（右键显示删除）';
    button.setAttribute('aria-expanded', 'false');
    button.disabled = folderLibraryBusy || !grid;
    if (folderPath === preferencesData.folderLocation) button.setAttribute('aria-current', 'location');
    const name = document.createElement('span');
    name.className = 'folder-list-name';
    name.textContent = folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folderPath;
    const location = document.createElement('span');
    location.className = 'folder-list-path';
    location.textContent = folderPath;
    const content = document.createElement('span'); content.className = 'folder-list-content'; content.append(name, location);
    button.append(GalleryIcons.create('Folder'), content);
    button.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); revealFolderActions(row, folderPath); });
    button.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); revealFolderActions(row, folderPath); }
    });
    button.addEventListener('click', () => {
      if (revealedFolderPath) { closeFolderActions(); return; }
      if (folderPath !== preferencesData.folderLocation) changeFolder('select-photo-folder', folderPath);
    });
    row.append(remove, button);
    list.appendChild(row);
    if (revealedFolderPath === folderPath && !folderLibraryBusy) { row.classList.add('is-revealed'); button.setAttribute('aria-expanded', 'true'); remove.disabled = false; remove.tabIndex = 0; }
  }
  document.getElementById('add-photo-folder').disabled = folderLibraryBusy || !grid;
}

async function changeFolder(channel, folderPath) {
  if (folderLibraryBusy) return;
  closeFolderActions();
  folderLibraryBusy = true;
  const version = ++folderReadVersion;
  const status = document.getElementById('folder-library-status');
  status.textContent = '';
  renderFolderLibrary();
  try {
    const data = await ipcRend.invoke(channel, folderPath);
    if (!data) return;
    hideFocusImg();
    const files = await ipcRend.invoke('readFilesFromDisk', data.folderLocation);
    if (version !== folderReadVersion) return;
    preferencesData = data;
    applyAppBackground(data.backgroundColor);
    await resetGallery(files);
  } catch {
    status.textContent = '无法打开文件夹，请检查路径和访问权限。';
  } finally {
    folderLibraryBusy = false;
    renderFolderLibrary();
  }
}

document.getElementById('add-photo-folder').addEventListener('click', () => changeFolder('add-photo-folders'));

async function removeFolderFromLibrary(folderPath) {
  if (folderLibraryBusy) return;
  closeFolderActions(); folderLibraryBusy = true;
  const version = ++folderReadVersion;
  const status = document.getElementById('folder-library-status'); status.textContent = '正在移除…';
  renderFolderLibrary();
  let removed = false;
  try {
    const previousLocation = preferencesData.folderLocation;
    const data = await ipcRend.invoke('remove-photo-folder', folderPath);
    preferencesData = data;
    removed = true;
    if (previousLocation !== data.folderLocation) {
      hideFocusImg();
      const files = data.folderLocation ? await ipcRend.invoke('readFilesFromDisk', data.folderLocation) : [];
      if (version !== folderReadVersion) return;
      await resetGallery(files);
    }
    status.textContent = '已从列表移除，原始文件已保留。';
  } catch {
    if (removed) await resetGallery([]);
    status.textContent = '无法移除或读取文件夹，请重试。';
  } finally {
    folderLibraryBusy = false; renderFolderLibrary();
    document.getElementById('add-photo-folder').focus({ preventScroll: true });
  }
}
document.addEventListener('pointerdown', event => { if (!event.target.closest('.folder-row.is-revealed')) closeFolderActions(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeFolderActions(); });
