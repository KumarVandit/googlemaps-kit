import { armCues, playCue } from '/js/cues.js';
import { bindVideoPlayer, freezeRail } from '/js/media-rail.js';

const HUD = `
  <div class="video-hud">
    <button type="button" class="video-toggle" data-state="playing" data-sound="off" aria-label="Pause video">
      <svg class="ico-pause" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
      <svg class="ico-play" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
      </svg>
    </button>
    <svg class="video-ring" viewBox="0 0 32 32" aria-hidden="true">
      <circle class="video-ring-track" cx="16" cy="16" r="14" />
      <circle class="video-ring-prog" cx="16" cy="16" r="14" />
    </svg>
  </div>
`;

function mediaItems(scope) {
  return Array.from(scope.querySelectorAll('img, video')).filter((el) => !el.closest('a') && !el.closest('.examine'));
}

function readItem(el) {
  if (el instanceof HTMLImageElement) {
    const src = el.currentSrc || el.src;
    return src ? { kind: 'image', src, alt: el.alt, el } : null;
  }
  if (el instanceof HTMLVideoElement) {
    const src = el.dataset.videoSrc || el.currentSrc || el.src;
    if (!src) return null;
    const ratio = el.videoWidth && el.videoHeight
      ? el.videoWidth / el.videoHeight
      : el.clientWidth && el.clientHeight
        ? el.clientWidth / el.clientHeight
        : 16 / 9;
    return { kind: 'video', src, alt: el.getAttribute('aria-label') || '', ratio, el };
  }
  return null;
}

function zone(clientX, count) {
  if (count <= 1) return 'close';
  const t = clientX / window.innerWidth - 0.5;
  if (Math.abs(t) < 0.08) return 'close';
  return t < 0 ? 'prev' : 'next';
}

function flipFrom(el, origin) {
  const dest = el.getBoundingClientRect();
  if (!dest.width || !dest.height || !origin.width || !origin.height) return;
  const dx = origin.left + origin.width / 2 - (dest.left + dest.width / 2);
  const dy = origin.top + origin.height / 2 - (dest.top + dest.height / 2);
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${origin.width / dest.width}, ${origin.height / dest.height})` },
      { transform: 'none' },
    ],
    { duration: 750, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
}

export function bindExamine() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'examine';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Examine');
  root.innerHTML = `
    <div class="examine-stage">
      <div class="examine-frame" data-video-player>
        <video class="video-el examine-video" muted loop playsinline autoplay></video>
        ${HUD}
      </div>
    </div>
    <button type="button" class="examine-close" data-sound="off" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
    <button type="button" class="examine-nav examine-prev" data-sound="off" aria-label="Previous">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <button type="button" class="examine-nav examine-next" data-sound="off" aria-label="Next">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
    <div class="examine-hint" hidden><span>Close</span></div>
    <div class="examine-dots" hidden></div>
  `;
  document.body.append(root);

  const frame = root.querySelector('.examine-frame');
  const video = root.querySelector('.examine-video');
  const closeBtn = root.querySelector('.examine-close');
  const prevBtn = root.querySelector('.examine-prev');
  const nextBtn = root.querySelector('.examine-next');
  const hint = root.querySelector('.examine-hint');
  const hintText = hint?.querySelector('span');
  const dots = root.querySelector('.examine-dots');
  if (!(video instanceof HTMLVideoElement) || !frame || !closeBtn || !prevBtn || !nextBtn || !hint || !hintText || !dots) return;

  bindVideoPlayer(frame, { reduced, observe: false });

  /** @type {HTMLElement | null} */
  let scope = null;
  let index = 0;
  let count = 0;
  let action = 'close';
  let overChrome = false;
  let hintOn = false;
  let origin = null;

  const label = (name) => (name === 'prev' ? 'Previous' : name === 'next' ? 'Next' : 'Close');

  const paintHint = () => {
    hint.hidden = !(hintOn && !overChrome);
    hintText.textContent = label(action);
  };

  const show = (nextIndex, from, originRect = null) => {
    const items = mediaItems(from);
    const node = items[nextIndex];
    const item = node ? readItem(node) : null;
    if (!item || item.kind !== 'video') return;
    scope = from;
    index = nextIndex;
    count = items.length;
    origin = originRect;
    const ratio = item.ratio || 16 / 9;
    frame.style.aspectRatio = String(ratio);
    frame.style.width = `min(var(--examine-cap), calc(72vh * ${ratio}))`;
    if (video.src !== item.src) video.src = item.src;
    video.play().catch(() => {});
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    freezeRail(true);
    prevBtn.hidden = count <= 1;
    nextBtn.hidden = count <= 1;
    dots.hidden = count <= 1;
    dots.innerHTML = items.map((_, i) =>
      `<button type="button" class="examine-dot" data-sound="off" aria-label="Show ${i + 1} of ${count}" aria-current="${i === index}"></button>`
    ).join('');
    closeBtn.focus();

    if (!reduced && origin) {
      frame.style.opacity = '0';
      let last = { width: 0, height: 0 };
      let stable = 0;
      let frames = 0;
      const wait = () => {
        const box = frame.getBoundingClientRect();
        stable = box.width > 0 && Math.abs(box.width - last.width) < 0.5 && Math.abs(box.height - last.height) < 0.5
          ? stable + 1
          : 0;
        last = { width: box.width, height: box.height };
        if (stable < 2 && frames < 60) {
          frames += 1;
          requestAnimationFrame(wait);
          return;
        }
        frame.style.opacity = '';
        flipFrom(frame, origin);
      };
      requestAnimationFrame(wait);
    }
  };

  const hide = () => {
    playCue('toggle');
    root.hidden = true;
    video.pause();
    origin = null;
    hintOn = false;
    paintHint();
    document.body.style.overflow = '';
    freezeRail(false);
  };

  const step = (by) => {
    if (!scope || count === 0) return;
    playCue(by > 0 ? 'next' : 'prev');
    show((index + by + count) % count, scope);
  };

  const go = (i) => {
    if (!scope) return;
    show(i, scope);
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!root.hidden) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const media = target.closest('img, video');
    if (!media || media.closest('a') || media.closest('.examine')) return;
    const box = media.closest('[data-examinable]');
    if (!(box instanceof HTMLElement)) return;
    const i = mediaItems(box).indexOf(media);
    if (i < 0) return;
    event.preventDefault();
    armCues();
    show(i, box, media.getBoundingClientRect());
  });

  document.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') hide();
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
  });

  root.addEventListener('mousemove', (event) => {
    hintOn = true;
    action = zone(event.clientX, count);
    hint.style.left = `${event.clientX}px`;
    hint.style.top = `${event.clientY}px`;
    paintHint();
  });
  root.addEventListener('mouseleave', () => {
    hintOn = false;
    paintHint();
  });
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.video-toggle, .examine-close, .examine-nav, .examine-dots')) return;
    if (action === 'prev') step(-1);
    else if (action === 'next') step(1);
    else hide();
  });

  const chrome = [closeBtn, prevBtn, nextBtn, dots];
  for (const el of chrome) {
    el.addEventListener('mouseenter', () => {
      overChrome = true;
      paintHint();
    });
    el.addEventListener('mouseleave', () => {
      overChrome = false;
      paintHint();
    });
  }

  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    hide();
  });
  prevBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    step(-1);
  });
  nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    step(1);
  });
  dots.addEventListener('click', (event) => {
    event.stopPropagation();
    const btn = event.target instanceof Element ? event.target.closest('.examine-dot') : null;
    if (!btn) return;
    const i = Array.from(dots.children).indexOf(btn);
    if (i >= 0) go(i);
  });
}
