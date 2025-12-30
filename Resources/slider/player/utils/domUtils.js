import { makeCleanupBag, addEvent } from "./cleanup.js";

export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function setupMobileTouchControls() {
  const controls = document.querySelector('.player-controls');
  if (!controls) return;
  const bag = makeCleanupBag(controls);

  let startX, scrollLeft;
  let isDragging = false;

  const onTouchStart = (e) => {
    isDragging = true;
    const rect = controls.getBoundingClientRect();
    startX = e.touches[0].clientX - rect.left;
    scrollLeft = controls.scrollLeft;
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const rect = controls.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const walk = (x - startX) * 2;
    controls.scrollLeft = scrollLeft - walk;
  };

  const onTouchEnd = () => {
    isDragging = false;
  };

  addEvent(bag, controls, 'touchstart', onTouchStart, { passive: false });
  addEvent(bag, controls, 'touchmove',  onTouchMove,  { passive: false });
  addEvent(bag, controls, 'touchend',   onTouchEnd);

  const onMouseDown = (e) => {
    isDragging = true;
    const rect = controls.getBoundingClientRect();
    startX = e.clientX - rect.left;
    scrollLeft = controls.scrollLeft;
    controls.classList.add('dragging');
  };
  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const rect = controls.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const walk = (x - startX) * 2;
    controls.scrollLeft = scrollLeft - walk;
  };
  const onMouseUp = () => {
    isDragging = false;
    controls.classList.remove('dragging');
  };

  addEvent(bag, controls, 'mousedown', onMouseDown);
  addEvent(bag, window,   'mousemove', onMouseMove);
  addEvent(bag, window,   'mouseup',   onMouseUp);
}
