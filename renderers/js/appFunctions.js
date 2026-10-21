
function updateHeaderCounter() {
  /* Update image count on topbar */
  imgCountEl = document.getElementById(`header-image-count`);
  const loaded = imageGrid.querySelectorAll('.grid-item').length;
  imgCountEl.textContent = `已加载 ${loaded} / ${allFiles.length} 项`;
}

function refreshGridLayout() {
  grid.reloadItems();
  grid.layout();
}
