import { getConfig } from './config.js';

const __animTimers = new WeakMap();
const __animRafs   = new WeakMap();
const __globalTimers = new Set();
const __globalRafs   = new Set();

function trackTimer(el, id) {
  if (!el || !id) return;
  let arr = __animTimers.get(el);
  if (!arr) { arr = []; __animTimers.set(el, arr); }
  arr.push(id);
  __globalTimers.add(id);
}

function trackRaf(el, id) {
  if (!id) return;
  if (el) {
    let arr = __animRafs.get(el);
    if (!arr) { arr = []; __animRafs.set(el, arr); }
    arr.push(id);
  }
  __globalRafs.add(id);
}

function raf(el, cb) {
  const id = requestAnimationFrame(cb);
  trackRaf(el, id);
  return id;
}

function clearTimers(el) {
  const arr = __animTimers.get(el);
  if (arr) {
    for (const id of arr) { clearTimeout(id); __globalTimers.delete(id); }
    __animTimers.delete(el);
  }
  const rfs = __animRafs.get(el);
  if (rfs) {
    for (const id of rfs) { cancelAnimationFrame(id); __globalRafs.delete(id); }
    __animRafs.delete(el);
  }
  if (el.__glowSub) { stopLoop(el.__glowSub); el.__glowSub = null; }
}

export function teardownAnimations() {
  for (const id of __globalTimers) { clearTimeout(id); }
  __globalTimers.clear();
  for (const id of __globalRafs) { cancelAnimationFrame(id); }
  __globalRafs.clear();
  try { __io?.disconnect?.(); } catch {}
  __io = null;
  try { __mo?.disconnect?.(); } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', teardownAnimations, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) teardownAnimations();
  });
}

const __removedSentinel = new WeakSet();
const __mo = new MutationObserver((muts) => {
  for (const m of muts) {
    m.removedNodes && m.removedNodes.forEach(node => {
      if (node.nodeType === 1) cleanupTree(node);
    });
  }
});
__mo.observe(document.documentElement, { childList: true, subtree: true });

function cleanupTree(root) {
  if (root.nodeType !== 1) return;
  if (!__removedSentinel.has(root)) {
    __removedSentinel.add(root);
    clearTimers(root);
  }
  const it = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = it.nextNode())) {
    if (!__removedSentinel.has(n)) {
      __removedSentinel.add(n);
      clearTimers(n);
    }
  }
}

const animationStyles = `
  #slides-container {
    perspective: 1000px;
  }
  .slide {
    transform-style: preserve-3d;
    backface-visibility: hidden;
  }
  .poster-dot {
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  .poster-dot img {
    transition: filter 0.3s ease, transform 0.3s ease;
    display: block; width: 100%; height: 100%; object-fit: cover;
  }
`;
const existingStyle = document.getElementById('slide-animation-styles');
if (existingStyle) existingStyle.remove();
const styleElement = document.createElement('style');
styleElement.id = 'slide-animation-styles';
styleElement.innerHTML = animationStyles;
document.head.appendChild(styleElement);

function setWillChange(el, props) {
  if (!el) return;
  el.style.willChange = props.join(', ');
}

function clearWillChange(el) {
  if (el) el.style.willChange = '';
}

function withTransition(
  el,
  duration,
  easing = 'cubic-bezier(0.33,1,0.68,1)',
  props = ['transform','opacity','filter','clip-path','border-radius']
) {
  const trs = props.map(p => `${p} ${duration}ms ${easing}`).join(', ');
  el.style.transition = trs;
  setWillChange(el, props);
}
function setStyles(el, styles) { for (const k in styles) el.style[k] = styles[k]; }
function jsPropToCssProp(p) { return p.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`); }

function onTransitionEndOnce(el, timeoutMs, cb) {
  let done = false;
  const off = () => {
    if (done) return;
    done = true;
    el.removeEventListener('transitionend', handler);
    if (tid) { clearTimeout(tid); __globalTimers.delete(tid); }
    clearWillChange(el);
    cb && cb();
  };
  const handler = (e) => { if (e.target === el) off(); };
  el.addEventListener('transitionend', handler, { once: true });
  const tid = setTimeout(off, Math.max(16, (timeoutMs|0) + 60));
  __globalTimers.add(tid);
  trackTimer(el, tid);
  return off;
}

function animateStep(el, styles, duration, easing) {
  const props = Object.keys(styles).map(jsPropToCssProp);
  withTransition(el, duration, easing, props);
  raf(el, () => setStyles(el, styles));
  return new Promise(res => onTransitionEndOnce(el, duration, res));
}
async function animateSequence(el, steps, easing = 'cubic-bezier(0.33,1,0.68,1)') {
  for (const { styles, duration } of steps) {
    await animateStep(el, styles, duration, easing);
  }
}

const __rafSubscribers = new Set();
const GLOW_STRONG = "0 0 20px rgba(255,255,255,0.9)";
const GLOW_WEAK   = "0 0 5px rgba(255,255,255,0.5)";
let __rafId = null;
let __io = null;

function ensureIO() {
  if (__io) return;
  __io = new IntersectionObserver((entries) => {
    for (const ent of entries) {
      for (const sub of __rafSubscribers) {
        if (sub.el === ent.target) {
          sub.__paused = !ent.isIntersecting;
        }
      }
    }
  }, { root: null, threshold: 0 });
}
function __rafPump(ts) {
  for (const s of __rafSubscribers) {
    if (!document.body.contains(s.el)) { __rafSubscribers.delete(s); continue; }
    if (s.last == null) s.last = ts;
    if (ts - s.last >= s.period) {
      s.last = ts;
      if (!s.__paused) s.tick();
    }
  }
  if (__rafSubscribers.size) {
    __rafId = requestAnimationFrame(__rafPump);
    __globalRafs.add(__rafId);
  } else {
    if (__rafId) { cancelAnimationFrame(__rafId); __globalRafs.delete(__rafId); }
    __rafId = null;
  }
}
function startLoop(el, periodMs, tick) {
  const sub = { el, period: Math.max(60, periodMs|0), last: null, tick, __paused: false };
  __rafSubscribers.add(sub);
  ensureIO();
  try { __io.observe(el); } catch {}
  if (!__rafId) {
    __rafId = requestAnimationFrame(__rafPump);
    __globalRafs.add(__rafId);
  }
  return sub;
}

function stopLoop(sub) {
  if (!sub) return;
  try { __io?.unobserve?.(sub.el); } catch {}
  sub.tick = null;
  sub.el = null;
  __rafSubscribers.delete(sub);
}

export function applySlideAnimation(currentSlide, newSlide, direction) {
  if (!currentSlide || !newSlide) return;
  clearTimers(currentSlide);
  clearTimers(newSlide);

  const config = getConfig();
  if (!config.enableSlideAnimations) {
    newSlide.style.display = "block";
    newSlide.style.opacity = "1";
    if (currentSlide && currentSlide !== newSlide) {
      currentSlide.style.display = "none";
      currentSlide.style.opacity = "0";
    }
    return;
  }

  const duration = config.slideAnimationDuration || 500;
  const easing = 'cubic-bezier(0.33,1,0.68,1)';
  const type = config.slideTransitionType || 'fade';
  const same = currentSlide === newSlide;
  newSlide.style.display = "block";
  newSlide.style.zIndex = "2";
  withTransition(newSlide, duration, easing);
  if (!same) {
    withTransition(currentSlide, duration, easing);
    currentSlide.style.zIndex = "1";
  }

  const cleanupStyles = () => {
    if (currentSlide) {
      currentSlide.style.transition = "";
      currentSlide.style.transform = "";
      currentSlide.style.opacity = "0";
      currentSlide.style.filter = "";
      currentSlide.style.clipPath = "";
      currentSlide.style.borderRadius = "";
      currentSlide.style.zIndex = "";
      currentSlide.style.display = "none";
      currentSlide.style.backfaceVisibility = "";
      clearWillChange(currentSlide);
    }
    if (newSlide) {
      newSlide.style.transition = "";
      newSlide.style.transform = "";
      newSlide.style.opacity = "1";
      newSlide.style.filter = "";
      newSlide.style.clipPath = "";
      newSlide.style.borderRadius = "";
      newSlide.style.zIndex = "";
      newSlide.style.backfaceVisibility = "";
      clearWillChange(newSlide);
    }
  };

  if (same) {
    newSlide.style.opacity = "0";
    raf(newSlide, () => { newSlide.style.opacity = "1"; });
    onTransitionEndOnce(newSlide, duration, () => {
      newSlide.style.transition = "";
      newSlide.style.opacity = "1";
    });
    return;
  }

  switch (type) {
    case 'fade': {
      currentSlide.style.opacity = "0";
      newSlide.style.opacity = "0";
      raf(newSlide, () => { newSlide.style.opacity = "1"; });
      break;
    }

    case 'slideTop': {
      currentSlide.style.transform = "translateY(0)";
      currentSlide.style.opacity = "1";
      newSlide.style.transform = "translateY(-100%)";
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "translateY(0)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'slideBottom': {
      currentSlide.style.transform = "translateY(0)";
      currentSlide.style.opacity = "1";
      newSlide.style.transform = "translateY(100%)";
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "translateY(0)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'rotateIn': {
      currentSlide.style.transform = "rotate(0deg) scale(1)";
      currentSlide.style.opacity = "1";
      newSlide.style.transform = "rotate(-180deg) scale(0)";
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "rotate(0deg) scale(1)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'flipInX': {
      currentSlide.style.transform = "perspective(400px) rotateX(0deg)";
      currentSlide.style.opacity = "1";
      newSlide.style.transform = "perspective(400px) rotateX(90deg)";
      newSlide.style.opacity = "0";
      newSlide.style.backfaceVisibility = "hidden";
      raf(newSlide, () => {
        newSlide.style.transform = "perspective(400px) rotateX(0deg)";
        newSlide.style.opacity = "1";
        newSlide.style.backfaceVisibility = "visible";
      });
      break;
    }

    case 'flipInY': {
      currentSlide.style.transform = "perspective(400px) rotateY(0deg)";
      currentSlide.style.opacity = "1";
      newSlide.style.transform = "perspective(400px) rotateY(90deg)";
      newSlide.style.opacity = "0";
      newSlide.style.backfaceVisibility = "hidden";
      raf(newSlide, () => {
        newSlide.style.transform = "perspective(400px) rotateY(0deg)";
        newSlide.style.opacity = "1";
        newSlide.style.backfaceVisibility = "visible";
      });
      break;
    }

    case 'jelly': {
      const seg = (config.slideAnimationDuration && config.slideAnimationDuration > 0) ? duration : 600;
      const s = Math.max(40, Math.round(seg / 5));
      newSlide.style.transform = "scale(1,1)";
      animateSequence(newSlide, [
        { styles: { transform: 'scale(0.9, 1.1)' }, duration: s },
        { styles: { transform: 'scale(1.1, 0.9)' }, duration: s },
        { styles: { transform: 'scale(0.95, 1.05)' }, duration: s },
        { styles: { transform: 'scale(1, 1)' }, duration: s },
      ]);
      break;
    }

    case 'flip': {
      currentSlide.style.transform = `rotateY(${direction > 0 ? -180 : 180}deg)`;
      currentSlide.style.opacity = "0";
      newSlide.style.transform = `rotateY(${direction > 0 ? 180 : -180}deg)`;
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "rotateY(0deg)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'eye': {
      const seg = 600;
      animateSequence(newSlide, [
        { styles: { transform: 'scale(1) rotate(0deg)' }, duration: 1 },
        { styles: { transform: 'scale(1.1) rotate(-3deg)' }, duration: seg/2 },
        { styles: { transform: 'scale(1) rotate(0deg)' }, duration: seg/2 },
      ]);
      break;
    }

    case 'glitch': {
      currentSlide.style.filter = "blur(10px)";
      currentSlide.style.opacity = "0";
      newSlide.style.filter = "blur(10px)";
      newSlide.style.opacity = "0";
      newSlide.style.clipPath = "polygon(0 0,100% 0,100% 100%,0 100%)";
      let frames = 8;
      const jitter = () => Math.floor(Math.random() * 100);
      const step = () => {
        if (!newSlide || frames-- <= 0) {
          newSlide.style.filter = "blur(0)";
          newSlide.style.opacity = "1";
          newSlide.style.clipPath = "polygon(0 0,100% 0,100% 100%,0 100%)";
          return;
        }
        newSlide.style.clipPath = `polygon(0 ${jitter()}%,100% ${jitter()}%,100% ${jitter()}%,0 ${jitter()}%)`;
        requestAnimationFrame(step);
      };
      raf(newSlide, step);
      break;
    }

    case 'morph': {
      currentSlide.style.borderRadius = "50%";
      currentSlide.style.transform = "scale(0.1) rotate(180deg)";
      currentSlide.style.opacity = "0";
      newSlide.style.borderRadius = "50%";
      newSlide.style.transform = "scale(0.1) rotate(-180deg)";
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.borderRadius = "0";
        newSlide.style.transform = "scale(1) rotate(0deg)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'cube': {
      currentSlide.style.transform = `translateZ(-200px) rotateY(${direction > 0 ? -90 : 90}deg)`;
      currentSlide.style.opacity = "0";
      newSlide.style.transform = `translateZ(-200px) rotateY(${direction > 0 ? 90 : -90}deg)`;
      newSlide.style.opacity = "0";
      newSlide.style.backfaceVisibility = "hidden";
      raf(newSlide, () => {
        newSlide.style.transform = "translateZ(0) rotateY(0deg)";
        newSlide.style.opacity = "1";
        newSlide.style.backfaceVisibility = "visible";
      });
      break;
    }

    case 'zoom': {
      currentSlide.style.transform = "scale(1.5)";
      currentSlide.style.opacity = "0";
      newSlide.style.transform = "scale(0.5)";
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "scale(1)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'slide3d': {
      currentSlide.style.transform = `translateX(${direction > 0 ? -100 : 100}%) translateZ(-100px) rotateY(30deg)`;
      currentSlide.style.opacity = "0";
      newSlide.style.transform = `translateX(${direction > 0 ? 100 : -100}%) translateZ(-100px) rotateY(-30deg)`;
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "translateX(0) translateZ(0) rotateY(0deg)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'slide': {
      currentSlide.style.transform = `translateX(${direction > 0 ? '-100%' : '100%'})`;
      currentSlide.style.opacity = '0';
      newSlide.style.transform = `translateX(${direction > 0 ? '100%' : '-100%'})`;
      newSlide.style.opacity = '1';
      raf(newSlide, () => { newSlide.style.transform = 'translateX(0)'; });
      break;
    }

    case 'diagonal': {
      currentSlide.style.transform = `translate(${direction > 0 ? "-100%" : "100%"}, -100%)`;
      currentSlide.style.opacity = "0";
      newSlide.style.transform = `translate(${direction > 0 ? "100%" : "-100%"}, 100%)`;
      newSlide.style.opacity = "0";
      raf(newSlide, () => {
        newSlide.style.transform = "translate(0, 0)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'fadezoom': {
      currentSlide.style.opacity = "1";
      currentSlide.style.transform = "scale(1)";
      newSlide.style.opacity = "0";
      newSlide.style.transform = "scale(1.5)";
      raf(newSlide, () => {
        newSlide.style.opacity = "1";
        newSlide.style.transform = "scale(1)";
      });
      break;
    }

    case 'parallax': {
      const slideDuration = duration || 700;
      const ez = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
      currentSlide.style.transition = `transform ${slideDuration}ms ${ez}, opacity ${slideDuration}ms ease`;
      newSlide.style.transition = `transform ${slideDuration}ms ${ez}, opacity ${slideDuration}ms ease`;
      currentSlide.style.transform = `translateX(${direction > 0 ? '-30%' : '30%'})`;
      currentSlide.style.opacity = "0";
      newSlide.style.transform = `translateX(${direction > 0 ? '50%' : '-50%'})`;
      newSlide.style.opacity = "0.5";
      newSlide.style.zIndex = "5";
      void newSlide.offsetWidth;
      raf(newSlide, () => {
        newSlide.style.transform = "translateX(0)";
        newSlide.style.opacity = "1";
      });
      break;
    }

    case 'blur-fade': {
      currentSlide.style.filter = 'blur(5px)';
      currentSlide.style.opacity = '0';
      newSlide.style.filter = 'blur(5px)';
      newSlide.style.opacity = '0';
      raf(newSlide, () => {
        newSlide.style.filter = 'blur(0)';
        newSlide.style.opacity = '1';
      });
      break;
    }

    default: {
      if (newSlide) newSlide.style.opacity = "1";
    }
  }

  onTransitionEndOnce(newSlide, duration, cleanupStyles);
}

export function applyDotPosterAnimation(dot, isActive) {
  const config = getConfig();
  if (!config.enableDotPosterAnimations || !config.dotPosterMode) {
    if (dot.__glowSub) { stopLoop(dot.__glowSub); dot.__glowSub = null; }
    clearTimers(dot);
    return;
  }
  clearTimers(dot);

  const duration = Math.max(1, config.dotPosterAnimationDuration || 600);
  const transitionType = config.dotPosterTransitionType;
  dot.style.transition = `all ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
  dot.style.zIndex = isActive ? "10" : "";
  dot.style.boxShadow = "";
  const image = dot.querySelector('img');
  setWillChange(dot, ['transform','opacity']);
  if (image) setWillChange(image, ['filter','transform']);

  switch (transitionType) {
    case 'scale': {
      dot.style.transform = isActive ? "scale(1.1)" : "scale(1)";
      if (isActive) dot.style.boxShadow = "0 0 20px rgba(255, 255, 255, 0.5)";
      break;
    }

    case 'bounce': {
      if (isActive) {
        const up = Math.min(20, Math.max(8, Math.round(duration * 0.06)));
        animateSequence(dot, [
          { styles: { transform: `translateY(-${up}px)` }, duration: Math.floor(duration * 0.5) },
          { styles: { transform: "translateY(0)" }, duration: Math.ceil(duration * 0.5) },
        ], 'ease');
        dot.style.boxShadow = "0 0 15px rgba(255,255,255,0.7)";
      } else {
        dot.style.transform = "translateY(0)";
      }
      break;
    }

    case 'rotate': {
      dot.style.transform = isActive ? "rotate(5deg)" : "rotate(0deg)";
      break;
    }

    case 'color': {
      if (image) {
        image.style.transition = `filter ${duration}ms ease, transform ${duration}ms ease`;
        image.style.filter = isActive ? "brightness(1.2) saturate(1.5)" : "brightness(1) saturate(1)";
      }
      break;
    }

    case 'float': {
      dot.style.transform = isActive ? "translateY(-10px)" : "translateY(0)";
      break;
    }

    case 'pulse': {
      if (isActive) {
        animateSequence(dot, [
          { styles: { transform: 'scale(1.15)' }, duration: Math.floor(duration * 0.5) },
          { styles: { transform: 'scale(1)' }, duration: Math.ceil(duration * 0.5) },
        ]);
      } else {
        dot.style.transform = 'scale(1)';
      }
      break;
    }

    case 'tilt': {
      if (isActive) {
        animateSequence(dot, [
          { styles: { transform: 'rotate(-5deg)' }, duration: Math.floor(duration * 0.5) },
          { styles: { transform: 'rotate(0deg)' }, duration: Math.ceil(duration * 0.5) },
        ]);
      } else {
        dot.style.transform = 'rotate(0deg)';
      }
      break;
    }

    case 'shake': {
      if (isActive) {
        const a = (px) => ({ styles: { transform: `translateX(${px}px)` }, duration: Math.floor(duration/5) });
        animateSequence(dot, [ a(0), a(-4), a(4), a(-2), a(0) ], 'ease');
        dot.style.boxShadow = "0 0 5px rgba(255, 255, 255, 0.4)";
      } else {
        dot.style.transform = 'translateX(0)';
      }
      break;
    }

    case 'glow': {
      if (isActive) {
        if (!dot.__glowSub) {
          const initBright = dot.dataset._bright === '1' ? 1 : 0;
          dot.dataset._bright = String(initBright);
          dot.style.boxShadow = initBright ? GLOW_STRONG : GLOW_WEAK;
          const sub = startLoop(dot, Math.max(300, duration), () => {
            const cur = dot.dataset._bright === '1' ? 1 : 0;
            const next = cur ^ 1;
            if (next !== cur) {
              dot.dataset._bright = String(next);
              dot.style.boxShadow = next ? GLOW_STRONG : GLOW_WEAK;
            }
         });
          dot.__glowSub = sub;
        }
      } else {
        dot.style.boxShadow = GLOW_WEAK;
        if (dot.__glowSub) { stopLoop(dot.__glowSub); dot.__glowSub = null; }
      }
      break;
    }

    case 'rubberBand': {
      if (isActive) {
        const part = Math.max(60, Math.floor(duration/4));
        animateSequence(dot, [
          { styles: { transform: 'scale(1.25, 0.75)' }, duration: part },
          { styles: { transform: 'scale(0.75, 1.25)' }, duration: part },
          { styles: { transform: 'scale(1.15, 0.85)' }, duration: part },
          { styles: { transform: 'scale(1, 1)' }, duration: part },
        ]);
      } else {
        dot.style.transform = 'scale(1,1)';
      }
      break;
    }

    case 'swing': {
      if (isActive) {
        const part = Math.max(60, Math.floor(duration/5));
        animateSequence(dot, [
          { styles: { transform: 'rotate(15deg)' }, duration: part },
          { styles: { transform: 'rotate(-10deg)' }, duration: part },
          { styles: { transform: 'rotate(5deg)' }, duration: part },
          { styles: { transform: 'rotate(-5deg)' }, duration: part },
          { styles: { transform: 'rotate(0deg)' }, duration: part },
        ]);
      } else {
        dot.style.transform = 'rotate(0deg)';
      }
      break;
    }

    case 'flip': {
      if (isActive) {
        animateSequence(dot, [
          { styles: { transform: 'rotateY(180deg)' }, duration: Math.floor(duration * 0.5) },
          { styles: { transform: 'rotateY(360deg)' }, duration: Math.ceil(duration * 0.5) },
        ]);
      } else {
        dot.style.transform = 'rotateY(0deg)';
      }
      break;
    }

    case 'flash': {
      if (isActive) {
        animateSequence(dot, [
          { styles: { opacity: '0.3' }, duration: Math.floor(duration * 0.25) },
          { styles: { opacity: '1' }, duration: Math.floor(duration * 0.25) },
          { styles: { opacity: '0.3' }, duration: Math.floor(duration * 0.25) },
          { styles: { opacity: '1' }, duration: Math.ceil(duration * 0.25) },
        ]);
      } else {
        dot.style.opacity = '1';
      }
      break;
    }

    case 'wobble': {
      if (isActive) {
        const part = Math.max(50, Math.floor(duration/6));
        animateSequence(dot, [
          { styles: { transform: 'translateX(-25%) rotate(-5deg)' }, duration: part },
          { styles: { transform: 'translateX(20%) rotate(3deg)' }, duration: part },
          { styles: { transform: 'translateX(-15%) rotate(-3deg)' }, duration: part },
          { styles: { transform: 'translateX(10%) rotate(2deg)' }, duration: part },
          { styles: { transform: 'translateX(-5%) rotate(-1deg)' }, duration: part },
          { styles: { transform: 'translateX(0) rotate(0deg)' }, duration: part },
        ]);
      } else {
        dot.style.transform = 'translateX(0) rotate(0deg)';
      }
      break;
    }

    default: {
    }
  }
  onTransitionEndOnce(dot, duration, () => {
    clearWillChange(dot);
    if (image) clearWillChange(image);
  });
}

export {
  styleElement,
  animationStyles,
  existingStyle
};
