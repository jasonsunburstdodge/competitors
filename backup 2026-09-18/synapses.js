(() => {
  "use strict";

  const canvas = document.getElementById("synapse-canvas");
  const ctx = canvas.getContext("2d");

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  const NODE_COUNT = 1120;
  const WORLD_X = 1300;
  const WORLD_Y = 850;
  const TOTAL_DEPTH = 6400;
  const FOCAL = 460;
  const NEAR_CLIP = 26;
  const FAR_CLIP = 1500;
  const CONNECT_MAX_DIST = 260;
  const MAX_NEIGHBORS = 4;

  const DUST_COUNT = 260;
  const DUST_FAR_CLIP = 2800;

  const STREAK_VELOCITY_THRESHOLD = 0.8; // world units/frame before streaks appear
  const STREAK_DEPTH_LIMIT = 260; // only nodes this close to camera streak

  // Per-page theme override: a page can set window.SYNAPSE_THEME = { primary, accent, accentRatio, words }
  // in an inline <script> before this file loads. Anything it omits falls back to the site default below.
  const theme = window.SYNAPSE_THEME || {};

  const ACCENT_RATIO = theme.accentRatio != null ? theme.accentRatio : 0.14;

  // Default vocabulary drawn from SilverXis's own pillars, not generic filler.
  const WORDS = theme.words || [
    "Intelligence", "Craft", "Strategy", "Findable", "Noticed", "Chosen",
    "Visibility", "Attention", "Conversion", "Positioning", "Distinction",
    "Momentum", "SEO", "AEO", "GEO", "Obvious",
    "Innovation", "Imagination", "Ingenuity", "Originality", "Vision",
    "Artistry", "Ideas", "Breakthrough", "Clarity", "Inventive"
  ];

  const BLUE = theme.primary || [92, 178, 250];
  const AMBER = theme.accent || [255, 165, 80];
  const WORD_COLOR = theme.wordColor || [235, 244, 255];
  const WORD_GLOW = theme.wordGlow || [150, 200, 255];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0, height = 0;

  const camera = { z: 0, targetZ: 0, prevZ: 0, x: 0, y: 0 };
  const pointer = { x: null, y: null, lastSpawn: 0 };

  let nodes = [];
  let dust = [];
  let edges = [];
  let visibleEdges = []; // recomputed each frame: projected screen coords
  let signals = [];
  let flares = [];
  let lastWord = null;
  let startTime = performance.now();
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildNetwork() {
    nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({
        id: i,
        x: (Math.random() * 2 - 1) * WORLD_X,
        y: (Math.random() * 2 - 1) * WORLD_Y,
        z: Math.random() * TOTAL_DEPTH,
        accent: Math.random() < ACCENT_RATIO,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8,
        degree: 0,
        lastFlare: -Infinity
      });
    }

    // Build edges: connect each node to its nearest few neighbors within range.
    const edgeSet = new Set();
    edges = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const dists = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < CONNECT_MAX_DIST) dists.push([d, j]);
      }
      dists.sort((p, q) => p[0] - q[0]);
      for (let k = 0; k < Math.min(MAX_NEIGHBORS, dists.length); k++) {
        const j = dists[k][1];
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ a: i, b: j });
        }
      }
    }

    edges.forEach(e => {
      nodes[e.a].degree++;
      nodes[e.b].degree++;
    });
  }

  function buildDust() {
    dust = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      dust.push({
        x: (Math.random() * 2 - 1) * WORLD_X * 1.6,
        y: (Math.random() * 2 - 1) * WORLD_Y * 1.6,
        z: Math.random() * TOTAL_DEPTH,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5
      });
    }
  }

  // ---------------------------------------------------------------------
  // Scroll -> camera depth
  // ---------------------------------------------------------------------
  function updateCameraTarget() {
    const doc = document.documentElement;
    const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    camera.targetZ = progress * (TOTAL_DEPTH - FAR_CLIP - 50);
  }

  // ---------------------------------------------------------------------
  // Projection
  // ---------------------------------------------------------------------
  function project(node, t, camZ, camX, camY, farClip) {
    const depth = node.z - camZ;
    const far = farClip || FAR_CLIP;
    if (depth < NEAR_CLIP || depth > far) return null;
    const scale = FOCAL / depth;
    const wobbleX = reduceMotion ? 0 : Math.sin(t * 0.0004 * node.speed + node.phase) * 6;
    const wobbleY = reduceMotion ? 0 : Math.cos(t * 0.00035 * node.speed + node.phase) * 6;
    const sx = width / 2 + (node.x - camX + wobbleX) * scale;
    const sy = height / 2 + (node.y - camY + wobbleY) * scale;
    const fadeNear = Math.min(1, (depth - NEAR_CLIP) / 120);
    const fadeFar = Math.min(1, (far - depth) / (far * 0.28));
    const alpha = Math.max(0, Math.min(fadeNear, fadeFar));
    return { x: sx, y: sy, scale, depth, alpha };
  }

  // ---------------------------------------------------------------------
  // Pointer handling -> spawn signals toward nearest junction
  // ---------------------------------------------------------------------
  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { x: ax + dx * t, y: ay + dy * t, t };
  }

  function trySpawnSignal(px, py) {
    const now = performance.now();
    if (now - pointer.lastSpawn < 160) return;
    if (signals.length >= 6) return;
    if (!visibleEdges.length) return;

    let best = null;
    let bestDist = 70; // px threshold
    for (const e of visibleEdges) {
      const cp = closestPointOnSegment(px, py, e.ax, e.ay, e.bx, e.by);
      const dx = px - cp.x, dy = py - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = { edge: e, cp };
      }
    }
    if (!best) return;

    const { edge, cp } = best;
    const nodeA = nodes[edge.a];
    const nodeB = nodes[edge.b];
    // Prefer the higher-degree endpoint as the "junction" target.
    const target = nodeA.degree >= nodeB.degree ? edge : { a: edge.b, b: edge.a };
    const targetNode = nodes[target.a];
    const targetProj = target.a === edge.a ? edge.aProj : edge.bProj;

    signals.push({
      startX: cp.x,
      startY: cp.y,
      endX: targetProj.x,
      endY: targetProj.y,
      targetNodeId: targetNode.id,
      t: 0,
      duration: 380 + Math.random() * 220,
      born: now
    });
    pointer.lastSpawn = now;
  }

  // Fire a signal toward the junction of every currently visible edge at once,
  // staggered slightly so it reads as a wave rather than a single flash.
  // Exposed on window so other UI (e.g. the site menu button) can trigger it.
  function fireAllVisible() {
    const now = performance.now();
    const firedTargets = new Set();
    for (const e of visibleEdges) {
      const nodeA = nodes[e.a];
      const nodeB = nodes[e.b];
      const target = nodeA.degree >= nodeB.degree ? e : { a: e.b, b: e.a };
      const targetNode = nodes[target.a];
      if (firedTargets.has(targetNode.id)) continue;
      firedTargets.add(targetNode.id);
      const targetIsA = target.a === e.a;
      const targetProj = targetIsA ? e.aProj : e.bProj;
      const startProj = targetIsA ? e.bProj : e.aProj;

      signals.push({
        startX: startProj.x,
        startY: startProj.y,
        endX: targetProj.x,
        endY: targetProj.y,
        targetNodeId: targetNode.id,
        t: 0,
        duration: 380 + Math.random() * 320,
        born: now + Math.random() * 320
      });
    }
  }
  window.fireAllSynapses = fireAllVisible;

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    trySpawnSignal(pointer.x, pointer.y);
  }

  function onTouchMove(e) {
    if (!e.touches || !e.touches.length) return;
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    pointer.x = t.clientX - rect.left;
    pointer.y = t.clientY - rect.top;
    trySpawnSignal(pointer.x, pointer.y);
  }

  function pickWord() {
    let w = WORDS[(Math.random() * WORDS.length) | 0];
    let guard = 0;
    while (w === lastWord && guard++ < 5) {
      w = WORDS[(Math.random() * WORDS.length) | 0];
    }
    lastWord = w;
    return w;
  }

  function fireFlare(nodeId, x, y) {
    const node = nodes[nodeId];
    if (node) node.lastFlare = performance.now();
    flares.push({
      x, y,
      born: performance.now(),
      duration: 1300,
      word: pickWord()
    });
  }

  // ---------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------
  function drawBackgroundDrift(t) {
    if (reduceMotion) return;
    camera.x = Math.sin(t * 0.00006) * 40;
    camera.y = Math.cos(t * 0.00008) * 24;
  }

  function drawDust(t) {
    for (const d of dust) {
      const p = project(d, t, camera.z, camera.x, camera.y, DUST_FAR_CLIP);
      if (!p || p.alpha <= 0.01) continue;
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.0012 * d.speed + d.phase);
      const r = Math.max(0.4, p.scale * 1.1);
      const alpha = p.alpha * 0.35 * twinkle;
      ctx.fillStyle = `rgba(150,190,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEdges(t) {
    visibleEdges = [];
    ctx.lineCap = "round";
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const pa = project(a, t, camera.z, camera.x, camera.y);
      const pb = project(b, t, camera.z, camera.x, camera.y);
      if (!pa || !pb) continue;
      if (pa.alpha <= 0.02 && pb.alpha <= 0.02) continue;

      const alpha = Math.min(pa.alpha, pb.alpha) * 0.55;
      const avgScale = (pa.scale + pb.scale) / 2;
      const color = a.accent || b.accent ? AMBER : BLUE;

      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
      ctx.lineWidth = Math.max(0.4, avgScale * 1.1);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      visibleEdges.push({ a: e.a, b: e.b, ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, aProj: pa, bProj: pb });
    }
  }

  function drawNodes(t, velocity) {
    const streaking = !reduceMotion && Math.abs(velocity) > STREAK_VELOCITY_THRESHOLD;
    for (const n of nodes) {
      const p = project(n, t, camera.z, camera.x, camera.y);
      if (!p || p.alpha <= 0.02) continue;

      const twinkle = 0.75 + 0.25 * Math.sin(t * 0.002 * n.speed + n.phase);
      const flareAge = t - n.lastFlare;
      const flareBoost = flareAge < 600 ? (1 - flareAge / 600) : 0;

      const baseR = Math.max(0.6, p.scale * 2.4) * twinkle;
      const r = baseR + flareBoost * baseR * 3.5;
      const color = n.accent ? AMBER : BLUE;
      const alpha = p.alpha * (0.55 + flareBoost * 0.45);

      // Streak: near, fast-approaching nodes draw as a light trail rather
      // than a dot, selling the sense of travelling deeper through the field.
      if (streaking && p.depth < STREAK_DEPTH_LIMIT && flareBoost === 0) {
        const pPrev = project(n, t, camera.prevZ, camera.x, camera.y);
        if (pPrev) {
          const grad = ctx.createLinearGradient(pPrev.x, pPrev.y, p.x, p.y);
          grad.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0)`);
          grad.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},${Math.min(1, alpha * 1.4)})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(0.8, r * 0.6);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(pPrev.x, pPrev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }

      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
      glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha + 0.2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, r * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSignals(now) {
    signals = signals.filter(s => now - s.born < s.duration + 40);
    for (const s of signals) {
      let t = (now - s.born) / s.duration;
      t = Math.min(1, Math.max(0, t));
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const x = s.startX + (s.endX - s.startX) * eased;
      const y = s.startY + (s.endY - s.startY) * eased;

      // trailing glow line
      const grad = ctx.createLinearGradient(s.startX, s.startY, x, y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.9)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.startX, s.startY);
      ctx.lineTo(x, y);
      ctx.stroke();

      // traveling glow dot
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.4, "rgba(150,200,255,0.6)");
      glow.addColorStop(1, "rgba(150,200,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();

      if (t >= 1 && !s.fired) {
        s.fired = true;
        fireFlare(s.targetNodeId, s.endX, s.endY);
      }
    }
  }

  function drawFlares(now) {
    flares = flares.filter(f => now - f.born < f.duration);
    for (const f of flares) {
      const t = (now - f.born) / f.duration;

      // expanding ring at the junction
      const ringT = Math.min(1, t / 0.5);
      const ringR = 6 + ringT * 46;
      const ringAlpha = (1 - ringT) * 0.8;
      ctx.strokeStyle = `rgba(200,225,255,${Math.max(0, ringAlpha)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // word: quick flare in, hold briefly, fade out, drifting upward
      let scale, alpha;
      if (t < 0.18) {
        const p = t / 0.18;
        scale = 0.6 + p * 0.6;
        alpha = p;
      } else if (t < 0.55) {
        scale = 1.2 - (t - 0.18) / 0.37 * 0.2;
        alpha = 1;
      } else {
        const p = (t - 0.55) / 0.45;
        scale = 1.0 + p * 0.15;
        alpha = Math.max(0, 1 - p);
      }
      const rise = t * 22;

      ctx.save();
      ctx.translate(f.x, f.y - 26 - rise);
      ctx.scale(scale, scale);
      ctx.font = "600 20px 'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = `rgba(${WORD_GLOW[0]},${WORD_GLOW[1]},${WORD_GLOW[2]},${alpha})`;
      ctx.shadowBlur = 18;
      ctx.fillStyle = `rgba(${WORD_COLOR[0]},${WORD_COLOR[1]},${WORD_COLOR[2]},${alpha})`;
      ctx.fillText(f.word, 0, 0);
      ctx.restore();
    }
  }

  function drawVignette() {
    const r = Math.max(width, height) * 0.75;
    const g = ctx.createRadialGradient(width / 2, height / 2, r * 0.35, width / 2, height / 2, r);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(2,3,8,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  function frame() {
    const now = performance.now();
    const t = now - startTime;

    camera.prevZ = camera.z;
    camera.z = reduceMotion ? camera.targetZ : camera.z + (camera.targetZ - camera.z) * 0.08;
    const velocity = camera.z - camera.prevZ;

    ctx.clearRect(0, 0, width, height);
    drawBackgroundDrift(t);
    drawDust(t);
    drawEdges(t);
    drawNodes(t, velocity);
    drawSignals(now);
    drawFlares(now);
    drawVignette();

    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  resize();
  buildNetwork();
  buildDust();
  updateCameraTarget();
  camera.z = camera.targetZ;
  camera.prevZ = camera.z;

  window.addEventListener("resize", () => { resize(); });
  window.addEventListener("scroll", updateCameraTarget, { passive: true });
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchstart", onTouchMove, { passive: true });

  requestAnimationFrame(frame);
})();
