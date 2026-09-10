const PATCHES = {
  toggle: {
    tones: [{ type: 'sine', freq: 392, to: 311, attack: 0.006, decay: 0.34, gain: 0.34 }],
    soften: 1400,
  },
  next: {
    tones: [
      { type: 'sine', freq: 587.33, attack: 0.004, decay: 0.17, gain: 0.24 },
      { type: 'sine', freq: 293.66, attack: 0.004, decay: 0.14, gain: 0.09 },
    ],
    soften: 2600,
  },
  prev: {
    tones: [
      { type: 'sine', freq: 392, attack: 0.004, decay: 0.17, gain: 0.24 },
      { type: 'sine', freq: 196, attack: 0.004, decay: 0.14, gain: 0.09 },
    ],
    soften: 2200,
  },
};

let ctx = null;
let master = null;
let armed = false;
let finePointer = null;
let resume = null;

function canPlay() {
  if (!window.matchMedia) return false;
  if (finePointer === null) {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    finePointer = mq.matches;
    mq.addEventListener?.('change', (event) => {
      finePointer = event.matches;
    });
  }
  return finePointer;
}

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') resume = ctx.resume().catch(() => {});
  return ctx;
}

function envelope(gain, at, attack, decay, peak) {
  gain.gain.setValueAtTime(1e-4, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(1e-4, at + attack + decay);
}

export function armCues() {
  if (!canPlay()) return;
  armed = true;
  audio();
}

export function playCue(name) {
  const patch = PATCHES[name];
  if (!patch || !canPlay()) return;
  const ac = audio();
  if (!ac || !master) return;
  if (ac.state !== 'running') {
    if (!armed) return;
    resume?.then(() => playCue(name));
    return;
  }

  let dest = master;
  if (patch.soften) {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = patch.soften;
    filter.connect(master);
    dest = filter;
  }

  const now = ac.currentTime;
  for (const tone of patch.tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.type;
    const start = now + (tone.at ?? 0);
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.attack + tone.decay);
    envelope(gain, start, tone.attack, tone.decay, tone.gain);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + tone.attack + tone.decay + 0.02);
  }
}
