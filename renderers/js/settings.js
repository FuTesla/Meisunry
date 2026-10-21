const settingsStatus = document.getElementById('settings-status');
const presetContainer = document.getElementById('theme-presets');
let backgroundSaveQueue = Promise.resolve();
let backgroundChangeId = 0;

for (const preset of GalleryTheme.presets) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-preset';
  button.dataset.color = preset.color;
  button.disabled = true;
  button.setAttribute('aria-pressed', 'false');
  button.style.setProperty('--preset-color', preset.color);
  const swatch = document.createElement('span');
  swatch.className = 'theme-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  const palette = GalleryTheme.getPalette(preset.color);
  for (const tone of [palette.surface, palette.hover, palette.accent]) {
    const chip = document.createElement('i'); chip.style.setProperty('--swatch-tone', tone); swatch.appendChild(chip);
  }
  const label = document.createElement('span'); label.className = 'theme-preset-label';
  const check = GalleryIcons.create('Check', 'theme-preset-check');
  label.append(document.createTextNode(preset.name), check);
  button.append(swatch, label);
  button.addEventListener('click', () => saveBackgroundColor(preset.color));
  presetContainer.appendChild(button);
}

function applyAppBackground(value) {
  const palette = GalleryTheme.getPalette(value);
  const variables = {
    '--app-background': palette.background,
    '--app-text': palette.text,
    '--app-surface': palette.surface,
    '--app-hover': palette.hover,
    '--app-muted': palette.muted,
    '--app-accent': palette.accent,
    '--sidebar-background': palette.sidebar,
    '--focus-background': palette.focus,
    '--control-background': palette.controls
  };
  for (const [name, color] of Object.entries(variables)) document.documentElement.style.setProperty(name, color);
  for (const button of presetContainer.querySelectorAll('button')) {
    button.disabled = false;
    button.setAttribute('aria-pressed', String(button.dataset.color === palette.background));
  }
  document.getElementById('reset-background-color').disabled = false;
}

function saveBackgroundColor(color) {
  const changeId = ++backgroundChangeId;
  applyAppBackground(color);
  settingsStatus.textContent = '正在保存…';
  backgroundSaveQueue = backgroundSaveQueue.then(async () => {
    try {
      const saved = await ipcRend.invoke('set-background-color', color);
      preferencesData.backgroundColor = saved;
      if (changeId === backgroundChangeId) settingsStatus.textContent = '已保存';
    } catch {
      if (changeId === backgroundChangeId) {
        applyAppBackground(preferencesData.backgroundColor);
        settingsStatus.textContent = '保存失败，请重试';
      }
    }
  });
}

document.getElementById('reset-background-color').addEventListener('click', () => saveBackgroundColor('#000000'));

const settingsOverlay = document.getElementById('settings-overlay');
const settingsDialog = document.getElementById('settings-dialog');
const storageStatus = document.getElementById('storage-status');
const clearCacheButton = document.getElementById('clear-thumbnail-cache');
const settingsTabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
let settingsReturnFocus;
let settingsPreviousOverflow = '';
let cacheBusy = false;
let cacheReadVersion = 0;
const settingsBackgroundElements = ['header', 'folder-sidebar', 'grid-wrapper'].map(id => document.getElementById(id));
let settingsPreviousInert = [];

function openSettings() {
  if (typeof resetBoundaryScroll === 'function') resetBoundaryScroll();
  if (settingsOverlay.classList.contains('show')) return;
  hideFocusImg();
  settingsReturnFocus = document.activeElement;
  settingsPreviousOverflow = document.body.style.overflow;
  settingsPreviousInert = settingsBackgroundElements.map(element => element.inert);
  settingsBackgroundElements.forEach(element => { element.inert = true; });
  document.body.style.overflow = 'hidden';
  settingsOverlay.classList.add('show');
  settingsOverlay.setAttribute('aria-hidden', 'false');
  settingsDialog.focus({ preventScroll: true });
  if (settingsTabs[1].getAttribute('aria-selected') === 'true') refreshCacheSummary();
}
function closeSettings() {
  if (!settingsOverlay.classList.contains('show')) return;
  settingsOverlay.classList.remove('show');
  settingsOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = settingsPreviousOverflow;
  settingsBackgroundElements.forEach((element, index) => { element.inert = element.id === 'folder-sidebar' ? document.body.classList.contains('sidebar-hidden') : settingsPreviousInert[index]; });
  if (settingsReturnFocus?.isConnected) settingsReturnFocus.focus({ preventScroll: true });
}
function selectSettingsTab(tab) {
  for (const item of settingsTabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (tab.id === 'storage-tab') refreshCacheSummary();
}
function showCacheSummary(summary) {
  document.getElementById('cache-size').textContent = formatFileSize(summary.bytes);
  document.getElementById('cache-count').textContent = summary.count.toLocaleString('zh-CN') + ' 张';
}
async function refreshCacheSummary() {
  if (cacheBusy) return;
  const version = ++cacheReadVersion;
  clearCacheButton.disabled = true;
  storageStatus.textContent = '';
  try {
    const summary = await ipcRend.invoke('get-thumbnail-cache-info');
    if (version === cacheReadVersion) { showCacheSummary(summary); clearCacheButton.disabled = false; }
  } catch {
    if (version === cacheReadVersion) {
      document.getElementById('cache-size').textContent = '暂时无法读取';
      document.getElementById('cache-count').textContent = '—';
      storageStatus.textContent = '无法读取缓存信息，可以尝试清理。';
      clearCacheButton.disabled = false;
    }
  }
}
clearCacheButton.addEventListener('click', async () => {
  if (cacheBusy) return;
  cacheBusy = true;
  ++cacheReadVersion;
  clearCacheButton.disabled = true;
  clearCacheButton.replaceChildren(GalleryIcons.create('LoaderCircle', 'icon-spin'), document.createTextNode('正在删除…'));
  storageStatus.textContent = '正在清理缩略图缓存…';
  try {
    const result = await ipcRend.invoke('clear-thumbnail-cache');
    showCacheSummary(result.remaining);
    storageStatus.textContent = '已删除 ' + result.deletedCount + ' 张缩略图，释放 ' + formatFileSize(result.deletedBytes) + '。';
  } catch {
    storageStatus.textContent = '部分缓存未能删除，请重试。';
    try { showCacheSummary(await ipcRend.invoke('get-thumbnail-cache-info')); } catch {}
  } finally {
    cacheBusy = false;
    clearCacheButton.disabled = false;
    clearCacheButton.replaceChildren(GalleryIcons.create('Trash2'), document.createTextNode('删除缩略图缓存'));
  }
});
document.getElementById('sidebar-settings').addEventListener('click', openSettings);
document.getElementById('close-settings').addEventListener('click', closeSettings);
for (const tab of settingsTabs) {
  tab.addEventListener('click', () => selectSettingsTab(tab));
  tab.addEventListener('keydown', event => {
    const index = settingsTabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % settingsTabs.length : event.key === 'ArrowUp' ? (index + settingsTabs.length - 1) % settingsTabs.length : null;
    if (next === null) return;
    event.preventDefault(); selectSettingsTab(settingsTabs[next]); settingsTabs[next].focus();
  });
}
let settingsBackdropDown = false;
settingsOverlay.addEventListener('pointerdown', event => { settingsBackdropDown = event.target === settingsOverlay; });
settingsOverlay.addEventListener('click', event => { if (event.target === settingsOverlay && settingsBackdropDown) closeSettings(); settingsBackdropDown = false; });
settingsOverlay.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
document.addEventListener('keydown', event => {
  if (!settingsOverlay.classList.contains('show')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeSettings(); }
  if (event.key !== 'Tab') return;
  const buttons = [...settingsDialog.querySelectorAll('button:not(:disabled)')].filter(button => button.getClientRects().length && button.tabIndex >= 0);
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === settingsDialog)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === settingsDialog)) { event.preventDefault(); first.focus(); }
});
