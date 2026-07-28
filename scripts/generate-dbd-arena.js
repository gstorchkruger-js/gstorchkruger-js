/**
 * DbD arena — coreografia jogável (sem atravessar gens):
 * - survivor PARA no slot ao lado do gen para reparar
 * - progresso do gen só sobe nessa janela
 * - killer perto → fogem / se escondem
 * - sem ganchos; barras de vida; movimento lento
 * Anima via <svg x/y> (compatível com <img> no GitHub).
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;
const GEN_R = 26; // raio de colisão do gerador
const SLOT = 30; // distância do slot de trabalho ao centro do gen

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
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Slot de trabalho ao REDOR do gen (não no centro — evita atravessar). */
function workSlot(gen, slotIdx = 0) {
  const angles = [90, 270, 0, 180, 45, 135].map((d) => (d * Math.PI) / 180);
  const a = angles[slotIdx % angles.length];
  return P(
    clamp(gen.x + Math.cos(a) * SLOT, 40, W - 40),
    clamp(gen.y + Math.sin(a) * SLOT, 55, H - 35)
  );
}

function kickSlot(gen) {
  return workSlot(gen, 1);
}

/** Desvia de gens: se o ponto cai dentro do raio, empurra para fora. */
function avoidGens(p, gens, extra = []) {
  let q = { ...p };
  const blockers = [...gens, ...extra];
  for (let iter = 0; iter < 4; iter++) {
    for (const g of blockers) {
      const d = dist(q, g);
      const minR = (g.r || GEN_R) + 4;
      if (d < minR && d > 0.01) {
        const s = minR / d;
        q = P(g.x + (q.x - g.x) * s, g.y + (q.y - g.y) * s);
      } else if (d < 0.01) {
        q = workSlot(g, ri(0, 3));
      }
    }
  }
  return P(clamp(q.x, 40, W - 40), clamp(q.y, 55, H - 35));
}

function nearSafe(p, gens, r = 40) {
  return avoidGens(P(p.x + rand(-r, r), p.y + rand(-r, r)), gens);
}

function packTimes(secs, total) {
  const n = secs.length;
  if (n < 2) return { keyTimes: '0;1' };
  const raw = secs.map((s) => clamp(s / total, 0, 0.999));
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    if (raw[i] <= raw[i - 1]) raw[i] = Math.min(0.998, raw[i - 1] + 0.012);
  }
  raw[n - 1] = 1;
  for (let i = n - 2; i >= 1; i--) {
    if (raw[i] >= raw[i + 1]) raw[i] = Math.max(raw[i - 1] + 0.006, raw[i + 1] - 0.006);
  }
  raw[0] = 0;
  raw[n - 1] = 1;
  return { keyTimes: raw.map((t) => t.toFixed(4)).join(';') };
}

function buildMap() {
  // Gens bem separados para não colidir entre si
  const gens = shuffle([
    P(160, 120),
    P(380, 95),
    P(600, 125),
    P(790, 105),
    P(480, 230),
  ]);
  const pallets = shuffle([P(270, 160), P(500, 170), P(700, 155), P(200, 210)]).slice(0, 4);
  const hideSpots = [
    P(100, 200),
    P(320, 250),
    P(550, 60),
    P(750, 250),
    P(430, 180),
    P(860, 180),
  ].map((p) => avoidGens(p, gens));
  const trees = Array.from({ length: 10 }, () => avoidGens(P(rand(70, W - 70), rand(70, H - 45)), gens, gens.map((g) => ({ ...g, r: 35 }))));
  const rocks = Array.from({ length: 6 }, () => avoidGens(P(rand(80, W - 80), rand(80, H - 45)), gens));
  return {
    gens,
    pallets,
    hideSpots,
    trees,
    rocks,
    gateA: P(W - 42, 115),
    gateB: P(W - 42, 230),
    hatch: avoidGens(P(85, H - 55), gens),
  };
}

function scenery(map) {
  let s = '';
  for (let x = 0; x < W; x += 40) {
    for (let y = 40; y < H; y += 40) {
      if (Math.random() < 0.28) s += `<rect x="${x}" y="${y}" width="40" height="40" fill="#12161c" opacity="0.28"/>`;
    }
  }
  for (const t of map.trees) {
    s += `<g transform="translate(${t.x},${t.y})" opacity="0.6">
      <rect x="-2" y="0" width="4" height="14" fill="#3d2b1f"/>
      <ellipse cy="-6" rx="11" ry="13" fill="#1e3a2f"/>
    </g>`;
  }
  for (const r of map.rocks) {
    s += `<ellipse cx="${r.x}" cy="${r.y}" rx="${ri(8, 13)}" ry="${ri(5, 8)}" fill="#2a3038" stroke="#3d4450" opacity="0.75"/>`;
  }
  for (const [x, y, w, h] of [
    [240, 130, 55, 10],
    [520, 200, 70, 10],
    [680, 120, 50, 10],
    [350, 200, 10, 45],
  ]) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#252b33" stroke="#3d4450"/>`;
  }
  for (const p of map.pallets) {
    s += `<rect x="${p.x - 18}" y="${p.y - 4}" width="36" height="8" rx="1" fill="#6b4f2e" stroke="#c4a574"/>
    <text x="${p.x}" y="${p.y + 18}" text-anchor="middle" fill="#6e7681" font-size="7" font-family="monospace">HIDE</text>`;
  }
  return s;
}

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

/** Barra de vida pequena acima do personagem */
function hpBar(total, hits) {
  // hits: [{t, hpAfter 0..1}]
  const phases = [{ t: 0, hp: 1 }, ...hits, { t: total * 0.999, hp: hits.length ? hits[hits.length - 1].hpAfter : 1 }];
  // rebuild
  const pts = [{ t: 0, hp: 1 }];
  for (const h of hits) {
    pts.push({ t: Math.max(0, h.t - 0.15), hp: pts[pts.length - 1].hp });
    pts.push({ t: h.t, hp: h.hpAfter });
  }
  pts.push({ t: total, hp: pts[pts.length - 1].hp });
  const widths = pts.map((p) => (20 * p.hp).toFixed(1)).join(';');
  const { keyTimes } = packTimes(
    pts.map((p) => p.t),
    total
  );
  const color = pts[pts.length - 1].hp > 0.5 ? '#3fb950' : pts[pts.length - 1].hp > 0.2 ? '#f0c75e' : '#ff4444';
  return `
    <rect x="-11" y="-28" width="22" height="4" rx="1" fill="#21262d" stroke="#30363d" stroke-width="0.5"/>
    <rect x="-11" y="-28" height="4" rx="1" fill="#3fb950" width="20">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" repeatCount="indefinite"/>
      <animate attributeName="fill" values="#3fb950;#3fb950;#f0c75e;#ff4444;#ff4444" keyTimes="0;0.35;0.55;0.75;1" dur="${total}s" repeatCount="indefinite"/>
    </rect>`;
}

function survBody(s, total, hits) {
  return `
    ${hpBar(total, hits)}
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
    <circle r="20" fill="none" stroke="#9b2226" stroke-width="1" opacity="0.35">
      <animate attributeName="r" values="16;24;16" dur="2.4s" repeatCount="indefinite"/>
    </circle>`;
}

/**
 * Progresso do gen: PLATÔS — só sobe em janelas [tStart,tEnd] em que alguém está reparando.
 * Fora disso fica parado (não completa sozinho).
 */
function genProp(g, i, total, repairWindows) {
  // repairWindows: [{t0, t1, from, to}] ordered
  const keyframes = [{ t: 0, p: 0 }];
  let cur = 0;
  for (const w of repairWindows) {
    keyframes.push({ t: w.t0, p: cur });
    cur = w.to;
    keyframes.push({ t: w.t1, p: cur });
  }
  keyframes.push({ t: total, p: cur });
  // dedupe / grow times
  const cleaned = [];
  for (const k of keyframes) {
    if (!cleaned.length || k.t > cleaned[cleaned.length - 1].t + 0.05) cleaned.push(k);
    else cleaned[cleaned.length - 1] = { t: cleaned[cleaned.length - 1].t, p: k.p };
  }
  if (cleaned[cleaned.length - 1].t < total) cleaned.push({ t: total, p: cleaned[cleaned.length - 1].p });

  const widths = cleaned.map((k) => (28 * k.p).toFixed(1)).join(';');
  const { keyTimes } = packTimes(
    cleaned.map((k) => k.t),
    total
  );

  return `
  <g transform="translate(${g.x},${g.y})">
    <!-- corpo sólido (colisão visual) -->
    <circle r="${GEN_R - 4}" fill="#0d1117" opacity="0.35"/>
    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="#1c2128" stroke="#6e7681" stroke-width="1.5"/>
    <rect x="-14" y="-8" width="28" height="8" rx="1" fill="#0d1117"/>
    <rect x="-11" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-25;-22" dur="2.2s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-24;-22" dur="2.5s" begin="0.4s" repeatCount="indefinite"/>
    </rect>
    <rect x="-16" y="14" width="32" height="5" rx="1" fill="#21262d"/>
    <rect x="-16" y="14" height="5" rx="1" fill="#3fb950" width="0">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="34" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GEN ${i + 1}</text>
  </g>`;
}

function gateProp(g, total, openSec) {
  const a = clamp(openSec / total, 0, 0.98);
  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-10" y="-42" width="14" height="84" fill="#252b33" stroke="#6e7681"/>
    <rect x="-7" y="-39" width="8" height="78" fill="#3fb950" opacity="0.08">
      <animate attributeName="opacity" values="0.08;0.08;0.7;0.7" keyTimes="0;${a.toFixed(4)};${Math.min(0.999, a + 0.02).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="52" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GATE</text>
  </g>`;
}

/**
 * Uma trial: reparo real (parado no slot) → killer chega → esconde → chase lenta → hit (HP) → escape ou morte.
 */
function scriptMatch(map, t0, matchLen, outcome) {
  const gens = map.gens;
  const chased = ri(0, 3);
  const T = {
    goGen: t0 + matchLen * 0.02,
    repair1: t0 + matchLen * 0.08,
    repair1end: t0 + matchLen * 0.22, // ~14% da trial parado no gen
    terror: t0 + matchLen * 0.24, // killer se aproxima
    hide: t0 + matchLen * 0.28,
    hideEnd: t0 + matchLen * 0.36,
    repair2: t0 + matchLen * 0.4,
    repair2end: t0 + matchLen * 0.52,
    chase: t0 + matchLen * 0.56,
    hit: t0 + matchLen * 0.66,
    resolve: t0 + matchLen * 0.82,
    end: t0 + matchLen,
  };

  const assignedGen = gens.map((_, i) => gens[i % gens.length]);
  // cada survivor tem um gen primário
  const primary = SURV.map((_, i) => gens[i % gens.length]);
  const hideFor = SURV.map((_, i) => map.hideSpots[i % map.hideSpots.length]);

  // Janelas de reparo por gen (só quando alguém está no slot)
  const repairByGen = gens.map(() => []);

  const survPaths = SURV.map((s, i) => {
    const pts = [];
    const times = [];
    const add = (sec, p) => {
      times.push(sec);
      pts.push(avoidGens(p, gens));
    };
    const hold = (sec0, sec1, p) => {
      add(sec0, p);
      add(sec1, p); // PARADO
    };

    const gen = primary[i];
    const slot = workSlot(gen, i);
    const hide = hideFor[i];
    const gen2 = gens[(i + 2) % gens.length];
    const slot2 = workSlot(gen2, i);

    // vai ao gen (caminho fora do centro)
    add(t0, nearSafe(slot, gens, 55));
    add(T.goGen, nearSafe(slot, gens, 20));
    hold(T.repair1, T.repair1end, slot); // consertando
    repairByGen[gens.indexOf(gen)].push({
      t0: T.repair1,
      t1: T.repair1end,
      from: 0,
      to: 0.35 + i * 0.04,
    });

    // killer perto → ESCONDE
    add(T.terror, nearSafe(hide, gens, 15));
    hold(T.hide, T.hideEnd, hide);

    // volta a reparar outro gen
    add(T.repair2 - matchLen * 0.02, nearSafe(slot2, gens, 25));
    hold(T.repair2, T.repair2end, slot2);
    repairByGen[gens.indexOf(gen2)].push({
      t0: T.repair2,
      t1: T.repair2end,
      from: 0.35,
      to: outcome === 'gate' || outcome === 'hatch' || outcome === 'trade' ? 0.85 + (i === 0 ? 0.15 : 0) : 0.55,
    });

    // chase / hit
    if (i === chased) {
      add(T.chase, nearSafe(map.pallets[0], gens, 10));
      add(T.hit, nearSafe(map.pallets[1 % map.pallets.length], gens, 20));
    } else {
      add(T.chase, hide);
      add(T.hit, nearSafe(hide, gens, 12));
    }

    // desfecho
    const dead = outcome === '4k' || (outcome === '3k' && i < 3) || (outcome === 'trade' && i < 2) || (outcome === 'hatch' && i < 3);
    const escapeGate = outcome === 'gate' || (outcome === 'trade' && i >= 2) || (outcome === '3k' && i === 3);
    const escapeHatch = outcome === 'hatch' && i === 3;

    if (dead && i === chased) {
      hold(T.resolve, T.end, nearSafe(map.pallets[0], gens, 8)); // caído
    } else if (escapeHatch) {
      add(T.resolve, nearSafe(map.hatch, gens, 10));
      hold(T.resolve + matchLen * 0.04, T.end, nearSafe(map.hatch, gens, 4));
    } else if (escapeGate || outcome === 'gate') {
      add(T.resolve, nearSafe(map.gateA, gens, 20));
      hold(T.resolve + matchLen * 0.04, T.end, nearSafe(map.gateA, gens, 6));
    } else if (dead) {
      hold(T.resolve, T.end, nearSafe(hide, gens, 8));
    } else {
      hold(T.resolve, T.end, slot2);
    }

    for (let k = 1; k < times.length; k++) {
      if (times[k] <= times[k - 1]) times[k] = times[k - 1] + 0.5;
    }

    // HP hits
    const hits = [];
    if (i === chased) hits.push({ t: T.hit, hpAfter: 0.5 });
    if (dead) hits.push({ t: T.resolve, hpAfter: 0 });
    else if (i === chased) hits.push({ t: T.resolve, hpAfter: 0.5 });

    return { pts, times, hits };
  });

  // Killer: patrulha longe → aproxima do gen em reparo → kick slot → chase → hit → camp/gate
  const kPts = [];
  const kTimes = [];
  const kAdd = (sec, p) => {
    kTimes.push(sec);
    kPts.push(avoidGens(p, gens));
  };
  const targetGen = primary[chased];
  kAdd(t0, nearSafe(gens[2], gens, 50));
  kAdd(T.repair1, nearSafe(gens[3 % gens.length], gens, 40)); // longe enquanto reparan
  kAdd(T.terror, nearSafe(kickSlot(targetGen), gens, 8)); // chega perto → terror
  kAdd(T.hide, kickSlot(targetGen)); // kick no slot (não atravessa)
  kAdd(T.hideEnd, nearSafe(kickSlot(targetGen), gens, 15));
  kAdd(T.repair2, nearSafe(gens[1], gens, 45)); // perde eles
  kAdd(T.chase, nearSafe(map.pallets[0], gens, 12));
  kAdd(T.hit, nearSafe(map.pallets[0], gens, 8));
  kAdd(T.resolve, nearSafe(outcome.includes('k') || outcome === 'trade' ? map.pallets[1 % map.pallets.length] : map.gateA, gens, 30));
  kAdd(T.end, nearSafe(gens[0], gens, 40));

  for (let k = 1; k < kTimes.length; k++) {
    if (kTimes[k] <= kTimes[k - 1]) kTimes[k] = kTimes[k - 1] + 0.55;
  }

  // Normalizar progresso dos gens (from/to encadeado)
  const genWindows = repairByGen.map((wins) => {
    let cur = 0;
    return wins.map((w) => {
      const to = Math.min(1, Math.max(cur, w.to));
      const out = { t0: w.t0, t1: w.t1, from: cur, to };
      cur = to;
      return out;
    });
  });

  // Kick: regride um pouco o gen alvo
  const gi = gens.indexOf(targetGen);
  if (gi >= 0) {
    const wins = genWindows[gi];
    // inserir regressão após terror
    const last = wins.length ? wins[wins.length - 1].to : 0.3;
    genWindows[gi].push({
      t0: T.hide,
      t1: T.hide + matchLen * 0.03,
      from: last,
      to: Math.max(0.05, last - 0.2),
    });
  }

  return { outcome, T, survPaths, killer: { pts: kPts, times: kTimes }, genWindows, chased };
}

function banner(total, events) {
  return events
    .map((e) => {
      const a = Math.max(0, (e.t - 1.2) / total);
      const b = e.t / total;
      const c = Math.min(1, (e.t + 3) / total);
      const d = Math.min(1, (e.t + 4.2) / total);
      return `
  <g opacity="0">
    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};${d.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    <rect x="${W / 2 - 220}" y="${H / 2 - 26}" width="440" height="52" rx="8" fill="#0d1117" stroke="${e.color}" stroke-width="2" opacity="0.94"/>
    <text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" fill="${e.color}" font-size="16" font-family="Georgia,serif" font-weight="700">${esc(e.text)}</text>
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

  // Trials mais longas = mais lentas
  const m1Len = rand(48, 58);
  const gap = 4;
  const m2Len = rand(48, 58);
  const total = +(m1Len + gap + m2Len).toFixed(2);

  const match1 = scriptMatch(map, 0, m1Len, o1);
  const match2 = scriptMatch(map, m1Len + gap, m2Len, o2);

  const labels = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2 DOWN / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'SURVIVORS ESCAPED — GATE', color: '#3fb950' },
    hatch: { text: 'ONE ESCAPED THROUGH THE HATCH', color: '#58a6ff' },
  };

  const survNodes = SURV.map((s, i) => {
    const p1 = match1.survPaths[i];
    const p2 = match2.survPaths[i];
    const bridge = P(W / 2 + (i - 1.5) * 40, H / 2);
    const pts = [...p1.pts, bridge, bridge, ...p2.pts];
    const times = [...p1.times, match1.T.end + 0.5, match1.T.end + gap - 0.5, ...p2.times];
    const hits = [
      ...p1.hits,
      ...p2.hits.map((h) => ({ t: h.t, hpAfter: h.hpAfter })),
    ];
    return movingActor(pts, times, total, survBody(s, total, hits), 50);
  });

  const kBridge = P(W / 2, 72);
  const kPts = [...match1.killer.pts, kBridge, kBridge, ...match2.killer.pts];
  const kTimes = [...match1.killer.times, match1.T.end + 0.5, match1.T.end + gap - 0.5, ...match2.killer.times];
  const killerNode = movingActor(kPts, kTimes, total, trapperBody(), 58);

  const genNodes = map.gens.map((g, i) => {
    const wins = [...(match1.genWindows[i] || []), ...(match2.genWindows[i] || [])];
    return genProp(g, i, total, wins);
  });

  const stamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena">
  <title>DbD — repair, hide, chase</title>
  <desc>${esc(`seed ${seed} · ${total}s · ${o1}→${o2} · ${stamp}`)}</desc>
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
  ${gateProp(map.gateA, total, match1.T.resolve)}
  ${gateProp(map.gateB, total, match2.T.resolve)}
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
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">repair → hide → chase · ${o1} → ${o2} · ${total}s</text>
  <g transform="translate(16, ${H - 14})">
    <text fill="#6e7681" font-size="8" font-family="monospace">HEARTBEAT</text>
    <rect x="64" y="-7" width="140" height="5" rx="2" fill="#21262d"/>
    <rect x="64" y="-7" height="5" rx="2" fill="#9b2226" width="30">
      <animate attributeName="width" values="15;95;28;110;20;80;15" dur="8s" repeatCount="indefinite"/>
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
