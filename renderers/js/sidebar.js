const gallerySidebar = document.getElementById('folder-sidebar');
function toggleGallerySidebar() {
  const hidden = document.body.classList.toggle('sidebar-hidden');
  if (typeof closeFolderActions === 'function') closeFolderActions();
  if (typeof resetBoundaryScroll === 'function') resetBoundaryScroll();
  gallerySidebar.setAttribute('aria-hidden', String(hidden));
  const modalOpen = Boolean(document.querySelector('#img-focus-wrapper.show, #settings-overlay.show'));
  if (hidden && gallerySidebar.contains(document.activeElement)) document.activeElement.blur();
  gallerySidebar.inert = hidden || modalOpen;
}
document.addEventListener('keydown', event => {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== 'KeyB') return;
  event.preventDefault();
  if (!event.repeat) toggleGallerySidebar();
});

// Recompute masonry columns during the slide, as well as on any other width change.
let sidebarLayoutFrame = 0;
let previousGalleryWidth = -1;
new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  if (Math.abs(width - previousGalleryWidth) < .5) return;
  previousGalleryWidth = width;
  cancelAnimationFrame(sidebarLayoutFrame);
  sidebarLayoutFrame = requestAnimationFrame(() => {
    if (!grid) return;
    updateGridAndSpacing();
    grid.layout();
  });
}).observe(gridWrapper);
