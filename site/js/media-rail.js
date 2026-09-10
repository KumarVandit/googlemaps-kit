const RING = 2 * Math.PI * 14;

/** @type {Set<{ video: HTMLVideoElement, pausedByUser: () => boolean, freeze: (on: boolean) => void }>} */
const players = new Set();

export function bindMediaRail(root = document) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-video-player]').forEach((el) => {
    if (el instanceof HTMLElement) bindVideoPlayer(el, { reduced, observe: !el.closest('.examine') });
  });
}

export function bindVideoPlayer(root, { reduced = false, observe = true } = {}) {
  const video = root.querySelector('video');
  const ring = root.querySelector('.video-ring-prog');
  const btn = root.querySelector('.video-toggle');
  if (!(video instanceof HTMLVideoElement) || !ring || !btn) return;

  let userPaused = false;
  let frozen = false;
  video.muted = true;
  video.playsInline = true;

  ring.setAttribute('stroke-dasharray', String(RING));
  ring.setAttribute('stroke-dashoffset', String(RING));

  const setPlaying = (playing) => {
    btn.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    btn.dataset.state = playing ? 'playing' : 'paused';
  };

  const tick = () => {
    if (video.duration > 0) {
      ring.style.strokeDashoffset = String(RING * (1 - video.currentTime / video.duration));
    }
    requestAnimationFrame(tick);
  };

  video.addEventListener('play', () => setPlaying(true));
  video.addEventListener('pause', () => setPlaying(false));
  video.addEventListener('contextmenu', (event) => event.preventDefault());

  const toggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (video.paused) {
      userPaused = false;
      video.play().catch(() => {});
    } else {
      userPaused = true;
      video.pause();
    }
  };

  btn.addEventListener('click', toggle);
  for (const name of ['mousedown', 'pointerdown', 'touchstart']) {
    btn.addEventListener(name, (event) => event.stopPropagation());
  }

  if (reduced) {
    video.removeAttribute('autoplay');
    video.pause();
    setPlaying(false);
    return;
  }

  requestAnimationFrame(tick);

  if (observe) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (frozen || userPaused) continue;
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(root);

    document.addEventListener('visibilitychange', () => {
      if (frozen || userPaused) return;
      if (document.visibilityState === 'hidden') video.pause();
      else video.play().catch(() => {});
    });
  }

  const api = {
    video,
    pausedByUser: () => userPaused,
    freeze(on) {
      frozen = on;
      if (on) video.pause();
      else if (!userPaused) video.play().catch(() => {});
    },
  };
  players.add(api);

  video.addEventListener('loadedmetadata', () => {
    if (!userPaused && !frozen && !reduced) video.play().catch(() => {});
  });
}

export function freezeRail(on) {
  for (const player of players) {
    if (player.video.closest('.examine')) continue;
    player.freeze(on);
  }
}
