/**
 * DbD arena — andar suave (sem teleporte), HP cheia no início, Trapper agressivo.
 * Movimento: muitos waypoints + tempo ∝ distância. Anima x/y no <svg> aninhado.
 */
const fs = require('fs');
const path = require('path');

const W = 920;
const H = 320;
const GEN_R = 26;
const SLOT = 32;
const WALK_SPEED = 38; // px/s — calmo
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

/** Interpola caminhada suave entre A e B (vários passos, sem pular). */
function walkSteps(from, to, gens) {
  const d = dist(from, to);
  const steps = Math.max(2, Math.ceil(d / 28));
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // leve curva aleatória no meio
    const midJitter = i > 0 && i < steps ? rand(-12, 12) : 0;
    const p = P(from.x + (to.x - from.x) * t + midJitter * (1 - Math.abs(t - 0.5) * 2), from.y + (to.y - from.y) * t + midJitter * 0.4);
    out.push(avoidGens(p, gens));
  }
  return out;
}

function packTimes(secs, total) {
  const n = secs.length;
  if (n < 2) return { keyTimes: '0;1' };
  const raw = secs.map((s) => clamp(s / total, 0, 0.999));
  raw[0] = 0;
  for (let i = 1; i < n; i++) {
    if (raw[i] <= raw[i - 1]) raw[i] = Math.min(0.998, raw[i - 1] + 0.004);
  }
  raw[n - 1] = 1;
  for (let i = n - 2; i >= 1; i--) {
    if (raw[i] >= raw[i + 1]) raw[i] = Math.max(raw[i - 1] + 0.002, raw[i + 1] - 0.002);
  }
  raw[0] = 0;
  raw[n - 1] = 1;
  return { keyTimes: raw.map((t) => t.toFixed(4)).join(';') };
}

/** Timeline builder: pontos + tempos crescentes com velocidade constante. */
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
  const steps = walkSteps(this.pts[this.pts.length - 1], q, this.gens);
  for (const s of steps) {
    const d = dist(this.pts[this.pts.length - 1], s);
    this.t += d / WALK_SPEED;
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

function buildMap() {
  const gens = shuffle([P(160, 120), P(380, 95), P(600, 125), P(790, 105), P(480, 235)]);
  const pallets = shuffle([P(270, 165), P(500, 175), P(700, 160), P(200, 215)]).slice(0, 4);
  const hideSpots = [P(100, 205), P(320, 255), P(550, 65), P(750, 255), P(430, 185), P(860, 185)].map((p) =>
    avoidGens(p, gens)
  );
  const trees = Array.from({ length: 10 }, () => avoidGens(P(rand(70, W - 70), rand(70, H - 45)), gens));
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

/** HP sempre começa CHEIA (20px). Só cai nos hits. */
function hpBar(total, hits) {
  const safeHits = (hits || []).slice().sort((a, b) => a.t - b.t);
  const frames = [{ t: 0, hp: 1 }];
  let hp = 1;
  for (const h of safeHits) {
    const ht = Math.max(0.05, h.t);
    frames.push({ t: Math.max(frames[frames.length - 1].t + 0.05, ht - 0.2), hp });
    hp = clamp(h.hpAfter, 0, 1);
    frames.push({ t: ht, hp });
  }
  frames.push({ t: total, hp });

  const widths = frames.map((f) => Math.max(0, 20 * f.hp).toFixed(1)).join(';');
  const fills = frames
    .map((f) => (f.hp > 0.55 ? '#3fb950' : f.hp > 0.25 ? '#f0c75e' : '#ff4444'))
    .join(';');
  const { keyTimes } = packTimes(
    frames.map((f) => f.t),
    total
  );

  return `
    <rect x="-11" y="-28" width="22" height="4" rx="1" fill="#21262d" stroke="#30363d" stroke-width="0.5"/>
    <rect x="-11" y="-28" width="20" height="4" rx="1" fill="#3fb950">
      <animate attributeName="width" values="${widths}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
      <animate attributeName="fill" values="${fills}" keyTimes="${keyTimes}" dur="${total}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
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
    if (!cleaned.length || k.t > cleaned[cleaned.length - 1].t + 0.08) cleaned.push({ ...k });
    else cleaned[cleaned.length - 1].p = k.p;
  }
  if (cleaned[cleaned.length - 1].t < total - 0.01) cleaned.push({ t: total, p: cleaned[cleaned.length - 1].p });

  const widths = cleaned.map((k) => (28 * k.p).toFixed(1)).join(';');
  const { keyTimes } = packTimes(
    cleaned.map((k) => k.t),
    total
  );

  return `
  <g transform="translate(${g.x},${g.y})">
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
    <rect x="-16" y="14" width="0" height="5" rx="1" fill="#3fb950">
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

function scriptMatch(map, t0, outcome) {
  const gens = map.gens;
  const order = shuffle([0, 1, 2, 3]);
  const primaryTarget = order[0];
  const secondaryTargets = order.slice(1, 1 + ri(2, 3)); // Trapper bate em 2–3 extras

  const repairByGen = gens.map(() => []);
  const survData = SURV.map((s, i) => {
    const tl = new Timeline(gens);
    const gen = gens[i % gens.length];
    const gen2 = gens[(i + 2) % gens.length];
    const slot = workSlot(gen, i);
    const slot2 = workSlot(gen2, i);
    const hide = map.hideSpots[i % map.hideSpots.length];
    const start = nearSafe(slot, gens, 70);

    tl.at(start);
    tl.at(slot);
    const r1a = tl.t;
    tl.wait(rand(3.5, 5.5)); // repara calmo
    const r1b = tl.t;
    repairByGen[i % gens.length].push({ t0: r1a, t1: r1b, to: rand(0.28, 0.4) });

    // terror / esconde
    tl.at(hide);
    tl.wait(rand(2.2, 3.5));

    // segundo gen
    tl.at(slot2);
    const r2a = tl.t;
    tl.wait(rand(3.2, 5.0));
    const r2b = tl.t;
    const wantFull = outcome === 'gate' || (outcome === 'trade' && i >= 2) || (outcome === 'hatch' && i === 3);
    repairByGen[(i + 2) % gens.length].push({ t0: r2a, t1: r2b, to: wantFull ? rand(0.9, 1) : rand(0.45, 0.65) });

    const hits = [];
    let hp = 1;

    // chase: se for alvo, Trapper encosta e bate
    const isPrimary = i === primaryTarget;
    const isSecondary = secondaryTargets.includes(i);

    if (isPrimary || isSecondary) {
      const pallet = map.pallets[i % map.pallets.length];
      tl.at(nearSafe(pallet, gens, 14));
      tl.wait(0.4);
      // hit 1
      hp = isPrimary ? 0.5 : 0.7;
      hits.push({ t: tl.t, hpAfter: hp });
      tl.wait(rand(0.8, 1.4));

      if (isPrimary || Math.random() < 0.75) {
        tl.at(nearSafe(map.pallets[(i + 1) % map.pallets.length], gens, 16));
        tl.wait(0.35);
        hp = isPrimary ? 0.15 : Math.max(0.2, hp - 0.35);
        hits.push({ t: tl.t, hpAfter: hp });
        tl.wait(rand(0.6, 1.1));
      }

      if (isPrimary && (outcome === '4k' || outcome === '3k' || outcome === 'hatch' || (outcome === 'trade' && i < 2))) {
        tl.at(nearSafe(pallet, gens, 8));
        hp = 0;
        hits.push({ t: tl.t, hpAfter: 0 });
        tl.wait(rand(2.5, 4)); // no chão
      }
    } else {
      tl.at(hide);
      tl.wait(rand(1.5, 2.5));
    }

    // endgame
    const dead = hp <= 0 || outcome === '4k' || (outcome === '3k' && i < 3 && isPrimary);
    const escapeHatch = outcome === 'hatch' && i === 3 && hp > 0;
    const escapeGate =
      !dead &&
      hp > 0 &&
      (outcome === 'gate' || (outcome === 'trade' && i >= 2) || (outcome === '3k' && i === 3) || escapeHatch === false && outcome === 'gate');

    if (escapeHatch) {
      tl.at(nearSafe(map.hatch, gens, 8));
      tl.wait(1.2);
    } else if (outcome === 'gate' || (outcome === 'trade' && i >= 2 && hp > 0) || (outcome === '3k' && i === 3 && hp > 0)) {
      tl.at(nearSafe(map.gateA, gens, 10));
      tl.wait(1.2);
    } else if (hp <= 0) {
      tl.wait(rand(1.5, 2.5));
    } else if (outcome === '4k') {
      // Trapper ainda pega os outros
      tl.at(nearSafe(map.pallets[i % map.pallets.length], gens, 10));
      hits.push({ t: tl.t, hpAfter: 0 });
      tl.wait(2);
    } else {
      tl.at(slot2);
      tl.wait(1);
    }

    tl.shift(t0);
    return { pts: tl.pts, times: tl.times, hits: hits.map((h) => ({ t: h.t + t0, hpAfter: h.hpAfter })), endT: tl.t };
  });

  // Killer agressivo: visita vários sobreviventes e aplica hits
  const k = new Timeline(gens);
  k.at(nearSafe(gens[2], gens, 55));
  k.wait(1.2);
  // aproxima do gen do alvo primário enquanto repara
  const primGen = gens[primaryTarget % gens.length];
  k.at(nearSafe(workSlot(primGen, 0), gens, 40));
  k.wait(0.6);
  k.at(kickSlot(primGen));
  k.wait(0.9); // kick
  // regressão
  const gi = primaryTarget % gens.length;
  if (repairByGen[gi].length) {
    const last = repairByGen[gi][repairByGen[gi].length - 1];
    repairByGen[gi].push({
      t0: k.t - 0.5,
      t1: k.t,
      to: Math.max(0.05, (last.to || 0.3) - 0.18),
    });
  }

  // caça o primary
  const primaryPath = survData[primaryTarget];
  // approx: vai aos pallets onde o alvo foge
  k.at(nearSafe(map.pallets[0], gens, 10));
  k.wait(0.5);
  k.at(nearSafe(map.pallets[primaryTarget % map.pallets.length], gens, 8));
  k.wait(0.7); // hit 1
  k.at(nearSafe(map.pallets[(primaryTarget + 1) % map.pallets.length], gens, 10));
  k.wait(0.7); // hit 2 / down

  // bate nos secundários
  for (const sid of secondaryTargets) {
    k.at(nearSafe(map.hideSpots[sid % map.hideSpots.length], gens, 12));
    k.wait(0.55);
    k.at(nearSafe(map.pallets[sid % map.pallets.length], gens, 10));
    k.wait(0.65);
  }

  if (outcome === '4k') {
    for (const sid of shuffle([0, 1, 2, 3])) {
      k.at(nearSafe(map.pallets[sid % map.pallets.length], gens, 8));
      k.wait(0.5);
    }
  } else if (outcome === 'gate' || outcome === 'hatch') {
    k.at(nearSafe(map.gateA, gens, 50));
    k.wait(1.2);
  } else {
    k.at(nearSafe(gens[1], gens, 30));
    k.wait(1);
  }

  k.shift(t0);

  // normalizar to dos gens
  const genWindows = repairByGen.map((wins) => {
    let cur = 0;
    return wins.map((w) => {
      const to = Math.min(1, Math.max(cur + 0.05, w.to));
      const out = { t0: w.t0 + t0, t1: w.t1 + t0, to };
      // wait - repair windows already need absolute times. surv repair used tl before shift!
      return out;
    });
  });

  // FIX: repair windows were recorded BEFORE shift on survivor timelines.
  // They used tl.t before shift — need to add t0.
  // Actually in surv loop, r1a/r1b were before shift, then tl.shift(t0) — repair pushed with pre-shift times.
  // So genWindows mapping adds t0 again above — good for repairByGen times which are pre-shift.

  // Recalculate repair windows properly with t0
  const genWindowsAbs = repairByGen.map((wins) => {
    let cur = 0;
    return wins.map((w) => {
      const to = Math.min(1, Math.max(cur + 0.02, w.to));
      const row = { t0: w.t0 + t0, t1: w.t1 + t0, to };
      cur = to;
      return row;
    });
  });

  const matchEnd = Math.max(k.t, ...survData.map((s) => s.endT));

  return {
    outcome,
    survData,
    killer: { pts: k.pts, times: k.times },
    genWindows: genWindowsAbs,
    matchEnd,
    resolveT: matchEnd - 2.5,
  };
}

function banner(total, events) {
  return events
    .map((e) => {
      const a = Math.max(0, (e.t - 1.2) / total);
      const b = clamp(e.t / total, 0.01, 0.98);
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
  const gap = 3.5;
  const match2 = scriptMatch(map, match1.matchEnd + gap, o2);
  const total = +(match2.matchEnd + 1.5).toFixed(2);

  const labels = {
    '4k': { text: 'THE ENTITY HUNGERS — 4K', color: '#ff4444' },
    '3k': { text: 'TRAPPER DOMINATES — 3K', color: '#ff6b35' },
    trade: { text: 'BITTERSWEET — 2 DOWN / 2 ESCAPED', color: '#f0c75e' },
    gate: { text: 'SURVIVORS ESCAPED — GATE', color: '#3fb950' },
    hatch: { text: 'ONE ESCAPED THROUGH THE HATCH', color: '#58a6ff' },
  };

  const survNodes = SURV.map((s, i) => {
    const p1 = match1.survData[i];
    const p2 = match2.survData[i];
    const bridge = P(W / 2 + (i - 1.5) * 40, H / 2);
    // caminhar até o bridge em vez de teleportar
    const mid = new Timeline(map.gens);
    mid.pts = [{ ...p1.pts[p1.pts.length - 1] }];
    mid.times = [p1.times[p1.times.length - 1]];
    mid.t = p1.times[p1.times.length - 1];
    mid.at(bridge);
    mid.wait(1.2);
    mid.at(p2.pts[0]);

    const pts = [...p1.pts, ...mid.pts.slice(1), ...p2.pts.slice(1)];
    const times = [...p1.times, ...mid.times.slice(1), ...p2.times.slice(1)];
    const hits = [...p1.hits, ...p2.hits];
    return movingActor(pts, times, total, survBody(s, total, hits), 50);
  });

  const k1 = match1.killer;
  const k2 = match2.killer;
  const kMid = new Timeline(map.gens);
  kMid.pts = [{ ...k1.pts[k1.pts.length - 1] }];
  kMid.times = [k1.times[k1.times.length - 1]];
  kMid.t = k1.times[k1.times.length - 1];
  kMid.at(P(W / 2, 75));
  kMid.wait(1);
  kMid.at(k2.pts[0]);
  const kPts = [...k1.pts, ...kMid.pts.slice(1), ...k2.pts.slice(1)];
  const kTimes = [...k1.times, ...kMid.times.slice(1), ...k2.times.slice(1)];
  const killerNode = movingActor(kPts, kTimes, total, trapperBody(), 58);

  const genNodes = map.gens.map((g, i) => {
    const wins = [...(match1.genWindows[i] || []), ...(match2.genWindows[i] || [])];
    return genProp(g, i, total, wins);
  });

  const stamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena">
  <title>DbD — walk, repair, hide, hunt</title>
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
  ${gateProp(map.gateA, total, match1.resolveT)}
  ${gateProp(map.gateB, total, match2.resolveT)}
  <g transform="translate(${map.hatch.x},${map.hatch.y})">
    <rect x="-12" y="-12" width="24" height="24" fill="#12161c" stroke="#58a6ff" stroke-dasharray="3 2"/>
    <text y="4" text-anchor="middle" fill="#58a6ff" font-size="7" font-family="monospace">HATCH</text>
  </g>
  ${survNodes.join('\n')}
  ${killerNode}
  ${banner(total, [
    { t: match1.resolveT, ...labels[o1] },
    { t: match2.resolveT, ...labels[o2] },
  ])}
  <text x="16" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="11">DEAD BY DAYLIGHT · seed ${seed}</text>
  <text x="16" y="36" fill="#7d8590" font-family="ui-monospace,Consolas,monospace" font-size="9">walk → repair → hide → hunt · ${o1} → ${o2} · ${total}s</text>
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
