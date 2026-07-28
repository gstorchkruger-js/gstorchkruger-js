/**
 * Arena DbD — partidas longas, lentas, cenário rico e desfechos aleatórios.
 * Um SVG contém 2 trials seguidas com resultados DIFERENTES (killer também vence).
 * SMIL only (sem JS no SVG) — funciona no README do GitHub.
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;

const SURV = [
  { id: 'D', fill: '#f0c75e', label: 'Dwight' },
  { id: 'M', fill: '#ff6b8a', label: 'Meg' },
  { id: 'C', fill: '#6bcb77', label: 'Claudette' },
  { id: 'J', fill: '#c4a574', label: 'Jake' },
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
  return P(clamp(p.x + rand(-r, r), 40, W - 40), clamp(p.y + rand(-r, r), 50, H - 36));
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function tx(points) {
  return points.map((p) => `${p.x} ${p.y}`).join('; ');
}
function kt(n) {
  return Array.from({ length: n }, (_, i) => (n <= 1 ? '0' : (i / (n - 1)).toFixed(4))).join('; ');
}
function sp(n) {
  return Array(Math.max(1, n)).fill('0.45 0.05 0.25 1').join('; ');
}
/** keyTimes absolutos 0..1 a partir de tempos em segundos no ciclo total */
function absTimes(secs, total) {
  return secs.map((s) => clamp(s / total, 0, 1).toFixed(4)).join('; ');
}
function hold(p, n = 2) {
  return Array.from({ length: n }, () => ({ ...p }));
}

function buildMap() {
  // Layout tipo MacMillan: corredores + props
  const gens = shuffle([
    P(150, 100), P(340, 80), P(560, 110), P(760, 90), P(480, 210), P(220, 220), P(700, 220),
  ]).slice(0, 5);
  const hooks = shuffle([P(70, 160), P(460, 55), P(860, 150), P(620, 250), P(300, 260)]).slice(0, 4);
  const pallets = shuffle([P(250, 140), P(420, 160), P(600, 140), P(180, 180), P(720, 160)]).slice(0, 4);
  const windows = shuffle([P(310, 120), P(520, 180), P(650, 100)]).slice(0, 3);
  const traps = [near(gens[0], 45), near(hooks[0], 40), near(pallets[1] || gens[1], 35)];
  const trees = Array.from({ length: 10 }, () => P(rand(50, W - 50), rand(60, H - 40)));
  const rocks = Array.from({ length: 6 }, () => P(rand(60, W - 60), rand(70, H - 40)));
  const gateA = P(W - 36, 100);
  const gateB = P(W - 36, 220);
  const hatch = P(80, H - 55);
  return { gens, hooks, pallets, windows, traps, trees, rocks, gateA, gateB, hatch };
}

function scenery(map) {
  let s = '';
  // tiles / chão
  for (let x = 0; x < W; x += 40) {
    for (let y = 40; y < H; y += 40) {
      if (Math.random() < 0.35) {
        s += `<rect x="${x}" y="${y}" width="40" height="40" fill="#12161c" opacity="0.35"/>`;
      }
    }
  }
  for (const t of map.trees) {
    s += `<g transform="translate(${t.x},${t.y})" opacity="0.55">
      <rect x="-2" y="0" width="4" height="14" fill="#3d2b1f"/>
      <ellipse cy="-6" rx="10" ry="12" fill="#1e3a2f"/>
      <ellipse cy="-14" rx="7" ry="8" fill="#244a3a"/>
    </g>`;
  }
  for (const r of map.rocks) {
    s += `<ellipse cx="${r.x}" cy="${r.y}" rx="${ri(8, 14)}" ry="${ri(5, 8)}" fill="#2a3038" stroke="#3d4450" stroke-width="1" opacity="0.7"/>`;
  }
  // paredes curtas
  const walls = [
    [120, 130, 70, 10], [400, 200, 90, 10], [650, 130, 60, 10], [500, 70, 10, 50], [280, 170, 10, 55],
  ];
  for (const [x, y, w, h] of walls) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#252b33" stroke="#3d4450"/>`;
  }
  for (const p of map.pallets) {
    s += `<g transform="translate(${p.x},${p.y})" class="pallet">
      <rect x="-18" y="-4" width="36" height="8" rx="1" fill="#6b4f2e" stroke="#c4a574" stroke-width="1"/>
      <rect x="-16" y="-2" width="32" height="2" fill="#8b6914" opacity="0.5"/>
    </g>`;
  }
  for (const w of map.windows) {
    s += `<g transform="translate(${w.x},${w.y})">
      <rect x="-14" y="-16" width="28" height="32" fill="none" stroke="#6e7681" stroke-width="2" stroke-dasharray="4 3"/>
      <text y="28" text-anchor="middle" fill="#484f58" font-size="7" font-family="monospace">VAULT</text>
    </g>`;
  }
  return s;
}

function genProp(g, i, total, phases) {
  // phases: array of {t, progress 0..1} for this gen across full SVG timeline
  const values = phases.map((p) => (28 * p.progress).toFixed(1)).join('; ');
  const times = absTimes(phases.map((p) => p.t), total);
  const kickSparks = phases
    .filter((p) => p.kick)
    .map((p) => {
      const a = (p.t / total).toFixed(4);
      const b = ((p.t + 0.8) / total).toFixed(4);
      return `${a};${a};${((p.t + 0.15) / total).toFixed(4)};${b}`;
    })
    .join(';') || '0;0;0;1';
  // simplify spark: one random kick moment if any
  const kickT = phases.find((p) => p.kick);
  const spark = kickT
    ? `<circle r="2" fill="#ff6b35" opacity="0">
        <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${((kickT.t - 0.05) / total).toFixed(4)};${(kickT.t / total).toFixed(4)};${((kickT.t + 0.4) / total).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
        <animate attributeName="r" values="2;2;12;3;2" keyTimes="0;${((kickT.t - 0.05) / total).toFixed(4)};${(kickT.t / total).toFixed(4)};${((kickT.t + 0.4) / total).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
      </circle>`
    : '';

  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="#1c2128" stroke="#6e7681"/>
    <rect x="-14" y="-8" width="28" height="8" rx="1" fill="#0d1117"/>
    <rect x="-11" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-26;-22" dur="${rand(1.8, 2.6).toFixed(2)}s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-25;-22" dur="${rand(2.0, 2.8).toFixed(2)}s" begin="0.4s" repeatCount="indefinite"/>
    </rect>
    ${spark}
    <rect x="-16" y="14" width="32" height="5" rx="1" fill="#21262d"/>
    <rect x="-16" y="14" height="5" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${values}" keyTimes="${times}" dur="${total}s" repeatCount="indefinite"/>
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
    <ellipse cy="14" rx="10" ry="3" fill="#000" opacity="0.25"/>
  </g>`;
}

function trapProp(t, total, snapSec) {
  const a = (snapSec / total).toFixed(4);
  const b = ((snapSec + 0.6) / total).toFixed(4);
  return `
  <g transform="translate(${t.x},${t.y})">
    <ellipse rx="15" ry="9" fill="#161b22" stroke="#6e7681"/>
    <path d="M-11 0 L-5 -7 L5 -7 L11 0" fill="none" stroke="#c9d1d9" stroke-width="1.6">
      <animateTransform attributeName="transform" type="scale"
        values="1 1;1 1;1 0.15;1 1;1 1"
        keyTimes="0;${a};${((snapSec + 0.2) / total).toFixed(4)};${b};1"
        dur="${total}s" repeatCount="indefinite"/>
    </path>
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
    <rect x="-7" y="-39" width="8" height="78" fill="#3fb950">
      <animate attributeName="opacity" values="0.08;0.08;0.7;0.7" keyTimes="0;${a};${Math.min(0.999, parseFloat(a) + 0.02).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="52" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GATE</text>
  </g>`;
}

function survivorBody(s) {
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
    <g>
      <rect x="11" y="-3" width="20" height="4" rx="1" fill="#c9d1d9" transform="rotate(-18 11 0)"/>
    </g>
    <circle r="24" fill="none" stroke="#9b2226" stroke-width="1" opacity="0.3">
      <animate attributeName="r" values="20;28;20" dur="2.4s" repeatCount="indefinite"/>
    </circle>`;
}

/**
 * Constrói uma trial (match) com desfecho sorteado.
 * Retorna waypoints por ator em tempo absoluto (segundos desde t0).
 */
function scriptMatch(map, t0, matchLen, outcome) {
  const chased = ri(0, 3);
  let hooked = chased;
  let rescuer = (hooked + 1 + ri(0, 2)) % 4;
  const sacrificed = [];
  const escaped = [];

  // Quem morre / foge conforme outcome
  if (outcome === '4k') {
    sacrificed.push(0, 1, 2, 3);
  } else if (outcome === '3k') {
    sacrificed.push(0, 1, 2);
    escaped.push(3);
  } else if (outcome === 'trade') {
    sacrificed.push(0, 1);
    escaped.push(2, 3);
  } else if (outcome === 'gate') {
    escaped.push(0, 1, 2, 3);
  } else if (outcome === 'hatch') {
    sacrificed.push(0, 1, 2);
    escaped.push(3);
  }

  const genKick = map.gens[0];
  const hook1 = map.hooks[0];
  const hook2 = map.hooks[1 % map.hooks.length];
  const pallet = map.pallets[0];
  const win = map.windows[0];
  const gate = map.gateA;

  // Tempos relativos dentro da match (lentos)
  const T = {
    early: t0 + matchLen * 0.0,
    work: t0 + matchLen * 0.12,
    kick: t0 + matchLen * 0.22,
    chaseStart: t0 + matchLen * 0.28,
    vault: t0 + matchLen * 0.36,
    pallet: t0 + matchLen * 0.44,
    down: t0 + matchLen * 0.52,
    hook: t0 + matchLen * 0.6,
    rescueOrKill: t0 + matchLen * 0.7,
    endgame: t0 + matchLen * 0.82,
    resolve: t0 + matchLen * 0.92,
    end: t0 + matchLen,
  };

  const survPaths = SURV.map((s, i) => {
    const pts = [];
    const times = [];
    const add = (sec, p) => {
      times.push(sec);
      pts.push(p);
    };

    const myGen = map.gens[i % map.gens.length];
    add(T.early, near(myGen, 50));
    add(T.work, near(myGen, 6)); // trabalha gen (fica)
    add(T.work + matchLen * 0.06, near(myGen, 5));

    if (i === chased) {
      add(T.chaseStart, near(myGen, 20));
      add(T.vault, near(win, 8)); // vault
      add(T.pallet, near(pallet, 10));
      add(T.down, near(hook1, 55));
      add(T.hook, { ...hook1 });
      if (outcome === '4k' || (sacrificed.includes(i) && outcome !== 'gate')) {
        // fica no gancho até o fim / sacrifício
        if (outcome === 'gate' || escaped.includes(i)) {
          add(T.rescueOrKill, near(hook1, 25));
          add(T.endgame, near(gate, 40));
          add(T.resolve, near(gate, 8));
        } else {
          add(T.rescueOrKill, { ...hook1 });
          add(T.endgame, { ...hook1 });
          // some (mori/sacrifício)
          add(T.resolve, { ...hook1 });
        }
      } else {
        add(T.rescueOrKill, near(hook1, 20));
        add(T.endgame, near(gate, 35));
        add(T.resolve, near(gate, 10));
      }
    } else if (i === rescuer && (outcome === 'gate' || outcome === 'trade' || outcome === 'hatch')) {
      add(T.chaseStart, near(map.gens[(i + 1) % 5], 8));
      add(T.hook - matchLen * 0.02, near(map.gens[(i + 1) % 5], 5));
      add(T.rescueOrKill - matchLen * 0.05, near(hook1, 40));
      add(T.rescueOrKill, near(hook1, 12)); // unhook
      add(T.endgame, near(outcome === 'hatch' && escaped.includes(i) ? map.hatch : gate, 30));
      add(T.resolve, near(outcome === 'hatch' && i === 3 ? map.hatch : gate, 10));
    } else {
      add(T.chaseStart, near(myGen, 5));
      add(T.pallet, near(map.gens[(i + 2) % map.gens.length], 40));
      add(T.hook, near(map.gens[(i + 2) % map.gens.length], 8));
      if (sacrificed.includes(i) && outcome !== 'gate') {
        // segunda morte / hook late
        add(T.rescueOrKill, near(hook2, 30));
        add(T.endgame, { ...hook2 });
        add(T.resolve, { ...hook2 });
      } else if (escaped.includes(i) || outcome === 'gate') {
        const exit = outcome === 'hatch' && i === 3 ? map.hatch : gate;
        add(T.endgame, near(exit, 45));
        add(T.resolve, near(exit, 8));
      } else {
        add(T.endgame, near(myGen, 20));
        add(T.resolve, near(myGen, 10));
      }
    }

    // garantir tempos crescentes
    for (let k = 1; k < times.length; k++) {
      if (times[k] <= times[k - 1]) times[k] = times[k - 1] + 0.35;
    }
    return { i, pts, times, sacrificed: sacrificed.includes(i), escaped: escaped.includes(i), chased: i === chased };
  });

  // Killer path
  const kPts = [];
  const kTimes = [];
  const kAdd = (sec, p) => {
    kTimes.push(sec);
    kPts.push(p);
  };
  kAdd(T.early, near(map.gens[2], 40));
  kAdd(T.work, near(map.gens[1], 50)); // patrol lento
  kAdd(T.kick, near(genKick, 10)); // kick
  kAdd(T.kick + matchLen * 0.04, near(genKick, 8));
  kAdd(T.chaseStart, near(map.gens[chased % map.gens.length], 25));
  kAdd(T.vault, near(win, 18));
  kAdd(T.pallet, near(pallet, 14)); // toma stun visual
  kAdd(T.pallet + matchLen * 0.05, near(pallet, 12)); // atordoado
  kAdd(T.down, near(hook1, 50));
  kAdd(T.hook, { ...hook1 }); // hook
  kAdd(T.rescueOrKill, near(hook1, 55)); // patrulha / mori area
  if (outcome === '4k' || outcome === '3k' || outcome === 'trade') {
    kAdd(T.endgame, near(hook2, 20));
    kAdd(T.resolve, near(hook2, 8));
  } else {
    kAdd(T.endgame, near(gate, 80)); // tenta camp gate
    kAdd(T.resolve, near(gate, 50));
  }

  for (let k = 1; k < kTimes.length; k++) {
    if (kTimes[k] <= kTimes[k - 1]) kTimes[k] = kTimes[k - 1] + 0.4;
  }

  // Gen progress phases for all gens (global)
  const genPhases = map.gens.map((_, gi) => {
    const base = [
      { t: t0, progress: 0 },
      { t: T.work, progress: 0.15 + gi * 0.05 },
      { t: T.kick, progress: 0.45, kick: gi === 0 },
      { t: T.kick + 1, progress: gi === 0 ? 0.18 : 0.5 },
      { t: T.hook, progress: 0.55 + gi * 0.05 },
    ];
    if (outcome === 'gate' || outcome === 'hatch' || outcome === 'trade') {
      base.push({ t: T.endgame, progress: 1 });
      base.push({ t: T.end, progress: 1 });
    } else {
      base.push({ t: T.endgame, progress: 0.7 });
      base.push({ t: T.end, progress: 0.75 });
    }
    return base;
  });

  return {
    outcome,
    t0,
    matchLen,
    T,
    survPaths,
    killer: { pts: kPts, times: kTimes },
    genPhases,
    chased,
    labelSec: T.resolve,
  };
}

function actorAnim(points, timesSec, total, extraInner = '') {
  // normalizar
  const t = timesSec.slice();
  for (let i = 1; i < t.length; i++) if (t[i] <= t[i - 1]) t[i] = t[i - 1] + 0.2;
  const values = tx(points);
  const keyTimes = absTimes(t, total);
  const spline = sp(points.length - 1);
  return `
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${keyTimes}"
      dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <g>${extraInner}</g>
  </g>`;
}

function outcomeBanner(total, events) {
  // events: [{t, text, color}]
  let nodes = '';
  for (const e of events) {
    const a = ((e.t - 1.2) / total).toFixed(4);
    const b = (e.t / total).toFixed(4);
    const c = ((e.t + 3.5) / total).toFixed(4);
    const d = ((e.t + 5) / total).toFixed(4);
    nodes += `
  <g opacity="0">
    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${a};${b};${c};${d};1" dur="${total}s" repeatCount="indefinite"/>
    <rect x="${W / 2 - 210}" y="${H / 2 - 28}" width="420" height="56" rx="8" fill="#0d1117" stroke="${e.color}" stroke-width="2" opacity="0.92"/>
    <text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" fill="${e.color}" font-size="18" font-family="Georgia, serif" font-weight="700">${esc(e.text)}</text>
  </g>`;
  }
  return nodes;
}

function generate() {
  const seed = Date.now().toString(36);
  const map = buildMap();

  // Duas trials com desfechos diferentes (garante variação no loop)
  let o1 = pick(OUTCOMES);
  let o2 = pick(OUTCOMES.filter((o) => o !== o1));
  // garantir que em algum momento o killer "vence" de verdade
  const killerWins = ['4k', '3k'];
  if (!killerWins.includes(o1) && !killerWins.includes(o2)) {
    o2 = pick(killerWins);
  }
  if (Math.random() < 0.5) {
    // às vezes a 1ª trial já é vitória do killer
    if (!killerWins.includes(o1)) {
      o1 = pick(killerWins);
      o2 = pick(OUTCOMES.filter((o) => o !== o1));
    }
  }

  const m1Len = rand(38, 48);
  const gap = 4; // banner / reset
  const m2Len = rand(38, 48);
  const total = +(m1Len + gap + m2Len).toFixed(2);

  const match1 = scriptMatch(map, 0, m1Len, o1);
  const match2 = scriptMatch(map, m1Len + gap, m2Len, o2);

  const outcomeText = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2K / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'SURVIVORS ESCAPED — GATE', color: '#3fb950' },
    hatch: { text: 'ONE ESCAPED THROUGH THE HATCH', color: '#58a6ff' },
  };

  const banners = outcomeBanner(total, [
    { t: match1.T.resolve, ...outcomeText[o1] },
    { t: match2.T.resolve, ...outcomeText[o2] },
  ]);

  // Merge survivor paths from both matches
  const survNodes = SURV.map((s, i) => {
    const p1 = match1.survPaths[i];
    const p2 = match2.survPaths[i];
    // bridge no gap: some no centro / idle
    const bridgePt = P(W / 2 + (i - 1.5) * 30, H / 2);
    const pts = [...p1.pts, bridgePt, bridgePt, ...p2.pts];
    const times = [...p1.times, match1.T.end + 0.5, match1.T.end + gap - 0.5, ...p2.times];

    const opacKeys = [];
    // some no sacrifício da match1
    const fadeEvents = [];
    if (p1.sacrificed && (o1 === '4k' || o1 === '3k' || o1 === 'trade' || o1 === 'hatch')) {
      fadeEvents.push({ t: match1.T.resolve, hide: true });
      fadeEvents.push({ t: match1.T.end + 1, hide: false }); // respawn trial 2
    }
    if (p2.sacrificed) {
      fadeEvents.push({ t: match2.T.resolve, hide: true });
    }

    let opacityAnim = '';
    if (fadeEvents.length) {
      // build opacity keyframes
      let vals = ['1'];
      let tms = ['0'];
      for (const fe of fadeEvents) {
        const tt = (fe.t / total).toFixed(4);
        vals.push(fe.hide ? '1' : '0', fe.hide ? '0' : '1');
        tms.push(tt, tt);
      }
      vals.push('1');
      tms.push('1');
      // simplify: always visible then hide at resolve of each sacrifice
      opacityAnim = `<animate attributeName="opacity" values="1;1;0;0;1;1;0;0;1"
        keyTimes="0;${(match1.T.resolve / total).toFixed(4)};${((match1.T.resolve + 0.8) / total).toFixed(4)};${((match1.T.end + 0.8) / total).toFixed(4)};${((match1.T.end + 1.2) / total).toFixed(4)};${(match2.T.resolve / total).toFixed(4)};${((match2.T.resolve + 0.8) / total).toFixed(4)};0.98;1"
        dur="${total}s" repeatCount="indefinite"/>`;
    }

    const terror =
      p1.chased || p2.chased
        ? `<circle r="15" fill="none" stroke="#9b2226" stroke-width="1.2" opacity="0.4">
            <animate attributeName="opacity" values="0.15;0.55;0.15" dur="1.1s" repeatCount="indefinite"/>
          </circle>`
        : '';

    return actorAnim(pts, times, total, `${terror}${survivorBody(s)}${opacityAnim}`);
  });

  // Killer merge
  const kBridge = P(W / 2, 80);
  const kPts = [...match1.killer.pts, kBridge, kBridge, ...match2.killer.pts];
  const kTimes = [...match1.killer.times, match1.T.end + 0.5, match1.T.end + gap - 0.5, ...match2.killer.times];
  // facão swings nos kicks/downs
  const swing = `
    <g>
      <animateTransform attributeName="transform" type="rotate"
        values="0;0;-60;0;0;-70;0;0;-60;0;0;-70;0"
        keyTimes="0;${(match1.T.kick / total).toFixed(4)};${((match1.T.kick + 0.3) / total).toFixed(4)};${((match1.T.kick + 0.8) / total).toFixed(4)};${(match1.T.down / total).toFixed(4)};${((match1.T.down + 0.25) / total).toFixed(4)};${((match1.T.down + 0.7) / total).toFixed(4)};${(match2.T.kick / total).toFixed(4)};${((match2.T.kick + 0.3) / total).toFixed(4)};${((match2.T.kick + 0.8) / total).toFixed(4)};${(match2.T.down / total).toFixed(4)};${((match2.T.down + 0.25) / total).toFixed(4)};1"
        dur="${total}s" repeatCount="indefinite"/>
      ${trapperBody()}
    </g>`;
  // stun stars no pallet
  const stun = `
    <g opacity="0">
      <animate attributeName="opacity" values="0;0;1;0;0;0;1;0;0" keyTimes="0;${(match1.T.pallet / total).toFixed(4)};${((match1.T.pallet + 0.1) / total).toFixed(4)};${((match1.T.pallet + 1.2) / total).toFixed(4)};${(match2.T.pallet / total).toFixed(4)};${((match2.T.pallet) / total).toFixed(4)};${((match2.T.pallet + 0.1) / total).toFixed(4)};${((match2.T.pallet + 1.2) / total).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
      <text y="-28" text-anchor="middle" font-size="12" fill="#f0c75e">✦ ✦</text>
    </g>`;

  const killerNode = actorAnim(kPts, kTimes, total, `${swing}${stun}`);

  // Gens: merge phases
  const genNodes = map.gens.map((g, i) => {
    const phases = [...match1.genPhases[i], ...match2.genPhases[i]];
    return genProp(g, i, total, phases);
  });

  const snap1 = match1.T.chaseStart + 2;
  const snap2 = match2.T.chaseStart + 2.5;

  const stamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight — duas trials aleatórias">
  <title>DbD — Trapper trials</title>
  <desc>${esc(`seed ${seed} · ${total}s · trial1=${o1} · trial2=${o2} · ${stamp}`)}</desc>
  <defs>
    <radialGradient id="fog" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1a1014"/>
      <stop offset="55%" stop-color="#120e12"/>
      <stop offset="100%" stop-color="#07080a"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#fog)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="#3d1f24"/>
  ${scenery(map)}
  ${genNodes.join('\n')}
  ${map.hooks.map(hookProp).join('\n')}
  ${map.traps.map((t, i) => trapProp(t, total, i === 0 ? snap1 : snap2)).join('\n')}
  ${gateProp(map.gateA, total, Math.min(match1.T.endgame, match2.T.endgame))}
  ${gateProp(map.gateB, total, match2.T.endgame)}
  <g transform="translate(${map.hatch.x},${map.hatch.y})">
    <rect x="-12" y="-12" width="24" height="24" fill="#12161c" stroke="#58a6ff" stroke-dasharray="3 2"/>
    <text y="4" text-anchor="middle" fill="#58a6ff" font-size="7" font-family="monospace">HATCH</text>
  </g>
  ${survNodes.join('\n')}
  ${killerNode}
  ${banners}
  <text x="16" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="11">DEAD BY DAYLIGHT · seed ${seed}</text>
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">trial A: ${o1} → trial B: ${o2} · ${total}s loop</text>
  <g transform="translate(${W - 90}, 20)">
    <polygon points="12,0 24,12 12,24 0,12" fill="none" stroke="#9b2226" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="3" fill="#9b2226">
      <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite"/>
    </circle>
  </g>
  <!-- heartbeat -->
  <g transform="translate(16, ${H - 14})">
    <text fill="#6e7681" font-size="8" font-family="monospace">HEARTBEAT</text>
    <rect x="64" y="-7" width="140" height="5" rx="2" fill="#21262d"/>
    <rect x="64" y="-7" height="5" rx="2" fill="#9b2226">
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
