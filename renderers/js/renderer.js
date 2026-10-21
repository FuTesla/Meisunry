// Bound decoding work so large folders do not decode every full-size photo at once.
const mediaLoadQueue = [];
let activeMediaLoads = 0;
function queueMediaLoad(start) {
  mediaLoadQueue.push(start);
  pumpMediaLoads();
}
function pumpMediaLoads() {
  while (activeMediaLoads < 4 && mediaLoadQueue.length) {
    activeMediaLoads++;
    const start = mediaLoadQueue.shift();
    start(() => {
      activeMediaLoads--;
      pumpMediaLoads();
    });
  }
}

function updateFolderSidebar() {
  renderFolderLibrary();
}

function createImage(file) {
  updateHeaderCounter();

  // Only generate a new element and append it if it doesn't already exist
  const existingEl = document.getElementById(`${file.fullPath}`);
  if (existingEl != null) return;

  // Create div element
  const gridItem = document.createElement('div');
  gridItem.className = 'grid-item';
  const card = document.createElement('div');
  card.className = 'grid-card is-loading';
  card.setAttribute('aria-busy', 'true');
  card.style.width = `${calc_width()}px`;
  card.style.transform = `scale(${currentPadding})`;
  gridItem.appendChild(card);

  let imgElement;
  const imgPath = file.fullPath;
  const mediaUrl = window.electronAPI.fileUrl(imgPath);
  //console.log(file.isImage);
  if (file.isImage === true)
  {
    // Create img element
    imgElement = document.createElement('img');
    //imgElement.loading = "lazy";
    imgElement.id = imgPath;
    imgElement.className = "grid-image";

    // Add full screen click event
    imgElement.addEventListener('click', () => {
      if (focusImgVideoWrapper.classList.contains('show')) 
      {
        focusImgVideoWrapper.classList.remove('show');
        return;
      }
      openFocusedImage(imgElement, mediaUrl, imgPath);
    });
  }
  else
  {
    imgElement = document.createElement('video');
    imgElement.autoplay = true;
    imgElement.muted = true;
    imgElement.loop = true;
    imgElement.className = "grid-image";
    const sourceElement = document.createElement(`source`);
    sourceElement.id = imgPath;
    imgElement.appendChild(sourceElement);
    const audioA = document.createElement('button');
    audioA.type = 'button';
    audioA.setAttribute('aria-label', '取消静音');
    audioA.setAttribute('aria-pressed', 'false');
    audioA.appendChild(GalleryIcons.create('VolumeX'));
    audioA.classList.add(`audio-button`);
    audioA.classList.add(`overlay-circle-button`);
    card.appendChild(audioA);
    
    // Mute function
    audioA.addEventListener('click', () => {
      if (focusImgVideoWrapper.classList.contains('show')) return;
      imgElement.muted = !imgElement.muted;
      audioA.replaceChildren(GalleryIcons.create(imgElement.muted ? 'VolumeX' : 'Volume2'));
      audioA.setAttribute('aria-label', imgElement.muted ? '取消静音' : '静音');
      audioA.setAttribute('aria-pressed', String(!imgElement.muted));
    });

    // Add full screen click event
    imgElement.addEventListener('click', () => {
      if (focusImgVideoWrapper.classList.contains('show')) 
      {
        focusImgVideoWrapper.classList.remove('show');
        return;
      }
      openFocusedVideo(imgElement, mediaUrl, imgPath);
    });
  }

  // Nest within div
  card.appendChild(imgElement);

  // Keep partially downloaded images hidden until decoding has finished.
  gridItem.mediaReady = new Promise(resolve => queueMediaLoad(release => {
    if (gridItem.cancelled) {
      resolve();
      release();
      return;
    }
    let settled = false;
    const finish = (failed = false) => {
      if (settled) return;
      settled = true;
      card.classList.remove('is-loading');
      card.setAttribute('aria-busy', 'false');
      if (failed) {
        card.classList.add('load-error');
        const message = document.createElement('span');
        message.className = 'media-load-error';
        message.textContent = '加载失败';
        card.appendChild(message);
      }
      if (grid && !gridItem.cancelled) grid.layout();
      resolve();
      release();
    };
    gridItem.cancelMediaLoad = () => {
      imgElement.removeAttribute('src');
      if (!file.isImage) {
        imgElement.pause();
        imgElement.querySelector('source').removeAttribute('src');
        imgElement.load();
      }
      finish();
    };
    imgElement.addEventListener('error', () => finish(true), { once: true });
    if (file.isImage) {
      imgElement.addEventListener('load', async () => {
        try {
          await imgElement.decode();
          finish();
        } catch {
          // Animated images and usable images may reject decode(); load plus
          // valid natural dimensions still means the browser can display them.
          finish(!(imgElement.complete && imgElement.naturalWidth > 0));
        }
      }, { once: true });
      window.electronAPI.getImageThumbnail(imgPath).then(thumbnailUrl => {
        if (!gridItem.cancelled) imgElement.src = thumbnailUrl;
      }).catch(() => finish(true));
    } else {
      imgElement.addEventListener('loadeddata', () => finish(), { once: true });
      const source = imgElement.querySelector('source');
      source.addEventListener('error', () => finish(true), { once: true });
      source.src = mediaUrl;
      imgElement.load();
    }
  }));

  // Add to grid
  imageGrid.appendChild(gridItem);

  return gridItem;
}

// Only create media elements for the current page; the remaining list is metadata.
const IMAGE_BATCH_SIZE = 20;
let pendingFiles = [];
let batchInProgress = false;
let currentBatchPromise = null;
let galleryVersion = 0;
let loadCallStack = 0;
let lastGalleryScrollTop = 0;

function updateGalleryFooter() {
  if (!allFiles || !grid) return;
  const count = imageGrid.querySelectorAll('.grid-item').length;
  const status = document.getElementById('gallery-status');
  const button = document.getElementById('load-more-images');
  status.textContent = batchInProgress
    ? '正在加载下一批…'
    : count + ' / ' + allFiles.length + ' 项' + (pendingFiles.length ? ' · 滑到底部继续加载' : ' · 已全部加载');
  button.hidden = pendingFiles.length === 0;
  button.disabled = batchInProgress;
  button.textContent = batchInProgress ? '加载中…' : '加载下 ' + Math.min(IMAGE_BATCH_SIZE, pendingFiles.length) + ' 项';
  // Masonry's CSS transform enlarges its visible height without changing flow.
  imageGrid.style.marginBottom = Math.max(0, imageGrid.getBoundingClientRect().height - imageGrid.offsetHeight) + 48 + 'px';
  updateHeaderCounter();
}

function resetGallery(files) {
  if (typeof resetBoundaryScroll === 'function') resetBoundaryScroll();
  galleryVersion++;
  const items = [...imageGrid.querySelectorAll('.grid-item')];
  items.forEach(item => { item.cancelled = true; });
  items.forEach(item => { if (item.cancelMediaLoad) item.cancelMediaLoad(); });
  imageGrid.replaceChildren();
  grid.reloadItems();
  allFiles = resort([...files]);
  pendingFiles = [...allFiles];
  batchInProgress = false;
  currentBatchPromise = null;
  updateFolderSidebar();
  document.getElementById('header-folder-path').textContent = preferencesData.folderLocation;
  document.getElementById('folder-path').textContent = preferencesData.folderLocation || '';
  document.getElementById('no-items-message').textContent = preferencesData.folderLocation ? '此文件夹暂无可显示的照片：' : '还没有文件夹，点击左侧添加文件夹开始浏览。';
  document.getElementById('no-items-text').classList.toggle('show', allFiles.length === 0);
  window.scrollTo(0, 0);
  lastGalleryScrollTop = 0;
  updateGridAndSpacing();
  grid.layout();
  updateGalleryFooter();
  return loadNextBatch();
}

function loadNextBatch() {
  if (batchInProgress) return currentBatchPromise;
  if (!grid || !pendingFiles.length) return Promise.resolve();
  const version = galleryVersion;
  const batch = pendingFiles.splice(0, IMAGE_BATCH_SIZE);
  batchInProgress = true;
  updateGalleryFooter();
  currentBatchPromise = loadImages(batch, version).finally(() => {
    if (version !== galleryVersion) return;
    batchInProgress = false;
    currentBatchPromise = null;
    updateGalleryFooter();
  });
  return currentBatchPromise;
}

async function setupImagesInGrid() {
  grid = new Masonry('.grid', { itemSelector: '.grid-item', gutter: 0 });
  grid.on('layoutComplete', updateGalleryFooter);
  updateFolderSidebar();
  try {
    const files = await ipcRend.invoke('readFilesFromDisk', preferencesData.folderLocation);
    await resetGallery(files);
  } catch {
    await resetGallery([]);
    document.getElementById('folder-library-status').textContent = '无法读取当前文件夹，请重新选择或添加文件夹。';
  }
}

async function loadImages(files, version) {
  loadCallStack++;
  updateLoadingIcon();
  const items = [];
  try {
    for (const file of files) {
      if (version !== galleryVersion) break;
      const item = createImage(file);
      if (!item) continue;
      items.push(item);
      if (preferencesData.loadSpeed === 'slow') {
        grid.appended(item);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (version !== galleryVersion) return;
    if (preferencesData.loadSpeed !== 'slow') grid.appended(items);
    updateGridAndSpacing();
    grid.layout();
    await Promise.all(items.map(item => item.mediaReady));
    if (version !== galleryVersion) return;
    items.forEach(item => item.querySelector('.grid-image').classList.add('shown'));
    grid.layout();
  } finally {
    loadCallStack--;
    updateLoadingIcon();
  }
}

function loadMoreAtBottom() {
  if (!grid || batchInProgress || !pendingFiles.length || focusImgVideoWrapper.classList.contains('show')) return;
  const scroller = document.scrollingElement;
  if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 32) loadNextBatch();
}

window.addEventListener('scroll', () => {
  const top = document.scrollingElement.scrollTop;
  const movingDown = top > lastGalleryScrollTop;
  lastGalleryScrollTop = top;
  if (movingDown) loadMoreAtBottom();
}, { passive: true });
gridWrapper.addEventListener('wheel', event => {
  if (event.deltaY > 0 && !event.ctrlKey && !event.shiftKey) loadMoreAtBottom();
}, { passive: true });
document.getElementById('load-more-images').addEventListener('click', loadNextBatch);

function is_an_image_focused() {
  return focusImg.classList.contains('show');
}

