/**
 * DbD arena:
 * - Trapper se move (keyframes limitados — SMIL quebra com 200+ pontos)
 * - Todos os gens a 100% antes do portão abrir / fuga
 * - Sem hatch e sem armadilhas
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;
const GEN_R = 26;
const SLOT = 32;
const WALK_SPEED = 42;
const MAX_KEYS = 64; // limite seguro p/ SMIL em <img>

const SURV = [
  { id: 'D', fill: '#f0c75e' },
  { id: 'M', fill: '#ff6b8a' },
  { id: 'C', fill: '#6bcb77' },
  { id: 'J', fill: '#c4a574' },
];
const OUTCOMES = ['4k', '3k', 'gate', 'trade']; // sem hatch

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

function workSlot(gen, slotIdx = 0) {
  const angles = [90, 270, 0, 180, 45, 135].map((d) => (d * Math.PI) / 180);
  const a = angles[slotIdx % angles.length];
  return P(clamp(gen.x + Math.cos(a) * SLOT, 45, W - 45), clamp(gen.y + Math.sin(a) * SLOT, 58, H - 38));
}
function kickSlot(gen) {
  return workSlot(gen, 1);
}
function avoidGens(p, gens) {
  let q = { ...p };
  for (let iter = 0; iter < 5; iter++) {
    for (const g of gens) {
      const d = dist(q, g);
      const minR = GEN_R + 6;
      if (d < minR) {
        if (d < 0.1) q = workSlot(g, ri(0, 3));
        else {
          const s = minR / d;
          q = P(g.x + (q.x - g.x) * s, g.y + (q.y - g.y) * s);
        }
      }
    }
  }
  return P(clamp(q.x, 45, W - 45), clamp(q.y, 58, H - 38));
}
function nearSafe(p, gens, r = 36) {
  return avoidGens(P(p.x + rand(-r, r), p.y + rand(-r, r)), gens);
}

function walkSteps(from, to, gens) {
  const d = dist(from, to);
  const steps = Math.max(2, Math.min(8, Math.ceil(d / 45))); // poucos passos
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const j = i > 0 && i < steps ? rand(-8, 8) : 0;
    out.push(avoidGens(P(from.x + (to.x - from.x) * t + j, from.y + (to.y - from.y) * t + j * 0.3), gens));
  }
  return out;
}

/** Reduz keyframes para <= maxKeys, preservando início/fim e ordem temporal. */
function decimate(points, times, maxKeys = MAX_KEYS) {
  const n = Math.min(points.length, times.length);
  if (n <= maxKeys) {
    return { pts: points.slice(0, n), times: times.slice(0, n) };
  }
  const pts = [points[0]];
  const ts = [times[0]];
  const inner = maxKeys - 2;
  for (let i = 1; i <= inner; i++) {
    const idx = Math.round((i / (inner + 1)) * (n - 1));
    pts.push(points[idx]);
    ts.push(times[idx]);
  }
  pts.push(points[n - 1]);
  ts.push(times[n - 1]);
  // garantir tempos crescentes
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] <= ts[i - 1]) ts[i] = ts[i - 1] + 0.05;
  }
  return { pts, times: ts };
}

function packTimes(secs, total) {
  const n = secs.length;
  if (n < 2) return { keyTimes: '0;1' };
  // redistribui proporcional ao tempo real, forçando 0..1 estrito
  const t0 = secs[0];
  const span = Math.max(0.001, secs[n - 1] - t0);
  const raw = secs.map((s) => clamp((s - t0) / span, 0, 1));
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    if (raw[i] <= raw[i - 1]) raw[i] = Math.min(0.999, raw[i - 1] + 1 / (n * 2));
  }
  raw[n - 1] = 1;
  return { keyTimes: raw.map((t) => t.toFixed(4)).join(';') };
}

function Timeline(gens) {
  this.gens = gens;
  this.pts = [];
  this.times = [];
  this.t = 0;
}
Timeline.prototype.at = function (p) {
  const q = avoidGens(p, this.gens);
  if (!this.pts.length) {
    this.pts.push(q);
    this.times.push(this.t);
    return this;
  }
  for (const s of walkSteps(this.pts[this.pts.length - 1], q, this.gens)) {
    const d = dist(this.pts[this.pts.length - 1], s);
    this.t += Math.max(0.15, d / WALK_SPEED);
    this.pts.push(s);
    this.times.push(this.t);
  }
  return this;
};
Timeline.prototype.wait = function (sec) {
  if (!this.pts.length) return this;
  const last = this.pts[this.pts.length - 1];
  this.t += sec;
  this.pts.push({ ...last });
  this.times.push(this.t);
  return this;
};
Timeline.prototype.shift = function (t0) {
  this.times = this.times.map((t) => t + t0);
  this.t += t0;
  return this;
};
Timeline.prototype.packed = function () {
  return decimate(this.pts, this.times, MAX_KEYS);
};

function buildMap() {
  const gens = shuffle([P(160, 120), P(380, 95), P(600, 125), P(790, 105), P(480, 235)]);
  const pallets = shuffle([P(270, 165), P(500, 175), P(700, 160), P(200, 215)]).slice(0, 4);
  const hideSpots = [P(100, 205), P(320, 255), P(550, 65), P(750, 255), P(430, 185), P(860, 185)].map((p) =>
    avoidGens(p, gens)
  );
  const trees = Array.from({ length: 10 }, () => avoidGens(P(rand(70, W - 70), rand(70, H - 45)), gens));
  const rocks = Array.from({ length: 6 }, () => avoidGens(P(rand(80, W - 80), rand(80, H - 45)), gens));
  return { gens, pallets, hideSpots, trees, rocks, gateA: P(W - 42, 115), gateB: P(W - 42, 230) };
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
      <ellipse cy="-6" rx="11" ry="13" fill="#1e3a2f"/></g>`;
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

function movingActor(points, timesSec, total, inner, size = 50) {
  const d = decimate(points, timesSec, MAX_KEYS);
  const { keyTimes } = packTimes(d.times, total);
  const xs = d.pts.map((p) => (p.x - size / 2).toFixed(1)).join(';');
  const ys = d.pts.map((p) => (p.y - size / 2).toFixed(1)).join(';');
  const x0 = (d.pts[0].x - size / 2).toFixed(1);
  const y0 = (d.pts[0].y - size / 2).toFixed(1);
  // sanity: keyTimes count
  const nkt = keyTimes.split(';').length;
  if (nkt !== d.pts.length) {
    // fallback evenly spaced
    const even = d.pts.map((_, i) => (i / (d.pts.length - 1)).toFixed(4)).join(';');
    return mover(x0, y0, size, xs, ys, even, total, inner);
  }
  return mover(x0, y0, size, xs, ys, keyTimes, total, inner);
}
function mover(x0, y0, size, xs, ys, keyTimes, total, inner) {
  return `
  <svg x="${x0}" y="${y0}" width="${size}" height="${size}" overflow="visible">
    <animate attributeName="x" values="${xs}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <animate attributeName="y" values="${ys}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" calcMode="linear"/>
    <g transform="translate(${size / 2},${size / 2})">${inner}</g>
  </svg>`;
}

function hpBar(total, hits) {
  const safeHits = (hits || []).slice().sort((a, b) => a.t - b.t);
  const frames = [{ t: 0, hp: 1 }];
  let hp = 1;
  for (const h of safeHits) {
    const ht = Math.max(0.08, h.t);
    frames.push({ t: Math.max(frames[frames.length - 1].t + 0.08, ht - 0.25), hp });
    hp = clamp(h.hpAfter, 0, 1);
    frames.push({ t: ht, hp });
  }
  frames.push({ t: total, hp });
  const widths = frames.map((f) => Math.max(0, 20 * f.hp).toFixed(1)).join(';');
  const fills = frames.map((f) => (f.hp > 0.55 ? '#3fb950' : f.hp > 0.25 ? '#f0c75e' : '#ff4444')).join(';');
  const { keyTimes } = packTimes(
    frames.map((f) => f.t),
    total
  );
  return `
    <rect x="-11" y="-28" width="22" height="4" rx="1" fill="#21262d" stroke="#30363d" stroke-width="0.5"/>
    <rect x="-11" y="-28" width="20" height="4" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite"/>
      <animate attributeName="fill" values="${fills}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite"/>
    </rect>`;
}

function survBody(s, total, hits) {
  return `${hpBar(total, hits)}
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
      <animate attributeName="r" values="16;24;16" dur="2.2s" repeatCount="indefinite"/>
    </circle>`;
}

function genProp(g, i, total, repairWindows) {
  const keyframes = [{ t: 0, p: 0 }];
  let cur = 0;
  for (const w of repairWindows) {
    keyframes.push({ t: w.t0, p: cur });
    cur = w.to;
    keyframes.push({ t: w.t1, p: cur });
  }
  keyframes.push({ t: total, p: cur });
  const cleaned = [];
  for (const k of keyframes) {
    if (!cleaned.length || k.t > cleaned[cleaned.length - 1].t + 0.1) cleaned.push({ ...k });
    else cleaned[cleaned.length - 1].p = k.p;
  }
  if (cleaned[cleaned.length - 1].t < total - 0.01) cleaned.push({ t: total, p: cleaned[cleaned.length - 1].p });
  const widths = cleaned.map((k) => (28 * k.p).toFixed(1)).join(';');
  const { keyTimes } = packTimes(
    cleaned.map((k) => k.t),
    total
  );
  const done = cur >= 0.999;
  return `
  <g transform="translate(${g.x},${g.y})">
    <circle r="${GEN_R - 4}" fill="#0d1117" opacity="0.35"/>
    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="#1c2128" stroke="${done ? '#3fb950' : '#6e7681'}" stroke-width="1.5"/>
    <rect x="-14" y="-8" width="28" height="8" rx="1" fill="#0d1117"/>
    <rect x="-11" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-25;-22" dur="2.2s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-22" width="6" height="12" fill="#8b949e">
      <animate attributeName="y" values="-22;-24;-22" dur="2.5s" begin="0.4s" repeatCount="indefinite"/>
    </rect>
    <rect x="-16" y="14" width="32" height="5" rx="1" fill="#21262d"/>
    <rect x="-16" y="14" width="0" height="5" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="34" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GEN ${i + 1}</text>
  </g>`;
}

function gateProp(g, total, openSec) {
  const a = clamp(openSec / total, 0.05, 0.97);
  return `
  <g transform="translate(${g.x},${g.y})">
    <rect x="-12" y="-44" width="16" height="88" fill="#252b33" stroke="#6e7681"/>
    <!-- portão fechado (escuro) → abre (verde) só depois dos gens 100% -->
    <rect x="-9" y="-41" width="10" height="82" fill="#3fb950" opacity="0.05">
      <animate attributeName="opacity" values="0.05;0.05;0.85;0.85" keyTimes="0;${a.toFixed(4)};${Math.min(0.999, a + 0.015).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
    </rect>
    <text y="54" text-anchor="middle" fill="#7d8590" font-size="8" font-family="monospace">GATE</text>
    <text y="-50" text-anchor="middle" fill="#484f58" font-size="7" font-family="monospace">
      <animate attributeName="fill" values="#484f58;#484f58;#3fb950;#3fb950" keyTimes="0;${a.toFixed(4)};${Math.min(0.999, a + 0.015).toFixed(4)};1" dur="${total}s" repeatCount="indefinite"/>
      OPEN
    </text>
  </g>`;
}

/**
 * Match: cada survivor repara gens até TODOS estarem 100%.
 * Só então o portão abre e (se outcome gate/trade) fogem.
 * Trapper patrulha, chuta, caça e bate várias vezes.
 */
function scriptMatch(map, t0, outcome) {
  const gens = map.gens;
  const nGen = gens.length;
  // quem repara qual gen (cobertura total)
  const assignments = gens.map((_, gi) => gi % SURV.length);

  const repairByGen = gens.map(() => []);
  const order = shuffle([0, 1, 2, 3]);
  const huntOrder = order.slice();

  // Fase 1 — reparo de TODOS os gens (sobreviventes visitam em sequência)
  const survTls = SURV.map(() => new Timeline(gens));
  const hitsBySurv = SURV.map(() => []);

  // tempo de reparo por gen
  const repairDur = rand(4.2, 5.5);

  // Round-robin: para cada gen, o survivor designado vai, para, completa 100%
  let globalT = 0;
  // sincronizar aproximado: cada survivor faz seus gens em ordem
  const gensPerSurv = SURV.map((_, si) => gens.map((g, gi) => ({ g, gi })).filter((_, gi) => assignments[gi] === si));

  // Ensure every gen assigned — fix assignments so each gen has exactly one worker
  // already gi % 4 — with 5 gens, survivors 0-3 get gens, gen 4 goes to surv 0. Good all covered.

  SURV.forEach((_, si) => {
    const tl = survTls[si];
    const myGens = gensPerSurv[si];
    const start = nearSafe(myGens[0] ? workSlot(myGens[0].g, si) : map.hideSpots[si], gens, 50);
    tl.at(start);

    for (const { g, gi } of myGens) {
      const slot = workSlot(g, si);
      tl.at(slot);
      const t0r = tl.t;
      tl.wait(repairDur);
      const t1r = tl.t;
      repairByGen[gi].push({ t0: t0r, t1: t1r, to: 1 }); // 100%
      // chance de esconder se não for o último gen
      if (Math.random() < 0.45) {
        tl.at(map.hideSpots[si % map.hideSpots.length]);
        tl.wait(rand(1.2, 2.0));
      }
    }
  });

  // Momento em que TODOS os gens estão 100% = max dos t1 de reparo
  let allGensDoneT = 0;
  for (const wins of repairByGen) {
    for (const w of wins) allGensDoneT = Math.max(allGensDoneT, w.t1);
  }

  // Fase 2 — após gens prontos: gate abre; fuga OU massacre
  SURV.forEach((_, si) => {
    const tl = survTls[si];
    // esperar até allGensDoneT (ficar escondido / idle)
    const hide = map.hideSpots[si % map.hideSpots.length];
    if (tl.t < allGensDoneT) {
      tl.at(hide);
      tl.wait(Math.max(0.3, allGensDoneT - tl.t));
    }

    const canEscape = outcome === 'gate' || (outcome === 'trade' && si >= 2) || (outcome === '3k' && si === 3);
    const willDie = outcome === '4k' || (outcome === '3k' && si < 3) || (outcome === 'trade' && si < 2);

    if (canEscape && !willDie) {
      // portão liberado
      tl.at(nearSafe(map.gateA, gens, 14));
      tl.wait(1.5);
    } else {
      // chase / down perto do gate ou pallet
      const pallet = map.pallets[si % map.pallets.length];
      tl.at(nearSafe(pallet, gens, 12));
      tl.wait(0.4);
      hitsBySurv[si].push({ t: tl.t, hpAfter: 0.5 });
      tl.wait(0.8);
      tl.at(nearSafe(map.pallets[(si + 1) % map.pallets.length], gens, 10));
      hitsBySurv[si].push({ t: tl.t, hpAfter: willDie ? 0 : 0.25 });
      tl.wait(willDie ? 2.5 : 1.2);
      if (!willDie) {
        tl.at(nearSafe(map.gateA, gens, 16));
        tl.wait(1);
      }
    }
  });

  // Killer timeline — se move com poucos waypoints
  const k = new Timeline(gens);
  k.at(nearSafe(gens[2], gens, 50));
  k.wait(1);
  // visita gens sendo reparados (kick em 2 gens)
  for (const gi of shuffle([0, 1, 2, 3, 4]).slice(0, 2)) {
    k.at(kickSlot(gens[gi]));
    k.wait(0.8);
    // regressão leve se ainda não completo
    const wins = repairByGen[gi];
    if (wins.length && k.t < wins[0].t1) {
      // kick durante reparo → empurra to para baixo depois
      wins.push({ t0: k.t - 0.3, t1: k.t, to: 0.55, kick: true });
    }
  }
  // caça sobreviventes
  for (const si of huntOrder) {
    k.at(nearSafe(map.pallets[si % map.pallets.length], gens, 10));
    k.wait(0.7);
    k.at(nearSafe(map.hideSpots[si % map.hideSpots.length], gens, 12));
    k.wait(0.55);
  }
  // endgame no gate
  k.at(nearSafe(map.gateA, gens, 40));
  k.wait(1.5);
  k.at(nearSafe(gens[0], gens, 35));
  k.wait(0.8);

  // shift all by t0
  for (const tl of survTls) tl.shift(t0);
  k.shift(t0);
  allGensDoneT += t0;

  // Rebuild gen windows: each gen must end at 100%
  // If kick interrupted, add final repair to 100% after
  const genWindowsAbs = repairByGen.map((wins, gi) => {
    const sorted = wins
      .map((w) => ({ t0: w.t0 + t0, t1: w.t1 + t0, to: w.to, kick: w.kick }))
      .sort((a, b) => a.t0 - b.t0);
    // force final to 1.0
    if (!sorted.length) {
      sorted.push({ t0: t0 + 2, t1: t0 + 2 + repairDur, to: 1 });
    } else {
      const last = sorted[sorted.length - 1];
      if (last.to < 1) {
        sorted.push({
          t0: last.t1 + 0.5,
          t1: last.t1 + 0.5 + repairDur * 0.6,
          to: 1,
        });
        allGensDoneT = Math.max(allGensDoneT, last.t1 + 0.5 + repairDur * 0.6);
      } else {
        allGensDoneT = Math.max(allGensDoneT, last.t1);
      }
    }
    // normalize progressive from→to chain for display
    let cur = 0;
    return sorted.map((w) => {
      let to = w.kick ? Math.min(cur, w.to) : Math.max(cur, w.to);
      if (!w.kick) to = w.to >= 1 ? 1 : Math.max(cur + 0.1, w.to);
      // kick regresses
      if (w.kick) to = Math.max(0.1, cur - 0.2);
      const row = { t0: w.t0, t1: w.t1, to };
      cur = to;
      return row;
    });
  });

  // Re-ensure last frame of each gen is 1
  for (const wins of genWindowsAbs) {
    if (!wins.length) continue;
    const last = wins[wins.length - 1];
    if (last.to < 1) {
      wins.push({ t0: last.t1 + 0.3, t1: last.t1 + repairDur * 0.5, to: 1 });
      allGensDoneT = Math.max(allGensDoneT, last.t1 + repairDur * 0.5);
    }
  }

  const survData = survTls.map((tl, si) => {
    const pack = tl.packed();
    return {
      pts: pack.pts,
      times: pack.times,
      hits: hitsBySurv[si].map((h) => ({ t: h.t + t0, hpAfter: h.hpAfter })),
      endT: tl.t,
    };
  });

  const kPack = k.packed();
  const matchEnd = Math.max(k.t, ...survData.map((s) => s.endT), allGensDoneT + 3);

  return {
    outcome,
    survData,
    killer: { pts: kPack.pts, times: kPack.times },
    genWindows: genWindowsAbs,
    matchEnd,
    gateOpenT: allGensDoneT, // portão só abre aqui
    resolveT: matchEnd - 2,
  };
}

function banner(total, events) {
  return events
    .map((e) => {
      const a = Math.max(0, (e.t - 1.2) / total);
      const b = clamp(e.t / total, 0.02, 0.97);
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

  const match1 = scriptMatch(map, 0, o1);
  const gap = 3;
  const match2 = scriptMatch(map, match1.matchEnd + gap, o2);
  const total = +(match2.matchEnd + 1.2).toFixed(2);

  const labels = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2 DOWN / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'ALL GENS DONE — GATE ESCAPE', color: '#3fb950' },
  };

  const survNodes = SURV.map((s, i) => {
    const p1 = match1.survData[i];
    const p2 = match2.survData[i];
    const bridge = P(W / 2 + (i - 1.5) * 40, H / 2);
    const mid = new Timeline(map.gens);
    mid.pts = [{ ...p1.pts[p1.pts.length - 1] }];
    mid.times = [p1.times[p1.times.length - 1]];
    mid.t = p1.times[p1.times.length - 1];
    mid.at(bridge);
    mid.wait(1);
    mid.at(p2.pts[0]);
    const midP = mid.packed();
    const pts = [...p1.pts, ...midP.pts.slice(1), ...p2.pts.slice(1)];
    const times = [...p1.times, ...midP.times.slice(1), ...p2.times.slice(1)];
    return movingActor(pts, times, total, survBody(s, total, [...p1.hits, ...p2.hits]), 50);
  });

  const k1 = match1.killer;
  const k2 = match2.killer;
  const kMid = new Timeline(map.gens);
  kMid.pts = [{ ...k1.pts[k1.pts.length - 1] }];
  kMid.times = [k1.times[k1.times.length - 1]];
  kMid.t = k1.times[k1.times.length - 1];
  kMid.at(P(W / 2, 80));
  kMid.wait(0.8);
  kMid.at(k2.pts[0]);
  const kMidP = kMid.packed();
  const kPts = [...k1.pts, ...kMidP.pts.slice(1), ...k2.pts.slice(1)];
  const kTimes = [...k1.times, ...kMidP.times.slice(1), ...k2.times.slice(1)];
  const killerNode = movingActor(kPts, kTimes, total, trapperBody(), 58);

  const genNodes = map.gens.map((g, i) => {
    const wins = [...(match1.genWindows[i] || []), ...(match2.genWindows[i] || [])];
    return genProp(g, i, total, wins);
  });

  const stamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena">
  <title>DbD — all gens then gate</title>
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
  ${gateProp(map.gateA, total, match1.gateOpenT)}
  ${gateProp(map.gateB, total, match2.gateOpenT)}
  ${survNodes.join('\n')}
  ${killerNode}
  ${banner(total, [
    { t: match1.resolveT, ...labels[o1] },
    { t: match2.resolveT, ...labels[o2] },
  ])}
  <text x="16" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="11">DEAD BY DAYLIGHT · seed ${seed}</text>
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">all gens 100% → gate opens · ${o1} → ${o2} · ${total}s</text>
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
