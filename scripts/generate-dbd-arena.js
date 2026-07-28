/**
 * DbD v7 — simulação mais crível:
 * - gens bem espaçados; progresso SÓ sobe com survivor parado no slot
 * - colisão com gens/árvores/pedras/paredes/pallets
 * - andar resampleado por comprimento (sem teleporte)
 * - morto/escapado some (opacity 0)
 * - Trapper caça quem está reparando
 * - sem hatch / sem armadilhas
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;
const MAX_KEYS = 56;
const WALK = 36; // px/s
const SURV = [
  { id: 'D', fill: '#f0c75e' },
  { id: 'M', fill: '#ff6b8a' },
  { id: 'C', fill: '#6bcb77' },
  { id: 'J', fill: '#c4a574' },
];
const OUTCOMES = ['4k', '3k', 'gate', 'trade'];

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

function buildMap() {
  // Gens FIXOS e bem separados (não aleatórios grudados)
  const gens = [P(120, 100), P(350, 90), P(580, 100), P(800, 95), P(460, 240)];
  const walls = [
    { x: 220, y: 150, w: 70, h: 12 },
    { x: 500, y: 170, w: 80, h: 12 },
    { x: 680, y: 140, w: 60, h: 12 },
    { x: 300, y: 200, w: 12, h: 55 },
  ];
  const pallets = [P(250, 180), P(520, 200), P(720, 175), P(180, 230)];
  const trees = [
    P(90, 200), P(200, 70), P(420, 160), P(640, 250), P(760, 200), P(880, 160), P(300, 280), P(560, 60),
  ];
  const rocks = [P(160, 160), P(400, 210), P(650, 80), P(780, 250), P(500, 280)];
  const hideSpots = [P(95, 230), P(320, 270), P(540, 55), P(850, 220), P(700, 270)];
  const gate = P(W - 40, 160);

  const blockers = [
    ...gens.map((g) => ({ c: g, r: 28 })),
    ...trees.map((t) => ({ c: t, r: 16 })),
    ...rocks.map((r) => ({ c: r, r: 14 })),
    ...pallets.map((p) => ({ c: p, r: 18 })),
    ...walls.map((w) => ({ c: P(w.x + w.w / 2, w.y + w.h / 2), r: Math.max(w.w, w.h) * 0.55 })),
  ];

  return { gens, walls, pallets, trees, rocks, hideSpots, gate, blockers };
}

function avoid(p, blockers) {
  let q = P(clamp(p.x, 40, W - 40), clamp(p.y, 55, H - 35));
  for (let n = 0; n < 6; n++) {
    for (const b of blockers) {
      const d = dist(q, b.c);
      if (d < b.r) {
        if (d < 0.2) {
          q = P(b.c.x + b.r + 2, b.c.y);
        } else {
          const s = b.r / d;
          q = P(b.c.x + (q.x - b.c.x) * s, b.c.y + (q.y - b.c.y) * s);
        }
        q = P(clamp(q.x, 40, W - 40), clamp(q.y, 55, H - 35));
      }
    }
  }
  return q;
}

function slot(gen, i, blockers) {
  const angles = [1.2, -1.2, 2.5, -2.5, 0.6, -0.6];
  const a = angles[i % angles.length];
  return avoid(P(gen.x + Math.cos(a) * 34, gen.y + Math.sin(a) * 34), blockers);
}

function walk(from, to, blockers) {
  const a = avoid(from, blockers);
  const b = avoid(to, blockers);
  const d = dist(a, b);
  const steps = Math.max(2, Math.min(6, Math.ceil(d / 50)));
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // desvio suave perpendicular (não teleporte)
    const nx = -(b.y - a.y) / (d || 1);
    const ny = (b.x - a.x) / (d || 1);
    const bend = Math.sin(t * Math.PI) * rand(-10, 10);
    out.push(avoid(P(a.x + (b.x - a.x) * t + nx * bend, a.y + (b.y - a.y) * t + ny * bend), blockers));
  }
  return out;
}

/** Resample por comprimento de arco → movimento constante, sem pulos. */
function resample(points, times, maxKeys = MAX_KEYS) {
  const n = Math.min(points.length, times.length);
  if (n < 2) return { pts: points.slice(0, n), times: times.slice(0, n) };

  // acumular comprimento
  const seg = [0];
  for (let i = 1; i < n; i++) seg.push(seg[i - 1] + Math.max(0.01, dist(points[i - 1], points[i])));
  const totalLen = seg[n - 1];
  const t0 = times[0];
  const t1 = Math.max(times[n - 1], t0 + 0.1);
  const count = Math.min(maxKeys, Math.max(4, n));

  const pts = [];
  const ts = [];
  for (let k = 0; k < count; k++) {
    const u = k / (count - 1);
    const target = u * totalLen;
    let i = 1;
    while (i < n && seg[i] < target) i++;
    const i0 = Math.max(1, i) - 1;
    const i1 = Math.min(n - 1, i0 + 1);
    const span = seg[i1] - seg[i0] || 1;
    const f = clamp((target - seg[i0]) / span, 0, 1);
    pts.push(P(points[i0].x + (points[i1].x - points[i0].x) * f, points[i0].y + (points[i1].y - points[i0].y) * f));
    ts.push(t0 + u * (t1 - t0));
  }
  ts[0] = t0;
  ts[count - 1] = t1;
  for (let i = 1; i < count; i++) if (ts[i] <= ts[i - 1]) ts[i] = ts[i - 1] + 0.02;
  return { pts, times: ts };
}

function packTimes(secs) {
  const n = secs.length;
  if (n < 2) return '0;1';
  const t0 = secs[0];
  const span = Math.max(0.001, secs[n - 1] - t0);
  const raw = secs.map((s) => clamp((s - t0) / span, 0, 1));
  raw[0] = 0;
  for (let i = 1; i < n; i++) if (raw[i] <= raw[i - 1]) raw[i] = Math.min(0.999, raw[i - 1] + 0.008);
  raw[n - 1] = 1;
  return raw.map((t) => t.toFixed(4)).join(';');
}

function Actor(blockers, start) {
  this.blockers = blockers;
  this.pts = [avoid(start, blockers)];
  this.times = [0];
  this.t = 0;
}
Actor.prototype.go = function (p) {
  const steps = walk(this.pts[this.pts.length - 1], p, this.blockers);
  for (const s of steps) {
    this.t += Math.max(0.2, dist(this.pts[this.pts.length - 1], s) / WALK);
    this.pts.push(s);
    this.times.push(this.t);
  }
  return this;
};
Actor.prototype.wait = function (sec) {
  this.t += sec;
  this.pts.push({ ...this.pts[this.pts.length - 1] });
  this.times.push(this.t);
  return this;
};
Actor.prototype.shift = function (dt) {
  this.times = this.times.map((t) => t + dt);
  this.t += dt;
  return this;
};
Actor.prototype.out = function () {
  return resample(this.pts, this.times, MAX_KEYS);
};

function scenery(map) {
  let s = '';
  for (let x = 0; x < W; x += 40) {
    for (let y = 40; y < H; y += 40) {
      if (Math.random() < 0.22) s += `<rect x="${x}" y="${y}" width="40" height="40" fill="#12161c" opacity="0.25"/>`;
    }
  }
  for (const t of map.trees) {
    s += `<g transform="translate(${t.x},${t.y})" opacity="0.65">
      <rect x="-2" y="0" width="4" height="14" fill="#3d2b1f"/>
      <ellipse cy="-6" rx="12" ry="14" fill="#1e3a2f"/></g>`;
  }
  for (const r of map.rocks) {
    s += `<ellipse cx="${r.x}" cy="${r.y}" rx="11" ry="7" fill="#2a3038" stroke="#3d4450" opacity="0.8"/>`;
  }
  for (const w of map.walls) {
    s += `<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" rx="2" fill="#252b33" stroke="#3d4450"/>`;
  }
  for (const p of map.pallets) {
    s += `<rect x="${p.x - 18}" y="${p.y - 4}" width="36" height="8" rx="1" fill="#6b4f2e" stroke="#c4a574"/>
    <text x="${p.x}" y="${p.y + 18}" text-anchor="middle" fill="#6e7681" font-size="7" font-family="monospace">HIDE</text>`;
  }
  return s;
}

function movingActor(pack, total, inner, size = 50) {
  const kt = packTimes(pack.times);
  const xs = pack.pts.map((p) => (p.x - size / 2).toFixed(1)).join(';');
  const ys = pack.pts.map((p) => (p.y - size / 2).toFixed(1)).join(';');
  const x0 = (pack.pts[0].x - size / 2).toFixed(1);
  const y0 = (pack.pts[0].y - size / 2).toFixed(1);
  return `
  <svg x="${x0}" y="${y0}" width="${size}" height="${size}" overflow="visible">
    <animate attributeName="x" values="${xs}" keyTimes="${kt}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <animate attributeName="y" values="${ys}" keyTimes="${kt}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <g transform="translate(${size / 2},${size / 2})">${inner}</g>
  </svg>`;
}

function hpBar(total, hits) {
  const frames = [{ t: 0, hp: 1 }];
  let hp = 1;
  for (const h of (hits || []).slice().sort((a, b) => a.t - b.t)) {
    frames.push({ t: Math.max(frames[frames.length - 1].t + 0.1, h.t - 0.2), hp });
    hp = clamp(h.hpAfter, 0, 1);
    frames.push({ t: Math.max(h.t, frames[frames.length - 1].t + 0.05), hp });
  }
  frames.push({ t: total, hp });
  const widths = frames.map((f) => (20 * f.hp).toFixed(1)).join(';');
  const fills = frames.map((f) => (f.hp > 0.55 ? '#3fb950' : f.hp > 0.25 ? '#f0c75e' : '#ff4444')).join(';');
  const kt = packTimes(frames.map((f) => f.t));
  return `
    <rect x="-11" y="-28" width="22" height="4" rx="1" fill="#21262d" stroke="#30363d" stroke-width="0.5"/>
    <rect x="-11" y="-28" width="20" height="4" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${widths}" keyTimes="${kt}" dur="${total}s" repeatCount="indefinite"/>
      <animate attributeName="fill" values="${fills}" keyTimes="${kt}" dur="${total}s" repeatCount="indefinite"/>
    </rect>`;
}

function fadeAnim(total, goneT) {
  if (goneT == null || goneT >= total) return '';
  const a = clamp((goneT - 0.4) / total, 0, 0.98);
  const b = clamp(goneT / total, a + 0.01, 0.99);
  return `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>`;
}

function survBody(s, total, hits, goneT) {
  return `<g>
    ${fadeAnim(total, goneT)}
    ${hpBar(total, hits)}
    <ellipse cy="3" rx="8" ry="10" fill="${s.fill}" stroke="#0d1117" stroke-width="1.2"/>
    <circle cy="-11" r="5.5" fill="${s.fill}" stroke="#0d1117" stroke-width="1.2"/>
    <text y="4" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="#0d1117" font-family="Arial">${s.id}</text>
  </g>`;
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
      <animate attributeName="r" values="16;24;16" dur="2.2s" repeatCount="indefinite"/>
    </circle>`;
}

function genProp(g, i, total, windows) {
  // windows: [{t0,t1,from,to}] — progresso só muda nesses intervalos
  const kf = [{ t: 0, p: 0 }];
  let cur = 0;
  for (const w of windows) {
    kf.push({ t: w.t0, p: cur });
    cur = w.to;
    kf.push({ t: w.t1, p: cur });
  }
  kf.push({ t: total, p: cur });
  const cleaned = [];
  for (const k of kf) {
    if (!cleaned.length || k.t >= cleaned[cleaned.length - 1].t + 0.12) cleaned.push({ ...k });
    else cleaned[cleaned.length - 1] = { t: cleaned[cleaned.length - 1].t, p: k.p };
  }
  if (cleaned[cleaned.length - 1].t < total) cleaned.push({ t: total, p: cleaned[cleaned.length - 1].p });
  const widths = cleaned.map((k) => (28 * k.p).toFixed(1)).join(';');
  const kt = packTimes(cleaned.map((k) => k.t));
  return `
  <g transform="translate(${g.x},${g.y})">
    <circle r="24" fill="#0d1117" opacity="0.4"/>
    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="#1c2128" stroke="#6e7681" stroke-width="1.5"/>
    <rect x="-14" y="-8" width="28" height="8" rx="1" fill="#0d1117"/>
    <rect x="-11" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-25;-22" dur="2.3s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-24;-22" dur="2.6s" begin="0.35s" repeatCount="indefinite"/>
    </rect>
    <rect x="-16" y="14" width="32" height="5" rx="1" fill="#21262d"/>
    <rect x="-16" y="14" width="0" height="5" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${widths}" keyTimes="${kt}" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="34" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GEN ${i + 1}</text>
  </g>`;
}

function gateProp(g, total, openT) {
  const a = clamp(openT / total, 0.05, 0.96);
  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-12" y="-50" width="18" height="100" fill="#252b33" stroke="#6e7681"/>
    <rect x="-9" y="-47" width="12" height="94" fill="#3fb950" opacity="0.04">
      <animate attributeName="opacity" values="0.04;0.04;0.9;0.9" keyTimes="0;${a.toFixed(4)};${Math.min(0.999, a + 0.02).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="62" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GATE</text>
    <text y="-56" text-anchor="middle" font-size="8" font-family="monospace" fill="#484f58">
      <animate attributeName="fill" values="#484f58;#484f58;#3fb950;#3fb950" keyTimes="0;${a.toFixed(4)};${Math.min(0.999, a + 0.02).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
      OPEN
    </text>
  </g>`;
}

function banner(total, events) {
  return events
    .map((e) => {
      const a = Math.max(0, (e.t - 1) / total);
      const b = clamp(e.t / total, 0.02, 0.97);
      const c = Math.min(1, (e.t + 2.8) / total);
      const d = Math.min(1, (e.t + 4) / total);
      return `
  <g opacity="0">
    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${a.toFixed(4)};${b.toFixed(4)};${c.toFixed(4)};${d.toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    <rect x="${W / 2 - 220}" y="${H / 2 - 26}" width="440" height="52" rx="8" fill="#0d1117" stroke="${e.color}" stroke-width="2" opacity="0.94"/>
    <text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" fill="${e.color}" font-size="16" font-family="Georgia,serif" font-weight="700">${esc(e.text)}</text>
  </g>`;
    })
    .join('\n');
}

function scriptMatch(map, t0, outcome) {
  const { gens, blockers, hideSpots, pallets, gate } = map;
  const repairDur = rand(5.0, 6.5);

  // Cada gen → um survivor (5 gens, 4 surv: um faz 2)
  const owner = [0, 1, 2, 3, ri(0, 3)];
  const gensOf = SURV.map(() => []);
  gens.forEach((g, gi) => gensOf[owner[gi]].push({ g, gi }));

  const actors = SURV.map((_, si) => new Actor(blockers, nearSafeStart(gensOf[si][0]?.g || gens[0], blockers, si)));
  const hits = SURV.map(() => []);
  const goneAt = SURV.map(() => null);
  const genWins = gens.map(() => []);

  // --- Fase reparo: um gen por vez globalmente ajuda o Trapper a caçar, mas survivors paralelos ---
  // Cada survivor repara seus gens; Trapper escolhe alvos entre quem está reparando.
  const repairEvents = []; // {si, gi, t0, t1, slot}

  SURV.forEach((_, si) => {
    const a = actors[si];
    for (const { g, gi } of gensOf[si]) {
      const sl = slot(g, si, blockers);
      a.go(sl);
      const tStart = a.t;
      a.wait(repairDur);
      const tEnd = a.t;
      genWins[gi].push({ t0: tStart, t1: tEnd, from: 0, to: 1 });
      repairEvents.push({ si, gi, t0: tStart, t1: tEnd, slot: sl });
      // esconde um pouco
      if (Math.random() < 0.5) {
        a.go(hideSpots[si % hideSpots.length]);
        a.wait(rand(1.0, 1.8));
      }
    }
  });

  let allDoneT = 0;
  for (const ev of repairEvents) allDoneT = Math.max(allDoneT, ev.t1);

  // Trapper: caça quem está no gen (vai até o slot durante a janela de reparo)
  const killer = new Actor(blockers, avoid(P(W / 2, 70), blockers));
  killer.wait(0.8);
  const huntList = shuffle(repairEvents.slice());
  for (const ev of huntList.slice(0, Math.min(4, huntList.length))) {
    // chegar no meio do reparo
    const arrive = ev.t0 + (ev.t1 - ev.t0) * rand(0.35, 0.7);
    // avançar tempo do killer até perto de arrive (patrulha)
    while (killer.t < arrive - 2.5) {
      killer.go(avoid(P(rand(100, W - 100), rand(70, H - 50)), blockers));
      killer.wait(0.3);
      if (killer.pts.length > 40) break;
    }
    killer.go(ev.slot);
    killer.wait(0.6);
    // hit no survivor se ainda está na janela
    if (killer.t >= ev.t0 && killer.t <= ev.t1 + 1.5) {
      const hp1 = 0.5;
      hits[ev.si].push({ t: Math.max(killer.t, ev.t0 + 0.5), hpAfter: hp1 });
      // survivor foge (já programado depois do wait — ok visual)
    }
    killer.go(pallets[ev.si % pallets.length]);
    killer.wait(0.5);
  }

  // sincronizar: survivors esperam até allDone se ainda não chegaram
  SURV.forEach((_, si) => {
    const a = actors[si];
    if (a.t < allDoneT) {
      a.go(hideSpots[si % hideSpots.length]);
      a.wait(Math.max(0.4, allDoneT - a.t));
    }
  });

  const gateOpenT = allDoneT + 0.4;

  // Endgame após TODOS os gens 100%
  const dieSet = new Set();
  if (outcome === '4k') [0, 1, 2, 3].forEach((i) => dieSet.add(i));
  if (outcome === '3k') [0, 1, 2].forEach((i) => dieSet.add(i));
  if (outcome === 'trade') [0, 1].forEach((i) => dieSet.add(i));

  // Trapper caça no endgame
  for (const si of shuffle([0, 1, 2, 3])) {
    if (!dieSet.has(si) && outcome === 'gate') continue;
    killer.go(pallets[si % pallets.length]);
    killer.wait(0.45);
    if (dieSet.has(si)) {
      hits[si].push({ t: Math.max(actors[si].t, killer.t), hpAfter: 0 });
    } else if (outcome !== 'gate') {
      hits[si].push({ t: Math.max(actors[si].t, killer.t), hpAfter: 0.35 });
    }
  }

  SURV.forEach((_, si) => {
    const a = actors[si];
    if (dieSet.has(si)) {
      a.go(pallets[si % pallets.length]);
      a.wait(0.5);
      // garantir morte
      if (!hits[si].some((h) => h.hpAfter === 0)) hits[si].push({ t: a.t, hpAfter: 0 });
      goneAt[si] = a.t + 0.6;
      a.wait(0.8);
      // “some” — vai pra fora do mapa
      a.go(P(-40, a.pts[a.pts.length - 1].y));
      a.wait(0.3);
    } else {
      // escapa pelo portão (só depois de aberto)
      if (a.t < gateOpenT) a.wait(gateOpenT - a.t + 0.2);
      a.go(avoid(P(gate.x - 25, gate.y + (si - 1.5) * 12), blockers));
      a.wait(0.8);
      goneAt[si] = a.t;
      a.go(P(W + 50, gate.y + (si - 1.5) * 12));
      a.wait(0.4);
    }
  });

  killer.go(avoid(P(gate.x - 80, gate.y), blockers));
  killer.wait(1.2);

  // shift
  for (const a of actors) a.shift(t0);
  killer.shift(t0);

  const genWindows = genWins.map((wins) =>
    wins.map((w) => ({
      t0: w.t0 + t0,
      t1: w.t1 + t0,
      to: 1,
    }))
  );

  // Se kick visual: não vamos regredir mais (evita “completar sozinho” estranho)

  const survData = actors.map((a, si) => {
    const pack = a.out();
    return {
      pack,
      hits: hits[si].map((h) => ({ t: h.t + t0, hpAfter: h.hpAfter })),
      goneAt: goneAt[si] != null ? goneAt[si] + t0 : null,
      endT: a.t,
    };
  });

  const kPack = killer.out();
  const matchEnd = Math.max(killer.t, ...survData.map((s) => s.endT)) + 0.5;

  return {
    outcome,
    survData,
    killer: kPack,
    genWindows,
    matchEnd,
    gateOpenT: gateOpenT + t0,
    resolveT: matchEnd - 1.5,
  };
}

function nearSafeStart(gen, blockers, si) {
  return avoid(P(gen.x + rand(-60, 60), gen.y + rand(40, 80)), blockers);
}

function generate() {
  const seed = Date.now().toString(36);
  const map = buildMap();
  let o1 = pick(OUTCOMES);
  let o2 = pick(OUTCOMES.filter((o) => o !== o1));
  if (!['4k', '3k'].includes(o1) && !['4k', '3k'].includes(o2)) o2 = pick(['4k', '3k']);

  const m1 = scriptMatch(map, 0, o1);
  const gap = 2.5;
  const m2 = scriptMatch(map, m1.matchEnd + gap, o2);
  const total = +(m2.matchEnd + 1).toFixed(2);

  const labels = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2 DOWN / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'ALL GENS DONE — GATE ESCAPE', color: '#3fb950' },
  };

  const survNodes = SURV.map((s, i) => {
    const p1 = m1.survData[i];
    const p2 = m2.survData[i];
    // bridge suave
    const mid = new Actor(map.blockers, p1.pack.pts[p1.pack.pts.length - 1]);
    mid.t = p1.pack.times[p1.pack.times.length - 1];
    mid.times = [mid.t];
    mid.pts = [p1.pack.pts[p1.pack.pts.length - 1]];
    mid.go(P(W / 2 + (i - 1.5) * 36, H / 2));
    mid.wait(0.8);
    mid.go(p2.pack.pts[0]);
    const midOut = mid.out();
    const pts = [...p1.pack.pts, ...midOut.pts.slice(1), ...p2.pack.pts.slice(1)];
    const times = [...p1.pack.times, ...midOut.times.slice(1), ...p2.pack.times.slice(1)];
    const pack = resample(pts, times, MAX_KEYS);
    // gone: primeiro evento de sumiço
    const gone = p1.goneAt != null ? p1.goneAt : p2.goneAt;
    return movingActor(pack, total, survBody(s, total, [...p1.hits, ...p2.hits], gone), 50);
  });

  const kMid = new Actor(map.blockers, m1.killer.pts[m1.killer.pts.length - 1]);
  kMid.t = m1.killer.times[m1.killer.times.length - 1];
  kMid.times = [kMid.t];
  kMid.pts = [m1.killer.pts[m1.killer.pts.length - 1]];
  kMid.go(P(W / 2, 75));
  kMid.wait(0.6);
  kMid.go(m2.killer.pts[0]);
  const kMidOut = kMid.out();
  const kPack = resample(
    [...m1.killer.pts, ...kMidOut.pts.slice(1), ...m2.killer.pts.slice(1)],
    [...m1.killer.times, ...kMidOut.times.slice(1), ...m2.killer.times.slice(1)],
    MAX_KEYS
  );
  const killerNode = movingActor(kPack, total, trapperBody(), 58);

  const genNodes = map.gens.map((g, i) =>
    genProp(g, i, total, [...(m1.genWindows[i] || []), ...(m2.genWindows[i] || [])])
  );

  const stamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena">
  <title>DbD v7</title>
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
  ${gateProp(map.gate, total, m1.gateOpenT)}
  ${gateProp(P(map.gate.x, map.gate.y + 70), total, m2.gateOpenT)}
  ${survNodes.join('\n')}
  ${killerNode}
  ${banner(total, [
    { t: m1.resolveT, ...labels[o1] },
    { t: m2.resolveT, ...labels[o2] },
  ])}
  <text x="16" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="11">DEAD BY DAYLIGHT · seed ${seed}</text>
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">repair only on gen · all 100% → gate · ${o1} → ${o2}</text>
</svg>
`;
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const svg = generate();
  for (const n of ['dbd-arena.svg', 'dbd-arena-dark.svg', 'foice-frutas.svg', 'foice-frutas-dark.svg']) {
    fs.writeFileSync(path.join(outDir, n), svg, 'utf8');
  }
  console.log('OK', Buffer.byteLength(svg), 'bytes');
}

main();
