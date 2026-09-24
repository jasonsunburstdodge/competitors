(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // "The Moving Grid": a clean field of thin white and electric-blue
  // vertical/horizontal lines on the dark SilverXis background — an
  // architectural grid, not a circuit board. Two layers drift slowly
  // and continuously at different depths and speeds for a sense of
  // perspective. Occasional cells are left empty, appearing as square
  // gaps in the grid.
  //
  // On scroll, a small bright blue marker travels rapidly along the
  // grid lines toward a nearby empty cell. When it arrives it snaps
  // into that cell, the surrounding grid flashes with a quick
  // electrical pulse, and everything fades back to the grid's subtle
  // resting state.
  //
  // Under prefers-reduced-motion: the grid is drawn once, static, at
  // its resting drift position — no drift, no travelers, no pulses.
  // ---------------------------------------------------------------------

  const canvas = document.getElementById("grid-bg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const WHITE = [210, 220, 235];
  const BLUE_LINE = [80, 165, 255];
  const BLUE_BRIGHT = [110, 190, 255];
  const BLUE_LINE_PROB = 0.3;
  const EMPTY_CELL_PROB = 0.05;

  const FAR_CELL = 112;
  const FAR_ALPHA = 0.045;
  const FAR_VX = 0.0024; // px/ms
  const FAR_VY = 0.001;

  const NEAR_CELL = 58;
  const NEAR_ALPHA = 0.09;
  const NEAR_VX = 0.0055;
  const NEAR_VY = 0.0023;

  const TRAVEL_SPEED = 1.05; // px/ms — "travels rapidly"
  const TRAVEL_MARKER_FRAC = 0.28; // marker size as a fraction of a cell
  const MIN_HOPS = 4;
  const MAX_HOPS = 11;
  const SEARCH_ATTEMPTS = 60;
  const MAX_TRAVELERS = 4;
  const SPAWN_THROTTLE_MS = 260;

  const SNAP_HOLD_MS = 400;
  const SNAP_FADE_MS = 500;
  const PULSE_MS = 460;
  const PULSE_RADIUS = 2; // cells

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let farOffX = 0, farOffY = 0, nearOffX = 0, nearOffY = 0;
  let lastFrameTime = null;
  let lastSpawnTime = 0;
  let travelers = [];
  let snapped = [];
  let pulses = [];

  // Deterministic pseudo-random value in [0,1) for a pair of integers,
  // so a given grid cell keeps the same identity (empty or not, tinted
  // blue or not) as it drifts across the screen.
  function hash2(a, b) {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  }
  function isEmptyCell(col, row) { return hash2(col, row) < EMPTY_CELL_PROB; }
  function isBlueLineH(row) { return hash2(row, 91.7) < BLUE_LINE_PROB; }
  function isBlueLineV(col) { return hash2(col, 43.9) < BLUE_LINE_PROB; }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    travelers = [];
    snapped = [];
    pulses = [];
  }

  // ---------------------------------------------------------------------
  // Grid layer: drawn as two batched strokes (blue lines, white lines),
  // each built from individual cell-edge segments so an empty cell's
  // four edges can be skipped, leaving a true square gap.
  // ---------------------------------------------------------------------
  function drawGridLayer(cellSize, alpha, offsetX, offsetY, withGaps) {
    const colStart = Math.floor(-offsetX / cellSize) - 1;
    const colEnd = Math.ceil((W - offsetX) / cellSize) + 1;
    const rowStart = Math.floor(-offsetY / cellSize) - 1;
    const rowEnd = Math.ceil((H - offsetY) / cellSize) + 1;

    for (let pass = 0; pass < 2; pass++) {
      const wantBlue = pass === 0;
      ctx.beginPath();
      for (let row = rowStart; row <= rowEnd + 1; row++) {
        if (isBlueLineH(row) !== wantBlue) continue;
        const y = row * cellSize + offsetY;
        for (let col = colStart; col <= colEnd; col++) {
          if (withGaps && (isEmptyCell(col, row) || isEmptyCell(col, row - 1))) continue;
          const x1 = col * cellSize + offsetX;
          ctx.moveTo(x1, y);
          ctx.lineTo(x1 + cellSize, y);
        }
      }
      for (let col = colStart; col <= colEnd + 1; col++) {
        if (isBlueLineV(col) !== wantBlue) continue;
        const x = col * cellSize + offsetX;
        for (let row = rowStart; row <= rowEnd; row++) {
          if (withGaps && (isEmptyCell(col, row) || isEmptyCell(col - 1, row))) continue;
          const y1 = row * cellSize + offsetY;
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y1 + cellSize);
        }
      }
      const [r, g, b] = wantBlue ? BLUE_LINE : WHITE;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function strokeCellEdges(col, row, cellSize, offsetX, offsetY, color, alpha) {
    if (isEmptyCell(col, row) || alpha <= 0) return;
    const x = col * cellSize + offsetX;
    const y = row * cellSize + offsetY;
    ctx.beginPath();
    if (!isEmptyCell(col, row - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
    if (!isEmptyCell(col, row + 1)) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
    if (!isEmptyCell(col - 1, row)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
    if (!isEmptyCell(col + 1, row)) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
    const [r, g, b] = color;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // ---------------------------------------------------------------------
  // Travelers: a small marker hops cell to cell along the near grid
  // until it reaches a nearby empty cell.
  // ---------------------------------------------------------------------
  function findEmptyTarget(col0, row0) {
    for (let i = 0; i < SEARCH_ATTEMPTS; i++) {
      const hops = MIN_HOPS + ((Math.random() * (MAX_HOPS - MIN_HOPS)) | 0);
      const angle = Math.random() * Math.PI * 2;
      const dc = Math.round(Math.cos(angle) * hops);
      const dr = Math.round(Math.sin(angle) * hops);
      const col = col0 + dc, row = row0 + dr;
      if (isEmptyCell(col, row)) return { col, row };
    }
    return null;
  }

  function buildPath(col0, row0, colT, rowT) {
    const path = [{ col: col0, row: row0 }];
    let col = col0, row = row0;
    const stepCol = colT > col0 ? 1 : -1;
    while (col !== colT) { col += stepCol; path.push({ col, row }); }
    const stepRow = rowT > row0 ? 1 : -1;
    while (row !== rowT) { row += stepRow; path.push({ col, row }); }
    return path;
  }

  function spawnTraveler(now) {
    if (travelers.length >= MAX_TRAVELERS) return;
    const colStart = Math.floor(-nearOffX / NEAR_CELL);
    const colEnd = Math.ceil((W - nearOffX) / NEAR_CELL);
    const rowStart = Math.floor(-nearOffY / NEAR_CELL);
    const rowEnd = Math.ceil((H - nearOffY) / NEAR_CELL);
    const col0 = colStart + ((Math.random() * (colEnd - colStart)) | 0);
    const row0 = rowStart + ((Math.random() * (rowEnd - rowStart)) | 0);
    const target = findEmptyTarget(col0, row0);
    if (!target) return;
    const path = buildPath(col0, row0, target.col, target.row);
    if (path.length < 2) return;
    const timePerHop = NEAR_CELL / TRAVEL_SPEED;
    travelers.push({ path, startAt: now, timePerHop, target });
  }

  function updateTravelers(now) {
    for (let i = travelers.length - 1; i >= 0; i--) {
      const t = travelers[i];
      const totalMs = (t.path.length - 1) * t.timePerHop;
      const age = Math.max(0, now - t.startAt);
      if (age >= totalMs) {
        const litAt = t.startAt + totalMs;
        snapped.push({ col: t.target.col, row: t.target.row, snappedAt: litAt });
        pulses.push({ col: t.target.col, row: t.target.row, litAt });
        travelers.splice(i, 1);
      }
    }
  }

  function drawTravelers(now) {
    const size = NEAR_CELL * TRAVEL_MARKER_FRAC;
    ctx.fillStyle = `rgb(${BLUE_BRIGHT[0]},${BLUE_BRIGHT[1]},${BLUE_BRIGHT[2]})`;
    for (const t of travelers) {
      const age = Math.max(0, now - t.startAt);
      const hopIdx = Math.max(0, Math.min(Math.floor(age / t.timePerHop), t.path.length - 2));
      const localT = Math.min(1, (age - hopIdx * t.timePerHop) / t.timePerHop);
      const a = t.path[hopIdx], b = t.path[hopIdx + 1];
      const ax = a.col * NEAR_CELL + nearOffX, ay = a.row * NEAR_CELL + nearOffY;
      const bx = b.col * NEAR_CELL + nearOffX, by = b.row * NEAR_CELL + nearOffY;
      const x = ax + (bx - ax) * localT;
      const y = ay + (by - ay) * localT;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  // ---------------------------------------------------------------------
  // Snapped squares + pulses: the moment a traveler arrives.
  // ---------------------------------------------------------------------
  function drawSnapped(now) {
    for (let i = snapped.length - 1; i >= 0; i--) {
      const s = snapped[i];
      const age = now - s.snappedAt;
      if (age < 0) continue;
      let alpha;
      if (age < SNAP_HOLD_MS) alpha = 1;
      else if (age < SNAP_HOLD_MS + SNAP_FADE_MS) alpha = 1 - (age - SNAP_HOLD_MS) / SNAP_FADE_MS;
      else { snapped.splice(i, 1); continue; }
      const x = s.col * NEAR_CELL + nearOffX;
      const y = s.row * NEAR_CELL + nearOffY;
      ctx.fillStyle = `rgba(${BLUE_BRIGHT[0]},${BLUE_BRIGHT[1]},${BLUE_BRIGHT[2]},${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, NEAR_CELL, NEAR_CELL);
    }
  }

  function drawPulses(now) {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const age = now - p.litAt;
      if (age < 0) continue;
      if (age >= PULSE_MS) { pulses.splice(i, 1); continue; }
      const fade = 1 - age / PULSE_MS;
      for (let dc = -PULSE_RADIUS; dc <= PULSE_RADIUS; dc++) {
        for (let dr = -PULSE_RADIUS; dr <= PULSE_RADIUS; dr++) {
          const dist = Math.hypot(dc, dr);
          if (dist > PULSE_RADIUS + 0.4) continue;
          const falloff = Math.max(0, 1 - dist / (PULSE_RADIUS + 0.6));
          strokeCellEdges(p.col + dc, p.row + dr, NEAR_CELL, nearOffX, nearOffY, BLUE_BRIGHT, fade * falloff * 0.85);
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Scroll-triggered spawning
  // ---------------------------------------------------------------------
  function onScroll() {
    const now = performance.now();
    if (now - lastSpawnTime < SPAWN_THROTTLE_MS) return;
    lastSpawnTime = now;
    spawnTraveler(now);
  }
  if (!reduceMotion) {
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ---------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------
  function frame(now) {
    const dt = lastFrameTime != null ? now - lastFrameTime : 16;
    lastFrameTime = now;

    if (!reduceMotion) {
      farOffX -= FAR_VX * dt; farOffY -= FAR_VY * dt;
      nearOffX -= NEAR_VX * dt; nearOffY -= NEAR_VY * dt;
    }

    ctx.clearRect(0, 0, W, H);
    drawGridLayer(FAR_CELL, FAR_ALPHA, farOffX, farOffY, false);
    drawGridLayer(NEAR_CELL, NEAR_ALPHA, nearOffX, nearOffY, true);

    if (!reduceMotion) {
      updateTravelers(now);
      drawTravelers(now);
    }
    drawSnapped(now);
    drawPulses(now);

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) frame(performance.now());
  }, { passive: true });

  resize();
  if (reduceMotion) {
    frame(performance.now());
  } else {
    requestAnimationFrame(frame);
  }
})();
