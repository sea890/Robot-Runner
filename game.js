(() => {
  'use strict';

  /* =========================================================
     BIT RUNNER
     Runner infinito en blanco y negro, dibujado 100% con código.
     Ciudad de día -> a los 500 puntos la ciudad cae en ruinas.
     Truco para probar: abre index.html?puntos=480
     ========================================================= */

  /* ---------- Configuración ---------- */
  const W = 600;            // ancho lógico
  const H = 150;            // alto lógico
  const GROUND_Y = 126;     // línea del suelo

  const FONT = '"Press Start 2P", monospace';

  const GRAVITY = 1800;     // px/s²
  const JUMP_V = 450;       // px/s
  const MIN_JUMP_V = 170;   // salto corto al soltar la tecla
  const FAST_FALL = 3;      // multiplicador de gravedad al presionar ↓ en el aire
  const START_SPEED = 300;  // px/s
  const MAX_SPEED = 720;
  const ACCEL = 5;          // px/s²
  const SCORE_RATE = 0.035; // puntos por px recorrido
  const PLAYER_X = 34;
  const RESTART_DELAY = 400; // ms

  const RUIN_SCORE = 500;   // puntos para pasar al modo apocalíptico
  const THEME_TIME = 1.8;   // segundos que dura la transición

  const LASER_SPEED = 900;     // px/s
  const LASER_COOLDOWN = 0.28; // segundos entre disparos
  const MAX_LASERS = 3;        // rayos simultáneos en pantalla

  /* ---------- Paletas (escala de grises) ---------- */
  const PALETTE = {
    day:  { paper: 244, ink: 32,  mist: 222, muted: 140 },
    ruin: { paper: 16,  ink: 233, mist: 40,  muted: 122 }
  };
  let INK = '#202020';
  let PAPER = '#f4f4f4';
  let MIST = '#dedede';
  let MUTED = '#8c8c8c';

  const hintEl = document.querySelector('.hint');
  const fireEl = document.getElementById('fire');
  let appliedTheme = -1;

  const gray = (v) => {
    const n = Math.round(v);
    return 'rgb(' + n + ',' + n + ',' + n + ')';
  };
  const mixV = (a, b, t) => a + (b - a) * t;

  function applyTheme(t, force) {
    if (!force && Math.abs(t - appliedTheme) < 0.003) return;
    appliedTheme = t;
    PAPER = gray(mixV(PALETTE.day.paper, PALETTE.ruin.paper, t));
    INK = gray(mixV(PALETTE.day.ink, PALETTE.ruin.ink, t));
    MIST = gray(mixV(PALETTE.day.mist, PALETTE.ruin.mist, t));
    MUTED = gray(mixV(PALETTE.day.muted, PALETTE.ruin.muted, t));
    document.body.style.background = PAPER;
    if (hintEl) hintEl.style.color = MUTED;
    if (fireEl) {
      fireEl.style.background = INK;
      fireEl.style.color = PAPER;
    }
  }

  /* ---------- Canvas ---------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || W;
    scale = Math.max(1, Math.round((cssW * dpr) / W));
    canvas.width = W * scale;
    canvas.height = H * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  /* ---------- Sprites (pixel art) ---------- */
  const BOT_TOP = [
    '........##......',
    '........##......',
    '..############..',
    '..############..',
    '..#######..###..',
    '..#######..###..',
    '..############..',
    '..############..',
    '..############..',
    '....########....',
    '...##########...',
    '...##########...',
    '...##.####.##...',
    '...##########...',
    '....########....'
  ];

  const BOT_LEGS_STAND = [
    '....##....##....',
    '....##....##....',
    '....##....##....',
    '...###....###...'
  ];
  const BOT_LEGS_A = [
    '....##....##....',
    '....##....##....',
    '....##..........',
    '...###..........'
  ];
  const BOT_LEGS_B = [
    '....##....##....',
    '....##....##....',
    '..........##....',
    '..........###...'
  ];

  const BOT_DUCK_TOP = [
    '...##############...',
    '...##############...',
    '...#########..####..',
    '...#########..####..',
    '...##############...',
    '..################..',
    '..##.##########.##..',
    '..################..',
    '....############....'
  ];
  const BOT_DUCK_A = '..###..........###..';
  const BOT_DUCK_B = '....###......###....';

  const DRONE_BODY = [
    '....############....',
    '....##.######.##....',
    '....############....',
    '......########......',
    '.....##......##.....',
    '....###......###....'
  ];
  const DRONE_TOP_A = [
    '..######....######..',
    '........####........',
    '......########......'
  ];
  const DRONE_TOP_B = [
    '....................',
    '........####........',
    '####..########..####'
  ];

  // Convierte filas de texto en rectángulos (une píxeles contiguos en horizontal)
  function compile(rows) {
    const rects = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] === '#') {
          const start = x;
          while (row[x] === '#') x++;
          rects.push([start, y, x - start, 1]);
        } else {
          x++;
        }
      }
    });
    return { w: rows[0].length, h: rows.length, rects };
  }

  const SPR = {
    stand: compile(BOT_TOP.concat(BOT_LEGS_STAND)),
    runA: compile(BOT_TOP.concat(BOT_LEGS_A)),
    runB: compile(BOT_TOP.concat(BOT_LEGS_B)),
    duckA: compile(BOT_DUCK_TOP.concat([BOT_DUCK_A])),
    duckB: compile(BOT_DUCK_TOP.concat([BOT_DUCK_B])),
    droneA: compile(DRONE_TOP_A.concat(DRONE_BODY)),
    droneB: compile(DRONE_TOP_B.concat(DRONE_BODY))
  };

  function drawSprite(sprite, x, y, color) {
    ctx.fillStyle = color || INK;
    const ox = Math.round(x);
    const oy = Math.round(y);
    for (const [rx, ry, rw, rh] of sprite.rects) {
      ctx.fillRect(ox + rx, oy + ry, rw, rh);
    }
  }

  /* ---------- Obstáculos dibujados por código ---------- */
  function drawCrate(x, y, s) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = PAPER;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = INK;
    for (let i = 0; i < s - 4; i++) {
      ctx.fillRect(x + 2 + i, y + 2 + i, 1, 1);
      ctx.fillRect(x + s - 3 - i, y + 2 + i, 1, 1);
    }
  }

  function drawTower(x, y, w, h) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, 3);                 // tapa
    ctx.fillRect(x + 2, y + 3, w - 4, h - 3); // cuerpo
    ctx.fillRect(x, y + h - 3, w, 3);         // base
    ctx.fillStyle = PAPER;
    for (let yy = 7; yy < h - 7; yy += 7) {   // ventanas
      ctx.fillRect(x + 4, y + yy, w - 8, 2);
    }
  }

  function makeObstacle(kind) {
    switch (kind) {
      case 'crate':    return { kind, w: 14, h: 14 };
      case 'crateBig': return { kind, w: 22, h: 22 };
      case 'tower':    return { kind, w: 14, h: 32 };
      case 'group2':   return { kind: 'group', n: 2, w: 26, h: 12 };
      case 'group3':   return { kind: 'group', n: 3, w: 40, h: 12 };
      default:         return { kind: 'drone', w: 20, h: 9, extra: 60 };
    }
  }

  const DRONE_LIFTS = [12, 26, 44]; // altura del borde inferior sobre el suelo

  function drawObstacle(o, now) {
    switch (o.kind) {
      case 'crate':    drawCrate(o.x, o.y, 14); break;
      case 'crateBig': drawCrate(o.x, o.y, 22); break;
      case 'tower':    drawTower(o.x, o.y, o.w, o.h); break;
      case 'group':
        for (let i = 0; i < o.n; i++) drawCrate(o.x + i * 14, o.y, 12);
        break;
      case 'drone': {
        const frame = Math.floor(now / 70) % 2 === 0 ? SPR.droneA : SPR.droneB;
        drawSprite(frame, o.x, o.y);
        break;
      }
    }
  }

  function obstacleBox(o) {
    if (o.kind === 'drone') return { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 3 };
    return { x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.h - 1 };
  }

  /* ---------- Utilidades ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n) => String(n).padStart(5, '0');

  // Generador pseudoaleatorio con semilla (la ciudad siempre sale igual)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Ciudad de fondo (parallax) ---------- */
  const CITY_P = 1200; // ancho del patrón que se repite

  function makeCity(cfg) {
    const rng = mulberry32(cfg.seed);
    const list = [];
    let x = 0;
    while (x < CITY_P) {
      let w = cfg.wMin + Math.floor(rng() * (cfg.wMax - cfg.wMin + 1));
      w -= w % 2;
      if (CITY_P - x - w < cfg.wMin) w = CITY_P - x;
      const h = cfg.hMin + Math.floor(rng() * (cfg.hMax - cfg.hMin + 1));
      list.push({
        x, w, h,
        roof: Math.floor(rng() * 4),
        seed: Math.floor(rng() * 1e9)
      });
      x += w;
    }
    return list;
  }

  // Edificio entero: cuerpo, azotea y ventanas (huecos transparentes)
  function drawIntact(c, b, color, near) {
    const top = GROUND_Y - b.h;
    const mid = b.x + (b.w >> 1);
    c.fillStyle = color;
    c.fillRect(b.x, top, b.w, b.h);
    switch (b.roof) {
      case 1: // antena
        c.fillRect(mid, top - 9, 2, 9);
        c.fillRect(mid - 3, top - 3, 8, 3);
        break;
      case 2: // azotea escalonada
        c.fillRect(b.x + 4, top - 5, b.w - 8, 5);
        c.fillRect(b.x + 8, top - 9, b.w - 16, 4);
        break;
      case 3: // tanque de agua
        c.fillRect(b.x + 5, top - 6, 1, 6);
        c.fillRect(b.x + 14, top - 6, 1, 6);
        c.fillRect(b.x + 3, top - 12, 14, 6);
        c.fillRect(b.x + 2, top - 13, 16, 1);
        break;
      default:
        c.fillRect(b.x + 2, top - 2, b.w - 4, 2);
    }
    const r = mulberry32(b.seed);
    for (let gy = top + 5; gy + 4 <= GROUND_Y - 6; gy += 8) {
      for (let gx = b.x + 3; gx + 3 <= b.x + b.w - 3; gx += 6) {
        if (r() < 0.8) c.clearRect(gx, gy, 3, 4);
      }
    }
    if (near) c.clearRect(mid - 2, GROUND_Y - 7, 4, 7); // puerta
  }

  // Edificio destruido: techo roto, huecos, grietas, varillas y escombros
  function drawRuined(c, b, color, near) {
    const r = mulberry32(b.seed ^ 0x5bd1e995);
    const top0 = GROUND_Y - b.h;
    const cols = b.w >> 1;
    const stump = r() < 0.2;
    const maxCut = Math.round(b.h * (stump ? 0.8 : 0.2 + r() * 0.35));

    // Perfil del techo roto
    const prof = [];
    let j = r() * maxCut;
    for (let i = 0; i < cols; i++) {
      j += (r() - 0.5) * 12;
      j = Math.max(0, Math.min(maxCut, j));
      prof.push(Math.round(j));
    }
    c.fillStyle = color;
    for (let i = 0; i < cols; i++) {
      const colH = b.h - prof[i];
      c.fillRect(b.x + i * 2, GROUND_Y - colH, 2, colH);
    }
    const colTop = (x) => top0 + prof[Math.min(cols - 1, Math.max(0, (x - b.x) >> 1))];

    // Varillas de hierro expuestas
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(r() * cols);
      c.fillRect(b.x + i * 2, top0 + prof[i] - 3 - Math.floor(r() * 5), 1, 6);
    }

    // Ventanas (algunas reventadas)
    for (let gy = top0 + 5; gy + 4 <= GROUND_Y - 6; gy += 8) {
      for (let gx = b.x + 3; gx + 3 <= b.x + b.w - 3; gx += 6) {
        if (gy < colTop(gx) + 3 || gy < colTop(gx + 2) + 3) continue;
        const roll = r();
        if (roll < 0.62) c.clearRect(gx, gy, 3, 4);
        else if (roll < 0.78) c.clearRect(gx, gy, 5, 8);
      }
    }

    // Trozos arrancados de la fachada
    for (let k = 0; k < 3; k++) {
      const cx = b.x + Math.floor(r() * (b.w - 4)) - 1;
      const cy = top0 + Math.floor(r() * b.h * 0.7);
      c.clearRect(cx, cy, 3 + Math.floor(r() * 7), 4 + Math.floor(r() * 9));
    }

    // Grietas
    for (let k = 0; k < 2; k++) {
      let cx = b.x + 3 + Math.floor(r() * (b.w - 6));
      let cy = top0 + Math.floor(r() * b.h * 0.5);
      const len = 10 + Math.floor(r() * 16);
      for (let s = 0; s < len; s++) {
        c.clearRect(cx, cy, 1, 1);
        cy += 1;
        if (r() < 0.45) cx += r() < 0.5 ? -1 : 1;
      }
    }

    // Ventanas encendidas por el fuego (solo la capa cercana)
    if (near) {
      const rows = Math.floor((b.h - 11) / 8);
      const colsW = Math.floor((b.w - 6) / 6);
      c.fillStyle = '#b8b8b8';
      for (let k = 0; k < 2; k++) {
        if (rows < 1 || colsW < 1 || r() > 0.6) continue;
        const gy = top0 + 5 + 8 * Math.floor(r() * rows);
        const gx = b.x + 3 + 6 * Math.floor(r() * colsW);
        if (gy >= colTop(gx) + 3 && gy >= colTop(gx + 2) + 3) c.fillRect(gx, gy, 3, 4);
      }
    }

    // Escombros al pie del edificio
    c.fillStyle = color;
    for (let k = 0; k < 9; k++) {
      const ry = GROUND_Y - 1 - Math.floor(r() * 3);
      const rh = Math.min(1 + Math.floor(r() * 3), GROUND_Y - ry);
      c.fillRect(b.x - 4 + Math.floor(r() * (b.w + 8)), ry, 2 + Math.floor(r() * 4), rh);
    }

    return top0 + Math.min.apply(null, prof); // y de la parte más alta que queda
  }

  // Columna de humo que sube de un edificio en ruinas
  function drawSmoke(c, x, y, color, phase) {
    c.fillStyle = color;
    for (let s = 0; s < 22; s++) {
      const yy = y - 3 - s * 3;
      if (yy < 4) break;
      const xx = x + Math.round(3 * Math.sin(s * 0.5 + phase * 6));
      const sz = 2 + (s > 8 ? 1 : 0) + (s > 15 ? 1 : 0);
      c.fillRect(xx - (sz >> 1), yy, sz, 2);
    }
  }

  function renderLayer(layer, ruined) {
    const cv = document.createElement('canvas');
    cv.width = CITY_P;
    cv.height = H;
    const c = cv.getContext('2d');
    const color = ruined ? layer.ruin : layer.day;
    const smokeRng = mulberry32(layer.cfg.seed + 99);
    const smokes = [];
    for (const b of layer.buildings) {
      if (!ruined) {
        drawIntact(c, b, color, layer.near);
      } else {
        const topY = drawRuined(c, b, color, layer.near);
        if (smokeRng() < 0.2) smokes.push([b.x + (b.w >> 1), topY, smokeRng()]);
      }
    }
    for (const [sx, sy, ph] of smokes) drawSmoke(c, sx, sy, layer.smoke, ph);
    return cv;
  }

  const LAYERS = [
    { // lejana
      par: 0.10, near: false,
      day: '#e3e3e3', ruin: '#202020', smoke: '#282828',
      cfg: { seed: 1337, wMin: 26, wMax: 46, hMin: 38, hMax: 80 }
    },
    { // cercana
      par: 0.28, near: true,
      day: '#cfcfcf', ruin: '#313131', smoke: '#3d3d3d',
      cfg: { seed: 2024, wMin: 30, wMax: 58, hMin: 26, hMax: 62 }
    }
  ];
  for (const L of LAYERS) {
    L.buildings = makeCity(L.cfg);
    L.dayImg = renderLayer(L, false);
    L.ruinImg = renderLayer(L, true);
    L.off = 0;
  }

  // Dibuja la franja visible de una capa (con vuelta al inicio del patrón)
  function blit(img, off, alpha) {
    ctx.globalAlpha = alpha;
    if (off + W <= CITY_P) {
      ctx.drawImage(img, off, 0, W, H, 0, 0, W, H);
    } else {
      const w1 = CITY_P - off;
      ctx.drawImage(img, off, 0, w1, H, 0, 0, w1, H);
      ctx.drawImage(img, 0, 0, W - w1, H, w1, 0, W - w1, H);
    }
  }

  function drawCity(e) {
    for (const L of LAYERS) {
      const off = Math.floor(L.off) % CITY_P;
      if (e < 0.999) blit(L.dayImg, off, 1 - e);
      if (e > 0.001) blit(L.ruinImg, off, e);
    }
    ctx.globalAlpha = 1;
  }

  // Luna pálida que aparece en el modo apocalíptico
  function drawMoon(e) {
    if (e < 0.01) return;
    const cx = 500;
    const cy = 46;
    const R = 15;
    ctx.globalAlpha = e * 0.35;
    ctx.fillStyle = INK;
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2, 1);
    }
    ctx.fillStyle = PAPER;
    ctx.fillRect(cx - 6, cy - 5, 4, 3);
    ctx.fillRect(cx + 3, cy + 2, 5, 4);
    ctx.fillRect(cx - 3, cy + 7, 3, 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- Estado ---------- */
  let state = 'ready'; // 'ready' | 'running' | 'over'
  let speed = START_SPEED;
  let distance = 0;
  let score = 0;
  let best = 0;
  let overAt = 0;
  let blinkUntil = 0;
  let shakeUntil = 0;
  let nextGap = 0;
  let runTimer = 0;
  let runFrame = 0;
  let duckHeld = false;
  let themeT = 0;       // 0 = día, 1 = ruinas
  let themeTarget = 0;
  let lasers = [];      // rayos en vuelo
  let fx = [];          // explosiones y chispas
  let shootHeld = false;
  let shootCd = 0;
  let muzzleUntil = 0;

  const player = { py: 0, vy: 0, onGround: true, ducking: false, fastFall: false };
  let obstacles = [];
  let groundOff = 0;

  // Puntaje inicial opcional para probar: index.html?puntos=480
  let START_SCORE = 0;
  try {
    START_SCORE = Math.max(0, parseInt(new URLSearchParams(window.location.search).get('puntos'), 10) || 0);
  } catch (e) { /* ignorar */ }

  try {
    best = parseInt(localStorage.getItem('bitrunner-best'), 10) || 0;
  } catch (e) { /* sin almacenamiento */ }

  /* ---------- Fondo: polvo, ceniza, suelo ---------- */
  const dust = [];
  for (let i = 0; i < 6; i++) {
    dust.push({
      x: Math.random() * W,
      y: 14 + Math.random() * 62,
      w: 8 + Math.floor(Math.random() * 3) * 4
    });
  }

  function drawDust() {
    ctx.fillStyle = MIST;
    for (const d of dust) ctx.fillRect(Math.round(d.x), Math.round(d.y), d.w, 1);
  }

  const ash = [];
  for (let i = 0; i < 30; i++) {
    ash.push({
      x: Math.random() * W,
      y: Math.random() * GROUND_Y,
      v: rand(10, 28),
      s: Math.random() < 0.2 ? 2 : 1
    });
  }

  function drawAsh(e) {
    if (e < 0.01) return;
    ctx.globalAlpha = e * 0.55;
    ctx.fillStyle = INK;
    for (const a of ash) ctx.fillRect(Math.round(a.x), Math.round(a.y), a.s, a.s);
    ctx.globalAlpha = 1;
  }

  const GL = 1200;
  const pebbles = [];
  for (let i = 0; i < 70; i++) {
    pebbles.push({
      x: Math.random() * GL,
      y: 3 + Math.floor(Math.random() * 16),
      w: 1 + Math.floor(Math.random() * 4),
      light: Math.random() < 0.4
    });
  }
  const rubble = [];
  for (let i = 0; i < 46; i++) {
    rubble.push({
      x: Math.random() * GL,
      w: 2 + Math.floor(Math.random() * 4),
      h: 1 + Math.floor(Math.random() * 3)
    });
  }

  function drawGround(e) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, GROUND_Y, W, 1);
    for (const p of pebbles) {
      const sx = (((p.x - groundOff) % GL) + GL) % GL;
      if (sx < W) {
        ctx.fillStyle = p.light ? MUTED : INK;
        ctx.fillRect(Math.round(sx), GROUND_Y + p.y, p.w, 1);
      }
    }
    if (e > 0.01) { // escombros sobre el suelo
      ctx.globalAlpha = e;
      ctx.fillStyle = MUTED;
      for (const r of rubble) {
        const sx = (((r.x - groundOff) % GL) + GL) % GL;
        if (sx < W) ctx.fillRect(Math.round(sx), GROUND_Y - r.h, r.w, r.h);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Sonido ---------- */
  let audio = null;
  let muted = false;

  function getAudio() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    return audio;
  }

  function beep(freq, dur, slideTo, vol) {
    if (muted) return;
    try {
      const a = getAudio();
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol || 0.04, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) { /* audio no disponible */ }
  }

  // Retumbar grave cuando la ciudad se derrumba
  function sfxRumble() {
    if (muted) return;
    try {
      const a = getAudio();
      const len = Math.floor(a.sampleRate * 1.0);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const gain = a.createGain();
      gain.gain.value = 0.5;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(a.destination);
      src.start();
    } catch (e) { /* audio no disponible */ }
    beep(70, 0.9, 35, 0.08);
  }

  // Ráfaga de ruido filtrado (para explosiones)
  function noiseBurst(dur, cutoff, vol) {
    if (muted) return;
    try {
      const a = getAudio();
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(a.destination);
      src.start();
    } catch (e) { /* audio no disponible */ }
  }

  const sfxLaser = () => beep(1500, 0.1, 280, 0.03);
  const sfxBoom = () => {
    noiseBurst(0.4, 1400, 0.35);
    beep(190, 0.3, 40, 0.06);
  };
  const sfxJump = () => beep(380, 0.12, 720, 0.04);
  const sfxDie = () => beep(240, 0.4, 60, 0.06);
  const sfxMilestone = () => {
    beep(880, 0.08, 0, 0.04);
    setTimeout(() => beep(1175, 0.1, 0, 0.04), 90);
  };

  /* ---------- Lógica ---------- */
  function startGame() {
    obstacles = [];
    speed = START_SPEED;
    distance = START_SCORE / SCORE_RATE;
    score = START_SCORE;
    nextGap = 0;
    runTimer = 0;
    runFrame = 0;
    blinkUntil = 0;
    shakeUntil = 0;
    lasers = [];
    fx = [];
    shootCd = 0;
    muzzleUntil = 0;
    themeTarget = score >= RUIN_SCORE ? 1 : 0;
    themeT = themeTarget;
    player.py = 0;
    player.vy = 0;
    player.onGround = true;
    player.ducking = false;
    player.fastFall = false;
    state = 'running';
  }

  function gameOver() {
    state = 'over';
    lasers = [];
    overAt = performance.now();
    sfxDie();
    if (score > best) {
      best = score;
      try { localStorage.setItem('bitrunner-best', String(best)); } catch (e) { /* ignorar */ }
    }
  }

  function pressJump() {
    if (state === 'over') {
      if (performance.now() - overAt > RESTART_DELAY) startGame();
      else return;
    } else if (state === 'ready') {
      startGame();
    }
    if (player.onGround) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.ducking = false;
      sfxJump();
    }
  }

  function releaseJump() {
    if (!player.onGround && player.vy > MIN_JUMP_V) player.vy = MIN_JUMP_V;
  }

  function spawnObstacle() {
    let kind;
    if (score >= 150 && Math.random() < 0.25) {
      kind = 'drone';
    } else {
      const pool = ['crate', 'crate', 'crateBig', 'tower', 'group2'];
      if (score >= 60) pool.push('group3');
      kind = pick(pool);
    }
    const o = makeObstacle(kind);
    o.x = W + 8;
    if (o.kind === 'drone') {
      o.y = GROUND_Y - pick(DRONE_LIFTS) - o.h;
    } else {
      o.y = GROUND_Y - o.h;
    }
    obstacles.push(o);
    nextGap = Math.max(170, speed * rand(0.8, 1.3));
  }

  // Posición del cañón del robot (a la altura de su "ojo")
  function gunPos() {
    const duck = player.ducking;
    const spr = duck ? SPR.duckA : SPR.stand;
    const top = Math.round(GROUND_Y - spr.h - player.py);
    return { x: PLAYER_X + (duck ? 18 : 14), y: top + (duck ? 2 : 4) };
  }

  function fireLaser(now) {
    if (state !== 'running' || shootCd > 0 || lasers.length >= MAX_LASERS) return;
    const g = gunPos();
    lasers.push({ x: g.x, y: g.y, len: 12 });
    shootCd = LASER_COOLDOWN;
    muzzleUntil = now + 80;
    sfxLaser();
  }

  function explodeDrone(o, now) {
    const parts = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(50, 190);
      parts.push({
        x: 0,
        y: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        s: Math.random() < 0.35 ? 2 : 1
      });
    }
    fx.push({ type: 'boom', x: o.x + o.w / 2, y: o.y + o.h / 2, t: 0, parts });
    shakeUntil = Math.max(shakeUntil, now + 140);
    sfxBoom();
  }

  function playerBox() {
    if (player.ducking) {
      const y = GROUND_Y - SPR.duckA.h - player.py;
      return { x: PLAYER_X + 2, y: y + 1, w: 16, h: 8 };
    }
    const y = GROUND_Y - SPR.stand.h - player.py;
    return { x: PLAYER_X + 3, y: y + 1, w: 10, h: 17 };
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update(dt, now) {
    let worldSpeed = 0;
    if (state === 'running') worldSpeed = speed;
    else if (state === 'ready') worldSpeed = 50;

    // Transición día <-> ruinas
    if (themeT < themeTarget) themeT = Math.min(themeTarget, themeT + dt / THEME_TIME);
    else if (themeT > themeTarget) themeT = Math.max(themeTarget, themeT - dt / THEME_TIME);

    // Fondo
    for (const L of LAYERS) L.off += worldSpeed * dt * L.par;
    groundOff += worldSpeed * dt;
    for (const d of dust) {
      d.x -= worldSpeed * dt * 0.35;
      if (d.x + d.w < 0) {
        d.x = W + Math.random() * 80;
        d.y = 14 + Math.random() * 62;
      }
    }
    for (const a of ash) {
      a.y += a.v * dt;
      a.x -= (worldSpeed * 0.22 + 14) * dt;
      if (a.y > GROUND_Y - 2 || a.x < -2) {
        a.y = -2;
        a.x = rand(0, W + 80);
      }
    }

    // Explosiones y chispas
    for (const f of fx) {
      f.t += dt;
      f.x -= worldSpeed * (f.type === 'spark' ? 1 : 0.7) * dt;
      if (f.parts) {
        for (const p of f.parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 420 * dt;
        }
      }
    }
    fx = fx.filter((f) => f.t < (f.type === 'boom' ? 0.55 : 0.14));

    if (state !== 'running') return;

    // Velocidad y puntaje
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    distance += speed * dt;
    const prevScore = score;
    score = Math.floor(distance * SCORE_RATE);
    if (prevScore < RUIN_SCORE && score >= RUIN_SCORE) {
      themeTarget = 1;          // ¡la ciudad cae!
      blinkUntil = now + 700;
      shakeUntil = now + 900;
      sfxRumble();
    } else if (Math.floor(score / 100) > Math.floor(prevScore / 100)) {
      blinkUntil = now + 700;
      sfxMilestone();
    }

    // Jugador
    player.ducking = duckHeld && player.onGround;
    player.fastFall = duckHeld && !player.onGround;
    if (!player.onGround) {
      player.vy -= GRAVITY * (player.fastFall ? FAST_FALL : 1) * dt;
      player.py += player.vy * dt;
      if (player.py <= 0) {
        player.py = 0;
        player.vy = 0;
        player.onGround = true;
      }
    }
    runTimer += dt;
    if (runTimer > 0.09) {
      runTimer = 0;
      runFrame = 1 - runFrame;
    }

    // Obstáculos
    for (const o of obstacles) o.x -= (speed + (o.extra || 0)) * dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -10);

    if (distance > 350) {
      const last = obstacles[obstacles.length - 1];
      if (!last || last.x + last.w + nextGap <= W) spawnObstacle();
    }

    // Láseres: avanzan, explotan drones y se apagan contra el resto
    shootCd = Math.max(0, shootCd - dt);
    if (shootHeld) fireLaser(now);
    lasers = lasers.filter((l) => {
      const prevX = l.x;
      l.x += LASER_SPEED * dt;
      const box = { x: prevX, y: l.y, w: l.x - prevX + l.len, h: 2 };
      let target = -1;
      for (let i = 0; i < obstacles.length; i++) {
        if (hit(box, obstacleBox(obstacles[i])) &&
            (target < 0 || obstacles[i].x < obstacles[target].x)) {
          target = i; // el más cercano
        }
      }
      if (target >= 0) {
        const o = obstacles[target];
        if (o.kind === 'drone') {
          explodeDrone(o, now);
          obstacles.splice(target, 1);
        } else {
          fx.push({ type: 'spark', x: o.x, y: l.y + 1, t: 0 });
        }
        return false;
      }
      return l.x < W + 20;
    });

    // Colisiones
    const pb = playerBox();
    for (const o of obstacles) {
      if (hit(pb, obstacleBox(o))) {
        gameOver();
        break;
      }
    }
  }

  /* ---------- Dibujo ---------- */
  function drawPlayer() {
    if (state === 'over') {
      const y = GROUND_Y - SPR.stand.h - player.py;
      drawSprite(SPR.stand, PLAYER_X, y);
      ctx.fillStyle = INK;
      ctx.fillRect(PLAYER_X + 9, Math.round(y) + 4, 2, 2); // ojo cerrado
      return;
    }
    let sprite;
    if (player.ducking) {
      sprite = runFrame === 0 ? SPR.duckA : SPR.duckB;
    } else if (!player.onGround || state === 'ready') {
      sprite = SPR.stand;
    } else {
      sprite = runFrame === 0 ? SPR.runA : SPR.runB;
    }
    drawSprite(sprite, PLAYER_X, GROUND_Y - sprite.h - player.py);
  }

  function drawHud(now) {
    ctx.font = '8px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const blinkOff = now < blinkUntil && Math.floor(now / 110) % 2 === 0;
    if (!blinkOff) {
      ctx.fillStyle = INK;
      ctx.fillText('PUNTOS ' + pad(score), 14, 12);
    }
    ctx.fillStyle = MUTED;
    ctx.fillText('MEJOR  ' + pad(best), 14, 26);
  }

  function drawReady() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK;
    ctx.font = '16px ' + FONT;
    ctx.fillText('BIT RUNNER', W / 2, 40);
    ctx.fillStyle = MUTED;
    ctx.font = '8px ' + FONT;
    ctx.fillText('ESPACIO O TOQUE PARA EMPEZAR', W / 2, 68);
  }

  function drawOver() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK;
    ctx.font = '14px ' + FONT;
    ctx.fillText('FIN DEL JUEGO', W / 2, 36);

    // Botón de reintentar (esquinas de píxel)
    const bx = W / 2 - 14;
    ctx.fillStyle = INK;
    ctx.fillRect(bx + 2, 60, 24, 24);
    ctx.fillRect(bx, 62, 28, 20);
    ctx.fillStyle = PAPER;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(W / 2 - 4 + i * 2, 66 + i, 2, 12 - 2 * i);
    }

    ctx.fillStyle = MUTED;
    ctx.font = '8px ' + FONT;
    ctx.fillText('ESPACIO PARA REINTENTAR', W / 2, 98);
  }

  function drawLasers() {
    ctx.fillStyle = INK;
    for (const l of lasers) {
      const x = Math.round(l.x);
      ctx.fillRect(x, l.y, l.len, 2);              // cuerpo del rayo
      ctx.fillRect(x + l.len - 3, l.y - 1, 3, 4);  // punta
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 6, l.y, 3, 2);              // estela
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x - 12, l.y, 3, 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawMuzzle(now) {
    if (state !== 'running' || now >= muzzleUntil) return;
    const g = gunPos();
    ctx.fillStyle = INK;
    ctx.fillRect(g.x, g.y - 1, 3, 4);
    ctx.fillRect(g.x + 3, g.y, 2, 2);
  }

  function drawFx() {
    for (const f of fx) {
      const cx = Math.round(f.x);
      const cy = Math.round(f.y);
      ctx.fillStyle = INK;
      if (f.type === 'spark') {
        const d = 2 + Math.floor(f.t * 30);
        if (f.t < 0.07) ctx.fillRect(cx - 1, cy - 1, 3, 3);
        ctx.fillRect(cx - d, cy, 1, 1);
        ctx.fillRect(cx + d, cy, 1, 1);
        ctx.fillRect(cx, cy - d, 1, 1);
        ctx.fillRect(cx, cy + d, 1, 1);
        continue;
      }

      // Explosión: destello, onda expansiva y restos
      const k = f.t / 0.55;
      ctx.globalAlpha = 1 - k * k;
      if (f.t < 0.07) ctx.fillRect(cx - 14, cy - 8, 28, 16);
      const R = Math.round(4 + 16 * (1 - Math.pow(1 - k, 2)));
      const th = Math.max(1, Math.round(7 * (1 - k)));
      const ri = R - th;
      for (let dy = -R; dy <= R; dy++) {
        const outer = Math.floor(Math.sqrt(R * R - dy * dy));
        if (Math.abs(dy) < ri) {
          const inner = Math.floor(Math.sqrt(ri * ri - dy * dy));
          ctx.fillRect(cx - outer, cy + dy, outer - inner, 1);
          ctx.fillRect(cx + inner, cy + dy, outer - inner, 1);
        } else {
          ctx.fillRect(cx - outer, cy + dy, outer * 2, 1);
        }
      }
      for (const p of f.parts) {
        ctx.fillRect(Math.round(cx + p.x), Math.round(cy + p.y), p.s, p.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  function draw(now) {
    const e = themeT * themeT * (3 - 2 * themeT); // suavizado
    applyTheme(e);

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    const shaking = now < shakeUntil;
    if (shaking) {
      ctx.save();
      ctx.translate(Math.floor(Math.random() * 3) - 1, Math.floor(Math.random() * 3) - 1);
    }

    drawMoon(e);
    drawCity(e);
    drawDust();
    drawAsh(e);
    drawGround(e);
    for (const o of obstacles) drawObstacle(o, now);
    drawLasers();
    drawPlayer();
    drawMuzzle(now);
    drawFx();
    drawHud(now);

    if (state === 'ready') drawReady();
    else if (state === 'over') drawOver();

    if (shaking) ctx.restore();
  }

  /* ---------- Entradas ---------- */
  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  const DUCK_KEYS = ['ArrowDown', 'KeyS'];
  const SHOOT_KEYS = ['ArrowRight', 'KeyD'];

  window.addEventListener('keydown', (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressJump();
    } else if (DUCK_KEYS.includes(e.code)) {
      e.preventDefault();
      duckHeld = true;
    } else if (SHOOT_KEYS.includes(e.code)) {
      e.preventDefault();
      shootHeld = true; // mantener presionado = ráfaga
      fireLaser(performance.now());
    } else if (e.code === 'KeyM') {
      muted = !muted;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      releaseJump();
    } else if (DUCK_KEYS.includes(e.code)) {
      duckHeld = false;
    } else if (SHOOT_KEYS.includes(e.code)) {
      shootHeld = false;
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    if (state === 'running' && rel > 0.7) {
      duckHeld = true;
    } else {
      pressJump();
    }
  });

  const pointerEnd = () => {
    duckHeld = false;
    releaseJump();
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);

  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => {
    duckHeld = false;
    shootHeld = false;
  });

  // Botón de disparo para pantallas táctiles
  if (fireEl) {
    const stopFire = () => { shootHeld = false; };
    fireEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      shootHeld = true;
      fireLaser(performance.now());
    });
    fireEl.addEventListener('pointerup', stopFire);
    fireEl.addEventListener('pointerleave', stopFire);
    fireEl.addEventListener('pointercancel', stopFire);
  }

  /* ---------- Bucle principal ---------- */
  let last = null;
  function frame(t) {
    if (last === null) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    update(dt, t);
    draw(t);
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { last = null; });

  applyTheme(0, true);
  resize();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('8px "Press Start 2P"').catch(() => {});
  }
  requestAnimationFrame(frame);
})();
