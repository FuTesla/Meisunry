// Constants
const ipcRend = window.ipcRenderer;
const imageGrid = document.getElementById('imageGrid');
const focusImg = document.getElementById('img-focus');
const focusVideo = document.getElementById('video-focus');
const focusImgVideoWrapper = document.getElementById('img-focus-wrapper');
const zoomPanHolder = document.getElementById('zoomPanHolder');
const gridWrapper = document.getElementById('grid-wrapper');
const loadIcon = document.getElementById(`load-icon`);

// Zoom and pan controls
let panZoomInstance = panzoom(zoomPanHolder);
panZoomInstance.dispose();

// Grid zoom / padding
currentZoom = 2.2;
currentPadding = .92;

let grid;
let allFiles;
