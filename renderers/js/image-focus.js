let focusAnimation;
let focusOpeningId = 0;
let focusedGridVideo = null;
let focusReturnElement = null;
let previousBodyOverflow = '';
let focusFitTimer;
let resettingFocusZoom = false;
let focusedMetadata = null;
const detailDialog = document.getElementById('photo-detail-dialog');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewSlot = document.getElementById('photo-preview-slot');
const metadataPanel = document.getElementById('photo-metadata');

function cancelFocusAnimation() {
  if (focusAnimation) { focusAnimation.cancel(); focusAnimation = null; }
}
function getFocusFit(width, height) {
  const scale = Math.min(photoPreview.clientWidth / width, photoPreview.clientHeight / height);
  return { scale, x: (photoPreview.clientWidth - width * scale) / 2, y: (photoPreview.clientHeight - height * scale) / 2 };
}
function fitPhotoPreview(width, height) {
  if (!width || !height) return;
  const maxWidth = Math.min(focusImgVideoWrapper.clientWidth * .94, 6000);
  const maxHeight = Math.min(focusImgVideoWrapper.clientHeight * .94, 4000);
  const metadataWidth = Math.min(maxWidth * .52, Math.max(1040, Math.min(1760, maxWidth * .38)));
  const scale = Math.min((maxWidth - metadataWidth) / width, maxHeight / height);
  const previewWidth = width * scale, previewHeight = height * scale;
  detailDialog.style.width = previewWidth + metadataWidth + 'px';
  detailDialog.style.height = previewHeight + 'px';
  detailDialog.style.setProperty('--preview-width', previewWidth + 'px');
  detailDialog.style.setProperty('--metadata-width', metadataWidth + 'px');
  photoPreview.style.width = previewWidth + 'px';
  photoPreview.style.height = previewHeight + 'px';
}
window.addEventListener('resize', () => {
  if (!focusImgVideoWrapper.classList.contains('show')) return;
  if (focusImg.classList.contains('show') && !photoPreview.classList.contains('is-loading') && !photoPreview.classList.contains('preview-error')) {
    fitPhotoPreview(focusImg.naturalWidth, focusImg.naturalHeight);
    resetPanZoom(focusImg.naturalWidth, focusImg.naturalHeight);
  } else if (focusVideo.videoWidth) fitPhotoPreview(focusVideo.videoWidth, focusVideo.videoHeight);
});
focusVideo.addEventListener('loadedmetadata', () => {
  if (focusImgVideoWrapper.classList.contains('show') && focusVideo.style.display !== 'none') fitPhotoPreview(focusVideo.videoWidth, focusVideo.videoHeight);
});
function setGalleryInert(value) {
  for (const id of ['imageGrid', 'gallery-pagination', 'folder-sidebar', 'header']) document.getElementById(id).inert = value || (id === 'folder-sidebar' && document.body.classList.contains('sidebar-hidden'));
}
function openDetailShell(filePath) {
  if (typeof resetBoundaryScroll === 'function') resetBoundaryScroll();
  focusedMetadata = null;
  detailDialog.removeAttribute('style');
  photoPreview.style.width = '';
  photoPreview.style.height = '';
  clearTimeout(focusFitTimer);
  const openingId = ++focusOpeningId;
  cancelFocusAnimation();
  panZoomInstance.dispose();
  focusReturnElement = document.activeElement;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  focusImgVideoWrapper.classList.add('show');
  focusImgVideoWrapper.setAttribute('aria-hidden', 'false');
  setGalleryInert(true);
  detailDialog.focus({ preventScroll: true });
  const loading = document.createElement('p');
  loading.textContent = '正在读取源数据…';
  metadataPanel.replaceChildren(loading);
  ipcRend.invoke('read-media-metadata', filePath).then(data => {
    if (openingId === focusOpeningId) renderMediaMetadata(data);
  }).catch(() => {
    if (openingId !== focusOpeningId) return;
    const message = document.createElement('p');
    message.textContent = '无法读取文件信息，请检查原文件是否仍然存在。';
    metadataPanel.replaceChildren(message);
  });
  return openingId;
}

async function openFocusedImage(thumbnail, mediaUrl, filePath = thumbnail.id) {
  const origin = thumbnail.getBoundingClientRect();
  const openingId = openDetailShell(filePath);
  focusedGridVideo = null;
  focusVideo.style.display = 'none';
  focusImg.style.display = 'block';
  zoomPanHolder.style.visibility = 'hidden';
  photoPreview.classList.add('is-loading');
  focusImg.src = mediaUrl;
  focusImg.classList.add('show');
  try { await focusImg.decode(); }
  catch {
    if (!focusImg.naturalWidth) {
      if (openingId === focusOpeningId) { photoPreview.classList.remove('is-loading'); photoPreview.classList.add('preview-error'); }
      return;
    }
  }
  if (openingId !== focusOpeningId) return;
  photoPreview.classList.remove('is-loading', 'preview-error');
  zoomPanHolder.style.visibility = 'visible';
  const width = focusImg.naturalWidth, height = focusImg.naturalHeight;
  fitPhotoPreview(width, height);
  zoomPanHolder.style.width = width + 'px';
  zoomPanHolder.style.height = height + 'px';
  zoomPanHolder.style.transform = 'none';
  zoomPanHolder.style.transformOrigin = '0 0';
  panZoomInstance = panzoom(zoomPanHolder);
  resetPanZoom(width, height);
  enableAutomaticPhotoFit();
  const fit = getFocusFit(width, height), frame = photoPreview.getBoundingClientRect();
  focusAnimation = zoomPanHolder.animate([
    { transform: `translate(${origin.left - frame.left}px, ${origin.top - frame.top}px) scale(${origin.width / width}, ${origin.height / height})` },
    { transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }
  ], { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  focusAnimation.onfinish = () => { focusAnimation = null; };
  if (focusedMetadata) renderMediaMetadata(focusedMetadata);
}
function openFocusedVideo(thumbnail, mediaUrl, filePath) {
  openDetailShell(filePath);
  focusedGridVideo = thumbnail;
  focusImg.classList.remove('show');
  focusImg.style.display = 'none';
  zoomPanHolder.style.visibility = 'hidden';
  photoPreview.classList.remove('is-loading', 'preview-error');
  focusVideo.style.display = 'block';
  focusVideo.querySelector('source').src = mediaUrl;
  focusVideo.load();
  focusVideo.currentTime = thumbnail.currentTime;
  focusVideo.muted = thumbnail.muted;
  thumbnail.pause();
}
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const unit = bytes < 1024 * 1024 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
  const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return (bytes / divisor).toFixed(2) + ' ' + unit;
}
function metadataCard(title, rows) {
  const card = document.createElement('section'); card.className = 'metadata-card';
  const heading = document.createElement('h3'); heading.textContent = title;
  const list = document.createElement('dl');
  for (const [label, value] of rows) {
    const field = document.createElement('div'); field.className = 'metadata-field';
    if (['文件名', '镜头', '相机型号', '拍摄时间', '创建时间', '修改时间', '软件', '版权', '像素尺寸', '记录状态'].includes(label)) field.classList.add('metadata-field-wide');
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd'); description.textContent = String(value);
    if (label === '像素尺寸') description.dataset.dimensions = '';
    field.append(term, description);
    list.appendChild(field);
  }
  card.append(heading, list); return card;
}
function formatMetadataDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}
function renderMediaMetadata(data) {
  focusedMetadata = data;
  const exif = data.exif || {};
  const groups = [
    ['相机与镜头', [['Make', '相机品牌'], ['Model', '相机型号'], ['LensModel', '镜头']]],
    ['曝光与焦距', [['ExposureTime', '快门'], ['FNumber', '光圈'], ['ISO', 'ISO'], ['FocalLength', '焦距'], ['FocalLengthIn35mmFormat', '等效焦距']]],
    ['时间记录', [['DateTimeOriginal', '拍摄时间']]],
    ['拍摄位置', [['latitude', '纬度'], ['longitude', '经度']]],
    ['色彩与来源', [['ColorSpace', '色彩空间'], ['Software', '软件'], ['Artist', '作者'], ['Copyright', '版权']]]
  ];
  const cards = [];
  for (const [title, fields] of groups) {
    const rows = [];
    for (const [key, label] of fields) {
      let value = key === 'ISO' ? (exif.ISO ?? exif.ISOSpeedRatings) : exif[key];
      if (value === undefined || value === null || value === '') continue;
      if (key === 'ExposureTime' && typeof value === 'number' && value > 0) value = value < 1 ? '1/' + Math.round(1 / value) + ' 秒' : value + ' 秒';
      if (key === 'FNumber') value = 'f/' + value;
      if (key.startsWith('FocalLength')) value += ' mm';
      if (key === 'DateTimeOriginal') value = formatMetadataDate(value);
      rows.push([label, value]);
    }
    if (title === '时间记录') {
      if (data.createdAt) rows.push(['创建时间', formatMetadataDate(data.createdAt)]);
      if (data.modifiedAt) rows.push(['修改时间', formatMetadataDate(data.modifiedAt)]);
    }
    if (rows.length) cards.push(metadataCard(title, rows));
  }
  const fileRows = [['文件名', data.name], ['文件格式', data.format || '未知'], ['文件大小', formatFileSize(data.size)]];
  if (focusImg.classList.contains('show')) {
    const ready = !photoPreview.classList.contains('is-loading') && !photoPreview.classList.contains('preview-error') && focusImg.naturalWidth > 0;
    fileRows.push(['像素尺寸', ready ? `${focusImg.naturalWidth} × ${focusImg.naturalHeight} 像素` : '暂未读取']);
  }
  const content = [metadataCard('文件概览', fileRows), ...cards];
  if (!Object.keys(exif).length) content.push(metadataCard('拍摄信息', [['记录状态', data.exifStatus === 'unreadable' ? '拍摄信息暂时无法读取' : '此文件未提供可读取的拍摄信息']]));
  const scrollTop = metadataPanel.scrollTop;
  metadataPanel.replaceChildren(...content);
  metadataPanel.scrollTop = scrollTop;
}
function resetPanZoom(width, height) {
  if (!width || !height) return;
  clearTimeout(focusFitTimer);
  cancelFocusAnimation();
  const fit = getFocusFit(width, height);
  resettingFocusZoom = true;
  panZoomInstance.zoomAbs(0, 0, fit.scale);
  panZoomInstance.moveTo(fit.x, fit.y);
  resettingFocusZoom = false;
}
function animatePhotoFit() {
  if (!focusImgVideoWrapper.classList.contains('show') || !focusImg.classList.contains('show') || !focusImg.naturalWidth) return;
  const from = { ...panZoomInstance.getTransform() };
  const fit = getFocusFit(focusImg.naturalWidth, focusImg.naturalHeight);
  resetPanZoom(focusImg.naturalWidth, focusImg.naturalHeight);
  focusAnimation = zoomPanHolder.animate([
    { transform: `translate(${from.x}px, ${from.y}px) scale(${from.scale})` },
    { transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }
  ], { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240, easing: 'ease-out' });
  focusAnimation.onfinish = () => { focusAnimation = null; };
}
function enableAutomaticPhotoFit() {
  let previousScale = panZoomInstance.getTransform().scale;
  panZoomInstance.on('zoom', instance => {
    const scale = instance.getTransform().scale;
    const shrinking = scale < previousScale - 0.000001;
    previousScale = scale;
    if (resettingFocusZoom) return;
    clearTimeout(focusFitTimer);
    if (shrinking) focusFitTimer = setTimeout(animatePhotoFit, 180);
  });
}
function hideFocusImg() {
  if (!focusImgVideoWrapper.classList.contains('show')) return;
  focusOpeningId++;
  clearTimeout(focusFitTimer);
  cancelFocusAnimation(); panZoomInstance.dispose();
  if (focusedGridVideo && focusedGridVideo.isConnected) {
    focusedGridVideo.currentTime = focusVideo.currentTime;
    focusedGridVideo.muted = focusVideo.muted;
    focusedGridVideo.play().catch(() => {});
  }
  focusedGridVideo = null;
  focusVideo.pause(); focusVideo.querySelector('source').removeAttribute('src'); focusVideo.load();
  focusImg.removeAttribute('src'); focusImg.classList.remove('show');
  photoPreview.classList.remove('is-loading', 'preview-error');
  focusImgVideoWrapper.classList.remove('show');
  focusImgVideoWrapper.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = previousBodyOverflow;
  setGalleryInert(false);
  if (focusReturnElement && focusReturnElement.isConnected) focusReturnElement.focus({ preventScroll: true });
}
let backdropPointerDown = false;
focusImgVideoWrapper.addEventListener('pointerdown', event => { backdropPointerDown = event.target === focusImgVideoWrapper; });
focusImgVideoWrapper.addEventListener('click', event => {
  if (event.target === focusImgVideoWrapper && backdropPointerDown) hideFocusImg();
  backdropPointerDown = false;
});
focusImgVideoWrapper.addEventListener('wheel', event => { cancelFocusAnimation(); event.stopPropagation(); }, { passive: true });
photoPreview.addEventListener('pointerdown', cancelFocusAnimation);
document.addEventListener('keydown', event => {
  if (!focusImgVideoWrapper.classList.contains('show')) return;
  if (event.key === 'Escape') { event.preventDefault(); hideFocusImg(); }
  if (event.key === 'Tab') {
    const buttons = [...detailDialog.querySelectorAll('button,video[controls]')].filter(button => button.getClientRects().length && !button.classList.contains('hide'));
    if (!buttons.length) { event.preventDefault(); detailDialog.focus({ preventScroll: true }); return; }
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === detailDialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === detailDialog)) { event.preventDefault(); first.focus(); }
  }
});
window.electronAPI.onHideFocusImg(hideFocusImg);
