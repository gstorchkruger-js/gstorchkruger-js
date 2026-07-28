/**
 * Gera SVG: foice perseguindo frutas (aleatório a cada execução).
 * SMIL animateTransform — compatível com <img> no README do GitHub.
 */
const fs = require('fs');
const path = require('path');

const W = 840;
const H = 220;
const FRUITS = ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍑', '🥝', '🍒'];
const COUNT = 9;

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pt() {
  return { x: +rand(48, W - 48).toFixed(1), y: +rand(38, H - 38).toFixed(1) };
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function translateValues(points) {
  return points.map((p) => `${p.x} ${p.y}`).join('; ');
}
function keyTimes(n) {
  if (n <= 1) return '0;1';
  return Array.from({ length: n }, (_, i) => (i / (n - 1)).toFixed(3)).join('; ');
}
function splines(nSeg) {
  return Array(nSeg).fill('0.42 0 0.58 1').join('; ');
}

function fruitGroup(i) {
  const emoji = pick(FRUITS);
  const flee = Math.random() < 0.42;
  const dur = rand(5.5, 12.5).toFixed(2);
  const begin = rand(0, 5.5).toFixed(2);
  const nPts = randInt(5, 8);
  const points = Array.from({ length: nPts }, () => pt());
  points.push({ ...points[0] });

  const cutIdx = Math.max(2, Math.min(points.length - 2, Math.floor(points.length * rand(0.35, 0.72))));
  const cutTime = (cutIdx / (points.length - 1)).toFixed(3);
  const cutEnd = Math.min(0.99, parseFloat(cutTime) + 0.07).toFixed(3);
  const cutFlash = Math.max(0, parseFloat(cutTime) - 0.02).toFixed(3);

  const values = translateValues(points);
  const times = keyTimes(points.length);
  const spline = splines(points.length - 1);

  const opacityValues = flee ? '1;1;0.8;1;1' : `1;1;0;0;1`;
  const opacityTimes = flee ? '0;0.3;0.5;0.75;1' : `0;${cutTime};${cutEnd};0.93;1`;

  const scaleAnim = flee
    ? ''
    : `<animateTransform attributeName="transform" type="scale" additive="sum"
      values="1;1;0.12;0.12;1"
      keyTimes="0;${cutTime};${cutEnd};0.93;1"
      dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`;

  const slashNode = flee
    ? ''
    : `
  <g opacity="0">
    <animate attributeName="opacity"
      values="0;0;1;0;0"
      keyTimes="0;${cutFlash};${cutTime};${cutEnd};1"
      dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${times}"
      dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <line x1="-20" y1="-14" x2="20" y2="16" stroke="#09f7b5" stroke-width="3" stroke-linecap="round"/>
    <line x1="-16" y1="16" x2="18" y2="-12" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
  </g>`;

  return `
  <!-- fruta ${i}: ${flee ? 'fugindo' : 'cortavel'} -->
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${times}"
      dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <g>
      ${scaleAnim}
      <text text-anchor="middle" dominant-baseline="central" font-size="${randInt(26, 32)}">${emoji}</text>
      <animate attributeName="opacity"
        values="${opacityValues}" keyTimes="${opacityTimes}"
        dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </g>
  </g>${slashNode}`;
}

function sickleGroup() {
  const n = randInt(7, 11);
  let points = Array.from({ length: n }, () => pt());
  points = shuffle(points);
  points.push({ ...points[0] });

  const dur = rand(8, 14).toFixed(2);
  const values = translateValues(points);
  const times = keyTimes(points.length);
  const spline = splines(points.length - 1);
  const rots = points.map(() => randInt(-45, 60)).join(';');
  const glowDur = rand(1.1, 2.4).toFixed(2);

  return `
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="${values}" keyTimes="${times}"
      dur="${dur}s" begin="0s" repeatCount="indefinite" calcMode="spline"
      keySplines="${spline}"/>
    <g>
      <animateTransform attributeName="transform" type="rotate"
        values="${rots}" keyTimes="${times}"
        dur="${dur}s" begin="0s" repeatCount="indefinite"/>
      <g transform="translate(-18,-18)">
        <rect x="15" y="20" width="3.5" height="18" rx="1.5" fill="#c4a574" transform="rotate(-28 16.5 29)"/>
        <path d="M6 24 C6 6, 30 2, 34 20 C24 10, 12 14, 9 28 Z" fill="#e6edf3" stroke="#09f7b5" stroke-width="1.4"/>
        <path d="M10 22 C14 12, 26 10, 30 18" fill="none" stroke="#58a6ff" stroke-width="1.1" opacity="0.55"/>
        <circle cx="22" cy="14" r="3.2" fill="#09f7b5">
          <animate attributeName="opacity" values="0.12;0.6;0.12" dur="${glowDur}s" repeatCount="indefinite"/>
        </circle>
      </g>
    </g>
  </g>`;
}

function generate() {
  const stamp = new Date().toISOString();
  const seed = Date.now().toString(36);
  const fruits = Array.from({ length: COUNT }, (_, i) => fruitGroup(i));
  const sickle = sickleGroup();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Foice perseguindo frutas">
  <title>Foice vs frutas</title>
  <desc>${esc(`Animação aleatória · ${stamp} · seed ${seed}`)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="#21262d"/>
  <text x="18" y="24" fill="#8b949e" font-family="ui-monospace, Consolas, monospace" font-size="12">foice vs frutas · ${seed}</text>
${fruits.join('\n')}
${sickle}
</svg>
`;
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const svg = generate();
  fs.writeFileSync(path.join(outDir, 'foice-frutas.svg'), svg, 'utf8');
  fs.writeFileSync(path.join(outDir, 'foice-frutas-dark.svg'), svg, 'utf8');
  console.log('OK', path.join(outDir, 'foice-frutas.svg'), Buffer.byteLength(svg), 'bytes');
}

main();
