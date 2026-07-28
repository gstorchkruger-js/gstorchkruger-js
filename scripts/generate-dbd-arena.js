/**
 * Arena Dead by Daylight simplificada (SVG + SMIL).
 * Cada execução sorteia layout, rotas e timing — parece uma partida, não um loop óbvio.
 * Sem JS no SVG (GitHub README / <img>).
 */
const fs = require('fs');
const path = require('path');

const W = 900;
const H = 280;
const PAD = 28;

const SURVIVOR_COLORS = [
  { fill: '#f0c75e', name: 'D' }, // Dwight-ish
  { fill: '#ff6b8a', name: 'M' }, // Meg-ish
  { fill: '#6bcb77', name: 'C' }, // Claudette-ish
  { fill: '#c4a574', name: 'J' }, // Jake-ish
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function pt(x, y) {
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
}
function rndPt() {
  return pt(rand(PAD + 20, W - PAD - 20), rand(PAD + 36, H - PAD - 20));
}
function near(p, r = 40) {
  return pt(
    clamp(p.x + rand(-r, r), PAD + 16, W - PAD - 16),
    clamp(p.y + rand(-r, r), PAD + 30, H - PAD - 16)
  );
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function translateValues(points) {
  return points.map((p) => `${p.x} ${p.y}`).join('; ');
}
function keyTimes(n) {
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)).toFixed(3)).join('; ');
}
function splines(n) {
  return Array(Math.max(1, n)).fill('0.4 0 0.2 1').join('; ');
}
function holdPath(p, n = 3) {
  return Array.from({ length: n }, () => ({ ...p }));
}

/** Layout fixo-aleatório da partida */
function buildMap() {
  const gens = shuffle([
    pt(140, 90),
    pt(320, 70),
    pt(520, 95),
    pt(700, 75),
    pt(430, 180),
    pt(200, 190),
    pt(760, 175),
  ]).slice(0, 5);

  const hooks = shuffle([
    pt(80, 150),
    pt(450, 50),
    pt(820, 130),
    pt(600, 200),
    pt(280, 210),
  ]).slice(0, 4);

  const traps = [near(pick(gens), 55), near(pick(hooks), 50)];
  const gate = pt(W - 50, H / 2);
  const hatch = pt(PAD + 30, H - 50);

  return { gens, hooks, traps, gate, hatch };
}

function genNode(g, i, matchDur) {
  const workPulse = rand(1.4, 2.2).toFixed(2);
  const kickAt = rand(0.25, 0.55).toFixed(3);
  const kickEnd = (parseFloat(kickAt) + 0.06).toFixed(3);
  const finishAt = rand(0.72, 0.9).toFixed(3);

  // Barra de progresso: sobe, cai no kick, sobe de novo, completa
  const progressValues = `0;0.35;0.55;0.22;0.5;0.85;1;1`;
  const progressTimes = `0;0.18;${kickAt};${kickEnd};0.62;${finishAt};0.95;1`;

  return `
  <g transform="translate(${g.x},${g.y})" id="gen-${i}">
    <!-- base -->
    <rect x="-16" y="-10" width="32" height="20" rx="3" fill="#2a2f38" stroke="#6e7681" stroke-width="1"/>
    <rect x="-12" y="-6" width="24" height="6" rx="1" fill="#1a1f26"/>
    <!-- pistões -->
    <rect x="-10" y="-18" width="5" height="10" fill="#8b949e">
      <animate attributeName="y" values="-18;-22;-18" dur="${workPulse}s" repeatCount="indefinite"/>
    </rect>
    <rect x="5" y="-18" width="5" height="10" fill="#8b949e">
      <animate attributeName="y" values="-18;-21;-18" dur="${(parseFloat(workPulse) + 0.3).toFixed(2)}s" begin="0.2s" repeatCount="indefinite"/>
    </rect>
    <!-- faísca do kick -->
    <circle r="3" fill="#ff6b35" opacity="0">
      <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${kickAt};${(parseFloat(kickAt)+0.02).toFixed(3)};${kickEnd};1" dur="${matchDur}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="2;2;10;2;2" keyTimes="0;${kickAt};${(parseFloat(kickAt)+0.03).toFixed(3)};${kickEnd};1" dur="${matchDur}s" repeatCount="indefinite"/>
    </circle>
    <!-- progresso -->
    <rect x="-14" y="12" width="28" height="4" rx="1" fill="#21262d"/>
    <rect x="-14" y="12" height="4" rx="1" fill="#09f7b5">
      <animate attributeName="width" values="${progressValues.split(';').map((v) => (28 * parseFloat(v)).toFixed(1)).join(';')}" keyTimes="${progressTimes}" dur="${matchDur}s" repeatCount="indefinite"/>
    </rect>
    <text y="28" text-anchor="middle" fill="#8b949e" font-size="9" font-family="monospace">GEN</text>
  </g>`;
}

function hookNode(h, i) {
  return `
  <g transform="translate(${h.x},${h.y})" id="hook-${i}">
    <line x1="0" y1="-28" x2="0" y2="10" stroke="#6e7681" stroke-width="3"/>
    <path d="M0 -28 C-12 -20, -10 -8, 0 -4 C10 -8, 12 -20, 0 -28" fill="none" stroke="#c9d1d9" stroke-width="2.5"/>
    <circle cy="-4" r="2" fill="#8b949e"/>
  </g>`;
}

function trapNode(t, i, matchDur) {
  const snap = rand(0.3, 0.75).toFixed(3);
  const snapEnd = (parseFloat(snap) + 0.05).toFixed(3);
  return `
  <g transform="translate(${t.x},${t.y})" id="trap-${i}">
    <ellipse rx="14" ry="8" fill="#1a1f26" stroke="#6e7681" stroke-width="1"/>
    <path d="M-10 0 L-4 -6 L4 -6 L10 0" fill="none" stroke="#c9d1d9" stroke-width="1.5">
      <animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 0.2;1 1;1 1" keyTimes="0;${snap};${snapEnd};${(parseFloat(snapEnd)+0.05).toFixed(3)};1" dur="${matchDur}s" repeatCount="indefinite"/>
    </path>
    <circle r="4" fill="#ff4444" opacity="0">
      <animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;${snap};${(parseFloat(snap)+0.02).toFixed(3)};${snapEnd};1" dur="${matchDur}s" repeatCount="indefinite"/>
    </circle>
  </g>`;
}

function survivorGraphic(color, letter) {
  return `
    <circle r="9" fill="${color.fill}" stroke="#0d1117" stroke-width="1.5"/>
    <circle cy="-12" r="5" fill="${color.fill}" stroke="#0d1117" stroke-width="1"/>
    <text y="3" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="#0d1117" font-family="Arial,sans-serif">${letter}</text>`;
}

/**
 * Roteiro de um survivor: gen → foge → (opcional hook) → unhook/rescue → gen
 */
function survivorActor(idx, color, map, matchDur, roles) {
  const genA = map.gens[idx % map.gens.length];
  const genB = map.gens[(idx + 2) % map.gens.length];
  const hook = map.hooks[idx % map.hooks.length];
  const start = near(genA, 30);

  const isHooked = roles.hooked === idx;
  const isRescuer = roles.rescuer === idx;
  const isChased = roles.chased === idx;

  // Timeline em frações da partida
  const tWork1 = 0.0;
  const tChase = rand(0.18, 0.28);
  const tDown = tChase + 0.08;
  const tHook = tDown + 0.1;
  const tRescue = tHook + 0.12;
  const tWork2 = tRescue + 0.1;
  const tEnd = 1;

  let points = [];
  let times = [];

  const push = (frac, p) => {
    points.push(p);
    times.push(clamp(frac, 0, 1));
  };

  push(0, start);
  push(0.08, near(genA, 8)); // chega no gen
  push(tChase - 0.02, near(genA, 6)); // trabalha

  if (isChased || isHooked) {
    push(tChase, near(genA, 50)); // foge
    push(tDown, near(hook, 70));
    if (isHooked) {
      push(tHook, { ...hook }); // no gancho
      push(tRescue - 0.01, { ...hook });
      push(tRescue + 0.05, near(hook, 35)); // solto
    } else {
      push(tDown + 0.05, near(map.traps[0] || genB, 40));
      push(tWork2, near(genB, 10));
    }
  } else if (isRescuer) {
    push(tChase, near(genB, 8));
    push(tHook - 0.02, near(genB, 6));
    push(tRescue - 0.04, near(hook, 45)); // vai salvar
    push(tRescue, near(hook, 12));
    push(tWork2, near(genB, 8));
  } else {
    push(tChase, near(genA, 5));
    push(0.45, near(genB, 40));
    push(0.55, near(genB, 8));
    push(0.85, near(genB, 6));
  }

  push(0.95, near(map.gate, 60));
  push(1, near(map.gate, 40));

  // normalizar keyTimes únicos crescentes
  const norm = [];
  for (let i = 0; i < times.length; i++) {
    const t = i === 0 ? 0 : Math.max(times[i], norm[i - 1].t + 0.01);
    norm.push({ t: Math.min(0.999, t), p: points[i] });
  }
  norm[norm.length - 1].t = 1;

  const values = translateValues(norm.map((n) => n.p));
  const kTimes = norm.map((n) => n.t.toFixed(3)).join('; ');
  const spline = splines(norm.length - 1);

  // Opacidade no gancho: survivor "pendurado" some um pouco do chão (já está no hook pos)
  // Estado caído: escala Y
  let downAnim = '';
  if (isHooked || isChased) {
    const d0 = tDown.toFixed(3);
    const d1 = (tDown + 0.05).toFixed(3);
    const d2 = isHooked ? tHook.toFixed(3) : (tDown + 0.15).toFixed(3);
    downAnim = `
      <animateTransform attributeName="transform" type="scale" additive="sum"
        values="1 1;1 1;1 0.55;1 0.55;1 1;1 1"
        keyTimes="0;${d0};${d1};${d2};${(parseFloat(d2) + 0.05).toFixed(3)};1"
        dur="${matchDur}s" begin="0s" repeatCount="indefinite"/>`;
  }

  // Aura de terror quando perseguido
  const terror =
    isChased || isHooked
      ? `<circle r="16" fill="none" stroke="#9b2226" stroke-width="1.5" opacity="0">
      <animate attributeName="opacity" values="0;0;0.7;0.2;0.7;0;0" keyTimes="0;${tChase.toFixed(3)};${(tChase + 0.03).toFixed(3)};${tDown.toFixed(3)};${(tDown + 0.05).toFixed(3)};${(tDown + 0.12).toFixed(3)};1" dur="${matchDur}s" repeatCount="indefinite"/>
    </circle>`
      : '';

  return `
  <g id="surv-${idx}">
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${kTimes}"
      dur="${matchDur}s" begin="0s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <g>
      ${downAnim}
      ${terror}
      ${survivorGraphic(color, color.name)}
    </g>
  </g>`;
}

function trapperActor(map, matchDur, roles) {
  const genKick = map.gens[roles.kickGen % map.gens.length];
  const hook = map.hooks[roles.hooked % map.hooks.length];
  const chaseStart = near(map.gens[roles.chased % map.gens.length], 20);
  const patrolA = near(map.gens[0], 50);
  const patrolB = near(map.gens[2 % map.gens.length], 40);
  const trapSpot = map.traps[0] || near(genKick, 30);

  const tPatrol = 0.05;
  const tKick = 0.22;
  const tChase = 0.32;
  const tDown = 0.42;
  const tCarry = 0.48;
  const tHook = 0.55;
  const tLeave = 0.65;
  const tTrap = 0.72;
  const tPatrol2 = 0.85;

  const seq = [
    { t: 0, p: patrolA },
    { t: tPatrol, p: patrolB },
    { t: tKick - 0.02, p: near(genKick, 12) }, // kick gen
    { t: tKick + 0.04, p: near(genKick, 10) },
    { t: tChase, p: chaseStart },
    { t: tDown, p: near(hook, 55) },
    { t: tCarry, p: near(hook, 40) },
    { t: tHook, p: { ...hook } },
    { t: tLeave, p: near(hook, 60) },
    { t: tTrap, p: { ...trapSpot } },
    { t: tPatrol2, p: near(map.gens[1], 40) },
    { t: 1, p: patrolA },
  ];

  const values = translateValues(seq.map((s) => s.p));
  const kTimes = seq.map((s) => s.t.toFixed(3)).join('; ');
  const spline = splines(seq.length - 1);

  // Braço / facão swing no kick e no hit
  const swingKick = tKick.toFixed(3);
  const swingHit = tDown.toFixed(3);

  return `
  <g id="trapper">
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${kTimes}"
      dur="${matchDur}s" begin="0s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <g>
      <!-- corpo Trapper -->
      <ellipse cy="2" rx="11" ry="13" fill="#2b2f36" stroke="#9b2226" stroke-width="1.5"/>
      <circle cy="-12" r="7" fill="#3d4450" stroke="#c9d1d9" stroke-width="1"/>
      <!-- máscara / olhos -->
      <circle cx="-2.5" cy="-13" r="1.3" fill="#ff4444"/>
      <circle cx="2.5" cy="-13" r="1.3" fill="#ff4444"/>
      <!-- ombreiras -->
      <rect x="-14" y="-6" width="8" height="5" rx="1" fill="#6e7681"/>
      <rect x="6" y="-6" width="8" height="5" rx="1" fill="#6e7681"/>
      <!-- facão -->
      <g>
        <animateTransform attributeName="transform" type="rotate"
          values="0;0;-55;0;0;-70;10;0;0"
          keyTimes="0;${(parseFloat(swingKick)-0.02).toFixed(3)};${swingKick};${(parseFloat(swingKick)+0.05).toFixed(3)};${(parseFloat(swingHit)-0.02).toFixed(3)};${swingHit};${(parseFloat(swingHit)+0.05).toFixed(3)};0.7;1"
          dur="${matchDur}s" repeatCount="indefinite"/>
        <rect x="10" y="-4" width="18" height="4" rx="1" fill="#c9d1d9" transform="rotate(-20 10 0)"/>
        <rect x="24" y="-5" width="6" height="6" fill="#8b949e"/>
      </g>
      <!-- aura vermelha -->
      <circle r="22" fill="none" stroke="#9b2226" stroke-width="1" opacity="0.35">
        <animate attributeName="r" values="18;26;18" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.2;0.45;0.2" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      <text y="28" text-anchor="middle" fill="#ff6b6b" font-size="8" font-family="monospace">TRAPPER</text>
    </g>
  </g>`;

  // silence unused
  void matchDur;
}

function fogParticles(n, matchDur) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rand(0, W).toFixed(1);
    const y = rand(30, H).toFixed(1);
    const r = rand(12, 40).toFixed(1);
    const dur = rand(8, 18).toFixed(1);
    const dx = rand(-40, 40).toFixed(1);
    out += `
  <circle cx="${x}" cy="${y}" r="${r}" fill="#8b949e" opacity="0.04">
    <animate attributeName="cx" values="${x};${(parseFloat(x) + parseFloat(dx)).toFixed(1)};${x}" dur="${dur}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.02;0.07;0.02" dur="${dur}s" repeatCount="indefinite"/>
  </circle>`;
  }
  return out;
}

function uiChrome(matchDur, seed) {
  return `
  <text x="18" y="22" fill="#c9d1d9" font-family="ui-monospace,Consolas,monospace" font-size="12">DEAD BY DAYLIGHT · arena seed ${seed}</text>
  <!-- emblem fake -->
  <g transform="translate(${W - 70}, 18)">
    <polygon points="0,-10 9,0 0,10 -9,0" fill="none" stroke="#9b2226" stroke-width="1.5"/>
    <circle r="3" fill="#9b2226">
      <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>
  </g>
  <!-- heartbeat killer proximity meter -->
  <g transform="translate(18, ${H - 16})">
    <text fill="#6e7681" font-size="9" font-family="monospace">HEARTBEAT</text>
    <rect x="70" y="-8" width="120" height="6" rx="2" fill="#21262d"/>
    <rect x="70" y="-8" height="6" rx="2" fill="#9b2226">
      <animate attributeName="width" values="20;90;40;110;30;80;20" dur="${(matchDur / 3).toFixed(1)}s" repeatCount="indefinite"/>
    </rect>
  </g>`;
}

function gateNode(gate, matchDur) {
  return `
  <g transform="translate(${gate.x},${gate.y})">
    <rect x="-8" y="-40" width="10" height="80" fill="#2a2f38" stroke="#6e7681"/>
    <rect x="-6" y="-38" width="6" height="76" fill="#09f7b5" opacity="0.15">
      <animate attributeName="opacity" values="0.1;0.1;0.55;0.55" keyTimes="0;0.78;0.88;1" dur="${matchDur}s" repeatCount="indefinite"/>
    </rect>
    <text y="52" text-anchor="middle" fill="#8b949e" font-size="8" font-family="monospace">GATE</text>
  </g>`;
}

function generate() {
  const seed = Date.now().toString(36);
  const stamp = new Date().toISOString();
  const matchDur = randInt(28, 42); // segundos por “partida”
  const map = buildMap();
  const roles = {
    chased: randInt(0, 3),
    hooked: randInt(0, 3),
    rescuer: randInt(0, 3),
    kickGen: randInt(0, map.gens.length - 1),
  };
  // garantir rescuer != hooked
  if (roles.rescuer === roles.hooked) roles.rescuer = (roles.hooked + 1) % 4;
  if (roles.chased !== roles.hooked) roles.chased = roles.hooked;

  const survivors = SURVIVOR_COLORS.map((c, i) => survivorActor(i, c, map, matchDur, roles));
  const gens = map.gens.map((g, i) => genNode(g, i, matchDur));
  const hooks = map.hooks.map((h, i) => hookNode(h, i));
  const traps = map.traps.map((t, i) => trapNode(t, i, matchDur));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dead by Daylight arena simplificada">
  <title>DbD Arena — Trapper</title>
  <desc>${esc(`Partida procedural ${stamp} · seed ${seed} · ${matchDur}s`)}</desc>
  <defs>
    <radialGradient id="fog" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="#161b22"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </radialGradient>
    <filter id="soft">
      <feGaussianBlur stdDeviation="0.4"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#fog)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="#21262d"/>
  <!-- chão / neblina -->
  ${fogParticles(14, matchDur)}
  <!-- props -->
  ${gens.join('\n')}
  ${hooks.join('\n')}
  ${traps.join('\n')}
  ${gateNode(map.gate, matchDur)}
  <!-- hatch -->
  <g transform="translate(${map.hatch.x},${map.hatch.y})">
    <rect x="-10" y="-10" width="20" height="20" fill="#1a1f26" stroke="#6e7681" stroke-dasharray="3 2"/>
    <text y="4" text-anchor="middle" fill="#6e7681" font-size="7" font-family="monospace">HATCH</text>
  </g>
  <!-- sobreviventes -->
  ${survivors.join('\n')}
  <!-- killer -->
  ${trapperActor(map, matchDur, roles)}
  ${uiChrome(matchDur, seed)}
</svg>
`;
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const svg = generate();
  fs.writeFileSync(path.join(outDir, 'dbd-arena.svg'), svg, 'utf8');
  fs.writeFileSync(path.join(outDir, 'dbd-arena-dark.svg'), svg, 'utf8');
  // aliases para não quebrar links antigos do README
  fs.writeFileSync(path.join(outDir, 'foice-frutas.svg'), svg, 'utf8');
  fs.writeFileSync(path.join(outDir, 'foice-frutas-dark.svg'), svg, 'utf8');
  console.log('OK', path.join(outDir, 'dbd-arena-dark.svg'), Buffer.byteLength(svg), 'bytes', 'dur procedural');
}

main();
