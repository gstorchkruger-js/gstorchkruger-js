/**
 * Arena DbD — anima via <svg x/y> + SMIL attributeName (NÃO animateTransform).
 * animateTransform quebra em <img> no README do GitHub → personagens no canto (0,0).
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;

const SURV = [
  { id: 'D', fill: '#f0c75e' },
  { id: 'M', fill: '#ff6b8a' },
  { id: 'C', fill: '#6bcb77' },
  { id: 'J', fill: '#c4a574' },
];

const OUTCOMES = ['4k', '3k', 'gate', 'hatch', 'trade'];

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function ri(a, b) {
  return Math.floor(rand(a, b + 1));
}
function pick(a) {
  return a[ri(0, a.length - 1)];
}
function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function P(x, y) {
  return { x: +Number(x).toFixed(1), y: +Number(y).toFixed(1) };
}
function near(p, r = 36) {
  return P(clamp(p.x + rand(-r, r), 50, W - 50), clamp(p.y + rand(-r, r), 55, H - 40));
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** keyTimes 0..1 estritamente crescentes, sempre terminam em 1 */
function packTimes(secs, total) {
  const n = secs.length;
  if (n < 2) return { times: [0, 1], keyTimes: '0;1' };
  const raw = secs.map((s) => clamp(s / total, 0, 0.999));
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    if (raw[i] <= raw[i - 1]) raw[i] = Math.min(0.998, raw[i - 1] + 0.01);
  }
  raw[n - 1] = 1;
  for (let i = n - 2; i >= 1; i--) {
    if (raw[i] >= raw[i + 1]) raw[i] = Math.max(raw[i - 1] + 0.005, raw[i + 1] - 0.005);
  }
  raw[0] = 0;
  raw[n - 1] = 1;
  return { times: raw, keyTimes: raw.map((t) => t.toFixed(4)).join(';') };
}

function buildMap() {
  const gens = shuffle([
    P(150, 110), P(340, 90), P(560, 120), P(760, 100), P(480, 220), P(220, 230), P(700, 230),
  ]).slice(0, 5);
  const hooks = shuffle([P(90, 170), P(460, 65), P(840, 160), P(620, 255), P(300, 265)]).slice(0, 4);
  const pallets = shuffle([P(250, 150), P(420, 170), P(600, 150), P(180, 190), P(720, 170)]).slice(0, 4);
  const windows = shuffle([P(310, 130), P(520, 190), P(650, 110)]).slice(0, 3);
  const traps = [near(gens[0], 45), near(hooks[0], 40)];
  const trees = Array.from({ length: 12 }, () => P(rand(60, W - 60), rand(70, H - 45)));
  const rocks = Array.from({ length: 7 }, () => P(rand(70, W - 70), rand(80, H - 45)));
  return {
    gens,
    hooks,
    pallets,
    windows,
    traps,
    trees,
    rocks,
    gateA: P(W - 40, 110),
    gateB: P(W - 40, 230),
    hatch: P(90, H - 55),
  };
}

function scenery(map) {
  let s = '';
  for (let x = 0; x < W; x += 40) {
    for (let y = 40; y < H; y += 40) {
      if (Math.random() < 0.3) s += `<rect x="${x}" y="${y}" width="40" height="40" fill="#12161c" opacity="0.3"/>`;
    }
  }
  for (const t of map.trees) {
    s += `<g transform="translate(${t.x},${t.y})" opacity="0.55">
      <rect x="-2" y="0" width="4" height="14" fill="#3d2b1f"/>
      <ellipse cy="-6" rx="10" ry="12" fill="#1e3a2f"/>
    </g>`;
  }
  for (const r of map.rocks) {
    s += `<ellipse cx="${r.x}" cy="${r.y}" rx="${ri(8, 14)}" ry="${ri(5, 8)}" fill="#2a3038" stroke="#3d4450" opacity="0.75"/>`;
  }
  for (const [x, y, w, h] of [[120, 140, 70, 10], [400, 210, 90, 10], [650, 140, 60, 10], [500, 80, 10, 50]]) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#252b33" stroke="#3d4450"/>`;
  }
  for (const p of map.pallets) {
    s += `<rect x="${p.x - 18}" y="${p.y - 4}" width="36" height="8" rx="1" fill="#6b4f2e" stroke="#c4a574"/>`;
  }
  for (const w of map.windows) {
    s += `<rect x="${w.x - 14}" y="${w.y - 16}" width="28" height="32" fill="none" stroke="#6e7681" stroke-width="2" stroke-dasharray="4 3"/>`;
  }
  return s;
}

/**
 * Anima um grupo movendo o <svg> wrapper via attributeName x/y — funciona em <img>.
 */
function movingActor(points, timesSec, total, inner, size = 48) {
  const n = Math.min(points.length, timesSec.length);
  const pts = points.slice(0, n);
  const secs = timesSec.slice(0, n);
  const { keyTimes } = packTimes(secs, total);
  const xs = pts.map((p) => (p.x - size / 2).toFixed(1)).join(';');
  const ys = pts.map((p) => (p.y - size / 2).toFixed(1)).join(';');
  const x0 = (pts[0].x - size / 2).toFixed(1);
  const y0 = (pts[0].y - size / 2).toFixed(1);
  return `
  <svg x="${x0}" y="${y0}" width="${size}" height="${size}" overflow="visible">
    <animate attributeName="x" values="${xs}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <animate attributeName="y" values="${ys}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <g transform="translate(${size / 2},${size / 2})">${inner}</g>
  </svg>`;
}

function survBody(s) {
  return `
    <ellipse cy="3" rx="8" ry="10" fill="${s.fill}" stroke="#0d1117" stroke-width="1.2"/>
    <circle cy="-11" r="5.5" fill="${s.fill}" stroke="#0d1117" stroke-width="1.2"/>
    <text y="4" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="#0d1117" font-family="Arial">${s.id}</text>`;
}

function trapperBody() {
  return `
    <ellipse cy="3" rx="11" ry="14" fill="#2b2f36" stroke="#9b2226" stroke-width="1.6"/>
    <circle cy="-13" r="7.5" fill="#3d4450" stroke="#c9d1d9"/>
    <circle cx="-2.8" cy="-14" r="1.4" fill="#ff3333"/>
    <circle cx="2.8" cy="-14" r="1.4" fill="#ff3333"/>
    <rect x="-15" y="-5" width="9" height="6" rx="1" fill="#6e7681"/>
    <rect x="6" y="-5" width="9" height="6" rx="1" fill="#6e7681"/>
    <rect x="11" y="-3" width="18" height="4" rx="1" fill="#c9d1d9" transform="rotate(-18 11 0)"/>
    <circle r="22" fill="none" stroke="#9b2226" stroke-width="1" opacity="0.35">
      <animate attributeName="r" values="18;26;18" dur="2.2s" repeatCount="indefinite"/>
    </circle>`;
}

function genProp(g, i, total, phases) {
  const widths = phases.map((p) => (28 * p.progress).toFixed(1)).join(';');
  const { keyTimes } = packTimes(phases.map((p) => p.t), total);
  const kick = phases.find((p) => p.kick);
  let spark = '';
  if (kick) {
    const a = Math.max(0, kick.t / total - 0.01);
    const b = kick.t / total;
    const c = Math.min(1, (kick.t + 0.5) / total);
    spark = `<circle r="2" fill="#ff6b35" opacity="0" cx="0" cy="0">
      <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="2;2;11;2;2" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </circle>`;
  }
  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="#1c2128" stroke="#6e7681"/>
    <rect x="-14" y="-8" width="28" height="8" rx="1" fill="#0d1117"/>
    <rect x="-11" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-26;-22" dur="${rand(1.8, 2.5).toFixed(2)}s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-25;-22" dur="${rand(2, 2.8).toFixed(2)}s" begin="0.3s" repeatCount="indefinite"/>
    </rect>
    ${spark}
    <rect x="-16" y="14" width="32" height="5" rx="1" fill="#21262d"/>
    <rect x="-16" y="14" height="5" rx="1" fill="#3fb950" width="0">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="32" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GEN ${i + 1}</text>
  </g>`;
}

function hookProp(h) {
  return `
  <g transform="translate(${h.x},${h.y})">
    <line x1="0" y1="-34" x2="0" y2="12" stroke="#6e7681" stroke-width="3.5"/>
    <path d="M0 -34 C-14 -24,-12 -8,0 -2 C12 -8,14 -24,0 -34" fill="none" stroke="#c9d1d9" stroke-width="2.8"/>
    <circle cy="-2" r="2.5" fill="#8b949e"/>
  </g>`;
}

function trapProp(t, total, snapSec) {
  const a = (snapSec / total).toFixed(4);
  const b = ((snapSec + 0.7) / total).toFixed(4);
  return `
  <g transform="translate(${t.x},${t.y})">
    <ellipse rx="15" ry="9" fill="#161b22" stroke="#6e7681"/>
    <path d="M-11 0 L-5 -7 L5 -7 L11 0" fill="none" stroke="#c9d1d9" stroke-width="1.6"/>
    <circle r="5" fill="#ff2244" opacity="0">
      <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${a};${((snapSec + 0.1) / total).toFixed(4)};${b};1" dur="${total}s" repeatCount="indefinite"/>
    </circle>
  </g>`;
}

function gateProp(g, total, openSec) {
  const a = (openSec / total).toFixed(4);
  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-10" y="-42" width="14" height="84" fill="#252b33" stroke="#6e7681"/>
    <rect x="-7" y="-39" width="8" height="78" fill="#3fb950" opacity="0.1">
      <animate attributeName="opacity" values="0.1;0.1;0.65;0.65" keyTimes="0;${a};${Math.min(0.999, parseFloat(a) + 0.02).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="52" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GATE</text>
  </g>`;
}

function scriptMatch(map, t0, matchLen, outcome) {
  const chased = ri(0, 3);
  const hooked = chased;
  let rescuer = (hooked + 1) % 4;
  const sacrificed = [];
  const escaped = [];
  if (outcome === '4k') sacrificed.push(0, 1, 2, 3);
  else if (outcome === '3k') {
    sacrificed.push(0, 1, 2);
    escaped.push(3);
  } else if (outcome === 'trade') {
    sacrificed.push(0, 1);
    escaped.push(2, 3);
  } else if (outcome === 'gate') escaped.push(0, 1, 2, 3);
  else {
    sacrificed.push(0, 1, 2);
    escaped.push(3);
  }

  const T = {
    early: t0,
    work: t0 + matchLen * 0.14,
    kick: t0 + matchLen * 0.24,
    chase: t0 + matchLen * 0.32,
    vault: t0 + matchLen * 0.4,
    pallet: t0 + matchLen * 0.48,
    down: t0 + matchLen * 0.56,
    hook: t0 + matchLen * 0.64,
    mid: t0 + matchLen * 0.74,
    endgame: t0 + matchLen * 0.84,
    resolve: t0 + matchLen * 0.93,
    end: t0 + matchLen,
  };

  const hook1 = map.hooks[0];
  const hook2 = map.hooks[1 % map.hooks.length];
  const pallet = map.pallets[0];
  const win = map.windows[0];
  const gate = map.gateA;

  const survPaths = SURV.map((s, i) => {
    const pts = [];
    const times = [];
    const add = (sec, p) => {
      times.push(sec);
      pts.push(p);
    };
    const myGen = map.gens[i % map.gens.length];
    add(T.early, near(myGen, 45));
    add(T.work, near(myGen, 8));
    add(T.work + matchLen * 0.08, near(myGen, 6));

    if (i === chased) {
      add(T.chase, near(myGen, 25));
      add(T.vault, near(win, 10));
      add(T.pallet, near(pallet, 12));
      add(T.down, near(hook1, 50));
      add(T.hook, { ...hook1 });
      if (escaped.includes(i) || outcome === 'gate') {
        add(T.mid, near(hook1, 22));
        add(T.endgame, near(gate, 40));
        add(T.resolve, near(gate, 12));
      } else {
        add(T.mid, { ...hook1 });
        add(T.endgame, { ...hook1 });
        add(T.resolve, { ...hook1 });
      }
    } else if (i === rescuer && (outcome === 'gate' || outcome === 'trade' || outcome === 'hatch')) {
      add(T.chase, near(map.gens[(i + 1) % map.gens.length], 8));
      add(T.hook, near(map.gens[(i + 1) % map.gens.length], 6));
      add(T.mid - matchLen * 0.04, near(hook1, 35));
      add(T.mid, near(hook1, 14));
      const exit = outcome === 'hatch' && i === 3 ? map.hatch : gate;
      add(T.endgame, near(exit, 35));
      add(T.resolve, near(exit, 10));
    } else {
      add(T.chase, near(myGen, 6));
      add(T.pallet, near(map.gens[(i + 2) % map.gens.length], 35));
      add(T.hook, near(map.gens[(i + 2) % map.gens.length], 8));
      if (sacrificed.includes(i) && outcome !== 'gate') {
        add(T.mid, near(hook2, 25));
        add(T.endgame, { ...hook2 });
        add(T.resolve, { ...hook2 });
      } else {
        const exit = outcome === 'hatch' && i === 3 ? map.hatch : gate;
        add(T.endgame, near(exit, 40));
        add(T.resolve, near(exit, 10));
      }
    }
    for (let k = 1; k < times.length; k++) {
      if (times[k] <= times[k - 1]) times[k] = times[k - 1] + 0.4;
    }
    return { pts, times };
  });

  const kPts = [];
  const kTimes = [];
  const kAdd = (sec, p) => {
    kTimes.push(sec);
    kPts.push(p);
  };
  kAdd(T.early, near(map.gens[2], 40));
  kAdd(T.work, near(map.gens[1], 45));
  kAdd(T.kick, near(map.gens[0], 12));
  kAdd(T.kick + matchLen * 0.05, near(map.gens[0], 10));
  kAdd(T.chase, near(map.gens[chased % map.gens.length], 20));
  kAdd(T.vault, near(win, 16));
  kAdd(T.pallet, near(pallet, 14));
  kAdd(T.pallet + matchLen * 0.06, near(pallet, 12));
  kAdd(T.down, near(hook1, 45));
  kAdd(T.hook, { ...hook1 });
  kAdd(T.mid, near(hook1, 50));
  if (outcome === '4k' || outcome === '3k' || outcome === 'trade') {
    kAdd(T.endgame, near(hook2, 18));
    kAdd(T.resolve, near(hook2, 8));
  } else {
    kAdd(T.endgame, near(gate, 70));
    kAdd(T.resolve, near(gate, 45));
  }
  for (let k = 1; k < kTimes.length; k++) {
    if (kTimes[k] <= kTimes[k - 1]) kTimes[k] = kTimes[k - 1] + 0.45;
  }

  const genPhases = map.gens.map((_, gi) => {
    const base = [
      { t: t0, progress: 0 },
      { t: T.work, progress: 0.2 + gi * 0.04 },
      { t: T.kick, progress: 0.48, kick: gi === 0 },
      { t: T.kick + 1.2, progress: gi === 0 ? 0.2 : 0.5 },
      { t: T.hook, progress: 0.58 + gi * 0.04 },
    ];
    if (outcome === 'gate' || outcome === 'hatch' || outcome === 'trade') {
      base.push({ t: T.endgame, progress: 1 }, { t: T.end, progress: 1 });
    } else {
      base.push({ t: T.endgame, progress: 0.72 }, { t: T.end, progress: 0.75 });
    }
    return base;
  });

  return { outcome, T, survPaths, killer: { pts: kPts, times: kTimes }, genPhases };
}

function banner(total, events) {
  return events
    .map((e) => {
      const a = Math.max(0, (e.t - 1) / total);
      const b = e.t / total;
      const c = Math.min(1, (e.t + 3.2) / total);
      const d = Math.min(1, (e.t + 4.5) / total);
      return `
  <g opacity="0">
    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};${d.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    <rect x="${W / 2 - 220}" y="${H / 2 - 26}" width="440" height="52" rx="8" fill="#0d1117" stroke="${e.color}" stroke-width="2" opacity="0.94"/>
    <text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" fill="${e.color}" font-size="17" font-family="Georgia,serif" font-weight="700">${esc(e.text)}</text>
  </g>`;
    })
    .join('\n');
}

function generate() {
  const seed = Date.now().toString(36);
  const map = buildMap();
  const killerWins = ['4k', '3k'];
  let o1 = pick(OUTCOMES);
  let o2 = pick(OUTCOMES.filter((o) => o !== o1));
  if (!killerWins.includes(o1) && !killerWins.includes(o2)) o2 = pick(killerWins);
  if (Math.random() < 0.5 && !killerWins.includes(o1)) {
    o1 = pick(killerWins);
    o2 = pick(OUTCOMES.filter((o) => o !== o1));
  }

  const m1Len = rand(36, 44);
  const gap = 3.5;
  const m2Len = rand(36, 44);
  const total = +(m1Len + gap + m2Len).toFixed(2);

  const match1 = scriptMatch(map, 0, m1Len, o1);
  const match2 = scriptMatch(map, m1Len + gap, m2Len, o2);

  const labels = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2K / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'SURVIVORS ESCAPED — GATE', color: '#3fb950' },
    hatch: { text: 'ONE ESCAPED THROUGH THE HATCH', color: '#58a6ff' },
  };

  const survNodes = SURV.map((s, i) => {
    const p1 = match1.survPaths[i];
    const p2 = match2.survPaths[i];
    const bridge = P(W / 2 + (i - 1.5) * 36, H / 2);
    const pts = [...p1.pts, bridge, bridge, ...p2.pts];
    const times = [...p1.times, match1.T.end + 0.4, match1.T.end + gap - 0.4, ...p2.times];
    return movingActor(pts, times, total, survBody(s), 44);
  });

  const kBridge = P(W / 2, 70);
  const kPts = [...match1.killer.pts, kBridge, kBridge, ...match2.killer.pts];
  const kTimes = [...match1.killer.times, match1.T.end + 0.4, match1.T.end + gap - 0.4, ...match2.killer.times];
  const killerNode = movingActor(kPts, kTimes, total, trapperBody(), 56);

  const genNodes = map.gens.map((g, i) =>
    genProp(g, i, total, [...match1.genPhases[i], ...match2.genPhases[i]])
  );

  const stamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena">
  <title>DbD Trapper trials</title>
  <desc>${esc(`seed ${seed} · ${total}s · ${o1} → ${o2} · ${stamp}`)}</desc>
  <defs>
    <radialGradient id="fog" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1a1014"/>
      <stop offset="100%" stop-color="#07080a"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#fog)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="#3d1f24"/>
  ${scenery(map)}
  ${genNodes.join('\n')}
  ${map.hooks.map(hookProp).join('\n')}
  ${map.traps.map((t, i) => trapProp(t, total, match1.T.chase + 2 + i)).join('\n')}
  ${gateProp(map.gateA, total, match1.T.endgame)}
  ${gateProp(map.gateB, total, match2.T.endgame)}
  <g transform="translate(${map.hatch.x},${map.hatch.y})">
    <rect x="-12" y="-12" width="24" height="24" fill="#12161c" stroke="#58a6ff" stroke-dasharray="3 2"/>
    <text y="4" text-anchor="middle" fill="#58a6ff" font-size="7" font-family="monospace">HATCH</text>
  </g>
  ${survNodes.join('\n')}
  ${killerNode}
  ${banner(total, [
    { t: match1.T.resolve, ...labels[o1] },
    { t: match2.T.resolve, ...labels[o2] },
  ])}
  <text x="16" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="11">DEAD BY DAYLIGHT · seed ${seed}</text>
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">trial A: ${o1} → trial B: ${o2} · ${total}s</text>
  <g transform="translate(16, ${H - 14})">
    <text fill="#6e7681" font-size="8" font-family="monospace">HEARTBEAT</text>
    <rect x="64" y="-7" width="140" height="5" rx="2" fill="#21262d"/>
    <rect x="64" y="-7" height="5" rx="2" fill="#9b2226" width="40">
      <animate attributeName="width" values="18;100;35;120;22;90;18" dur="7s" repeatCount="indefinite"/>
    </rect>
  </g>
</svg>
`;
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const svg = generate();
  for (const name of ['dbd-arena.svg', 'dbd-arena-dark.svg', 'foice-frutas.svg', 'foice-frutas-dark.svg']) {
    fs.writeFileSync(path.join(outDir, name), svg, 'utf8');
  }
  console.log('OK', Buffer.byteLength(svg), 'bytes');
}

main();
