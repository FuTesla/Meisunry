// Set up preferences data
let preferencesData;
window.electronAPI.onPreferenceUpdate(() => {
  ipcRend.invoke('loadAppData').then(data => { preferencesData = data; applyAppBackground(data.backgroundColor); });
});
function updatePreferencesData(callback) {
  ipcRend.invoke('loadAppData').then(data => { preferencesData = data; applyAppBackground(data.backgroundColor); callback(); });
}
updatePreferencesData(setupImagesInGrid);


window.electronAPI.onRefreshGrid(() => {
  ipcRend.invoke('readFilesFromDisk', preferencesData.folderLocation)
    .then(files => resetGallery(files))
    .catch(error => console.error('Error refreshing image folder:', error));
});

window.electronAPI.onSortUpdate(() => {
  updatePreferencesData(() => resetGallery(allFiles));
});

window.electronAPI.onFileDeleted((event, deletedFilePath) => {
  /* Fix file path */
  deletedFilePath = deletedFilePath.replace(/\//g, '\\');
  /* Update image count on topbar */
  updateHeaderCounter();
  // Rm from grid
  /* Play image deletion animation and remove it from grid */
  removeFromGrid(deletedFilePath)
})

function removeFromGrid(deletedFilePath, dontRefreshGrid)
{
  /* Reduce files list */
  allFiles = allFiles.filter(file => file.fullPath !== deletedFilePath);
  pendingFiles = pendingFiles.filter(file => file.fullPath !== deletedFilePath);
  updateHeaderCounter();
  let deletedFile = document.getElementById(deletedFilePath);
  if (!deletedFile) {
    updateGalleryFooter();
    return;
  }
  if (deletedFile.tagName === "SOURCE") deletedFile = deletedFile.parentNode
  deletedFile.classList.add(`hide`);

  new Promise((resolve) => setTimeout(() => { 
    const item = deletedFile.closest('.grid-item');
    if (!item || item.parentNode !== imageGrid) return;
    item.cancelled = true;
    if (item.cancelMediaLoad) item.cancelMediaLoad();
    imageGrid.removeChild(item);
    if (!dontRefreshGrid) refreshGridLayout();
    updateGalleryFooter();
  }, 500));
}

window.electronAPI.onFileAdded((event, newFile) => {
  if (allFiles.some(file => file.fullPath === newFile.fullPath)) return;
  resetGallery([...allFiles, newFile]);
});

window.addEventListener('resize', function(event) {
  updateGridAndSpacing();
  if (is_an_image_focused()) resetPanZoom(focusImg.naturalWidth, focusImg.naturalHeight);
  // Trigger Masonry Layout's layout after changing the CSS property
  if (grid) grid.layout();
}, true);
