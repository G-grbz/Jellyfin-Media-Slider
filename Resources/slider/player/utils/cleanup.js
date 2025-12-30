const __cleanups = new WeakMap();

function makeCleanupBag(owner) {
  const prev = __cleanups.get(owner);
  if (prev && typeof prev.run === 'function') {
    try { prev.run(); } catch {}
  }

  const bagArray = [];
  const bag = {
    add(fn) { if (typeof fn === 'function') bagArray.push(fn); },
    run() {
      while (bagArray.length) {
        const fn = bagArray.pop();
        try { fn(); } catch {}
      }
    }
  };
  __cleanups.set(owner, bag);
  return bag;
}

function addEvent(bag, target, type, handler, opts) {
  target.addEventListener(type, handler, opts);
  bag.add(() => target.removeEventListener(type, handler, opts));
}

function trackTimeout(bag, id) {
  bag.add(() => clearTimeout(id));
}
function trackInterval(bag, id) {
  bag.add(() => clearInterval(id));
}

function trackObserver(bag, obs, unobserveAll = null) {
  bag.add(() => {
    try { if (typeof unobserveAll === 'function') unobserveAll(); } catch {}
    try { obs.disconnect?.(); } catch {}
  });
}

function trackRaf(bag, rafId) {
  bag.add(() => cancelAnimationFrame(rafId));
}

export {
  makeCleanupBag,
  addEvent,
  trackTimeout,
  trackInterval,
  trackObserver,
  trackRaf
};
