// One listener avoids applying Ctrl/Shift wheel shortcuts twice as events bubble.
gridWrapper.addEventListener('wheel', event => {
  processWheel(event);
  if (!event.ctrlKey && !event.shiftKey) processBoundaryWheel(event);
}, { passive: false });

function processWheel(event) {
  if (event.ctrlKey) {
    event.preventDefault();
  
    // Determine the direction of the scroll
    const zoomAmount = event.deltaY > 0 ? 0.75 : 1.25;
    currentZoom *= zoomAmount;
    currentZoom = Math.max(currentZoom, 0.1);
    updateGridAndSpacing();  
    // Trigger Masonry Layout's layout after changing the CSS property
    grid.layout();    
  }
  else if (event.shiftKey)
  {
    // Determine the direction of the scroll
    const paddingAmount = event.deltaY > 0 ? 0.1 : -0.1;
    currentPadding += paddingAmount;
    currentPadding = Math.max(Math.min(currentPadding, 1), 0.25);
    updateGridAndSpacing();
    // Trigger Masonry Layout's layout after changing the CSS property
    grid.layout();
  }
}
const boundaryHint = document.getElementById('scroll-boundary-hint');
const boundaryContent = [imageGrid, document.getElementById('gallery-pagination')];
let boundaryOffset = 0;
let boundaryEdge = '';
let boundaryReleaseTimer;
let boundaryHintTimer;
let boundaryAnimations = [];
function resetBoundaryScroll() {
  clearTimeout(boundaryReleaseTimer);
  clearTimeout(boundaryHintTimer);
  boundaryAnimations.forEach(animation => animation.cancel());
  boundaryAnimations = [];
  boundaryContent.forEach(element => { element.style.translate = ''; });
  boundaryOffset = 0;
  boundaryEdge = '';
  boundaryHint.classList.remove('show');
}
function processBoundaryWheel(event) {
  if (event.defaultPrevented || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (document.querySelector('#img-focus-wrapper.show, #settings-overlay.show') || document.body.style.overflow === 'hidden') return;
  const scroller = document.scrollingElement;
  const top = scroller.scrollTop <= 2;
  const bottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  const edge = top && event.deltaY < 0 ? 'top' : bottom && event.deltaY > 0 ? 'bottom' : '';
  // Reaching the last loaded batch is not the end of the folder.
  if (!edge || (edge === 'bottom' && (pendingFiles.length || batchInProgress))) {
    if (boundaryEdge) resetBoundaryScroll();
    return;
  }
  event.preventDefault();
  if (boundaryEdge !== edge) resetBoundaryScroll();
  boundaryAnimations.forEach(animation => animation.cancel());
  boundaryAnimations = [];
  clearTimeout(boundaryReleaseTimer);
  clearTimeout(boundaryHintTimer);
  boundaryEdge = edge;
  boundaryHint.dataset.edge = edge;
  const message = edge === 'top' ? '已到顶部，没有更多内容' : '已到底部，没有更多内容';
  if (boundaryHint.textContent !== message) boundaryHint.textContent = message;
  boundaryHint.classList.add('show');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion) {
    // Resist further movement as the pull approaches its limit (40 screen pixels at 25% zoom).
    const delta = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 64 : event.deltaMode === 2 ? scroller.clientHeight : 1);
    boundaryOffset = Math.min(160, boundaryOffset + Math.min(delta, 200) * .35 * (1 - boundaryOffset / 180));
    const offset = edge === 'top' ? boundaryOffset : -boundaryOffset;
    boundaryContent.forEach(element => { element.style.translate = `0 ${offset}px`; });
    boundaryReleaseTimer = setTimeout(() => {
      boundaryAnimations = boundaryContent.map(element => {
        element.style.translate = '';
        return element.animate([
          { translate: `0 ${offset}px` }, { translate: `0 ${-offset * .1}px`, offset: .65 }, { translate: '0 0' }
        ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      });
      boundaryOffset = 0;
    }, 140);
  }
  boundaryHintTimer = setTimeout(resetBoundaryScroll, 1100);
}
window.addEventListener('resize', resetBoundaryScroll);
window.addEventListener('blur', resetBoundaryScroll);
