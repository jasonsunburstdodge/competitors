(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Custom Software Development background: the SilverXis shield sits
  // at the center of the screen, invisible at rest. Scrolling fades it
  // into view; when scrolling stops, it quickly fades back out. Each
  // scroll also fires a burst of tiny, bright, single-color spark
  // dashes (white, blue, SilverXis blue, orange) outward from it in a
  // random direction — up, down, left, or right — staggered a moment
  // apart. Each spark moves in straight horizontal/vertical hops,
  // turning at right angles, until it runs off whichever edge of the
  // screen it heads toward.
  //
  // The leading dash itself is crisp and flat — no glow — but it drags
  // a short trail behind it in the same color that glows briefly and
  // fades quickly.
  //
  // When a spark exits the screen, it fires an "answering" spark back
  // from that exit point, traveling inward and back out the same way
  // until it too runs off screen.
  //
  // Occasionally, as a spark passes a point along its path, a circuit
  // component lights up there — a blue capacitor, microchip, or
  // inductor carrying a short software-success term, or a diode in
  // random orange or blue with no label — then fades back to
  // invisible. Most sparks light up nothing at all.
  //
  // Under prefers-reduced-motion: the shield sits static at rest, no
  // sparks, no lighting up — nothing here moves without being asked to.
  // ---------------------------------------------------------------------

  const canvas = document.getElementById("csd-wires-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scriptEl = document.currentScript;
  const scriptBase = scriptEl ? scriptEl.src.slice(0, scriptEl.src.lastIndexOf("/") + 1) : "";
  const shieldImg = new Image();
  shieldImg.src = scriptBase + "../assets/silverxis-shield.png";
  const SHIELD_MAX_ALPHA = 0.95; // fully faded in, while actively scrolling
  const SHIELD_FADE_IN_MS = 260;
  const SHIELD_FADE_OUT_MS = 180; // "quickly fades out" once scrolling stops
  const SHIELD_REST_DELAY_MS = 90; // gap of no scroll events before fade-out begins

  // White, blue, SilverXis blue, and orange — each spark is a single
  // flat one of these, never a blend.
  const SPARK_COLORS = [
    [235, 244, 255], // white
    [140, 190, 255], // blue
    [47, 134, 245],  // SilverXis blue
    [255, 150, 60]   // orange
  ];

  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // down, up, right, left
  const SEG_LEN_MIN = 40, SEG_LEN_MAX = 130;
  const MAX_SEGMENTS = 9;
  const SPARK_SPEED = 0.62; // px/ms
  const DASH_LEN = 12;
  const SPARK_WIDTH = 1.8;
  const TRAIL_MS = 170; // short, fades quickly
  const TRAIL_WIDTH = 1.3;
  const MAX_ACTIVE = 40;
  const SPAWN_THROTTLE_MS = 140;
  const SPAWN_STAGGER_MS = 90;

  const CIRCUIT_BLUE = [120, 180, 255];
  const DIODE_COLORS = [[255, 150, 60], [120, 180, 255]]; // random orange or blue
  const LABELED_TYPES = ["capacitor", "microchip", "inductor"];
  const SUCCESS_TERMS = ["BUILD", "SCALE", "SHIP", "SECURE", "DEPLOY", "AUTOMATE", "INTEGRATE", "OPTIMIZE", "MODERNIZE", "CONNECT"];
  const LABELED_CHANCE = 0.12; // "some" sparks
  const DIODE_CHANCE = 0.10; // "some" sparks — most (78%) light up nothing
  const COMPONENT_FADE_IN_MS = 160;
  const COMPONENT_HOLD_MS = 550;
  const COMPONENT_FADE_OUT_MS = 550;
  const MAX_COMPONENTS = 16;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let shieldX = 0, shieldY = 0;
  let sparks = [];
  let components = [];
  let lastSpawnTime = 0;
  let lastFrameTime = null;
  let shieldAlpha = 0;
  let shieldTarget = 0;
  let shieldRateMs = SHIELD_FADE_OUT_MS;
  let shieldRestTimer = null;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function pathWithLengths(points) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
      segs.push({ a, b, len, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, start: total });
      total += len;
    }
    return { segs, total };
  }

  // Random orthogonal walk: mostly continues in the biased direction,
  // occasionally jogs 90 degrees the other way, until it runs off
  // whichever edge of the canvas it's heading toward.
  function generateWalk(x0, y0, biasIdx) {
    const perp = (biasIdx === 0 || biasIdx === 1) ? [2, 3] : [0, 1];
    const pts = [{ x: x0, y: y0 }];
    let x = x0, y = y0;
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const d = Math.random() < 0.58 ? biasIdx : perp[(Math.random() * 2) | 0];
      const [dx, dy] = DIRS[d];
      const segLen = SEG_LEN_MIN + Math.random() * (SEG_LEN_MAX - SEG_LEN_MIN);
      x += dx * segLen;
      y += dy * segLen;
      pts.push({ x, y });
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) break;
    }
    return pts;
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    shieldX = W * 0.5;
    shieldY = H * 0.5;

    sparks = [];
    components = [];
  }

  // ---------------------------------------------------------------------
  // Circuit components: most paths light up nothing. When one does, it
  // picks a point along the path and times its reveal to when a spark
  // would actually reach that point.
  // ---------------------------------------------------------------------
  function maybeSpawnComponent(pathInfo, baseStartAt) {
    if (pathInfo.total < 80 || components.length >= MAX_COMPONENTS) return;
    const r = Math.random();
    let type, color, label = null;
    if (r < LABELED_CHANCE) {
      type = LABELED_TYPES[(Math.random() * LABELED_TYPES.length) | 0];
      color = CIRCUIT_BLUE;
      label = SUCCESS_TERMS[(Math.random() * SUCCESS_TERMS.length) | 0];
    } else if (r < LABELED_CHANCE + DIODE_CHANCE) {
      type = "diode";
      color = DIODE_COLORS[(Math.random() * DIODE_COLORS.length) | 0];
    } else {
      return; // most sparks: nothing
    }

    const dist = pathInfo.total * (0.25 + Math.random() * 0.55);
    let seg = pathInfo.segs[pathInfo.segs.length - 1];
    for (const sg of pathInfo.segs) {
      if (dist <= sg.start + sg.len) { seg = sg; break; }
    }
    const local = dist - seg.start;
    components.push({
      type, color, label,
      x: seg.a.x + seg.dx * local,
      y: seg.a.y + seg.dy * local,
      litAt: baseStartAt + dist / SPARK_SPEED
    });
  }

  function componentAlpha(age) {
    if (age < COMPONENT_FADE_IN_MS) return age / COMPONENT_FADE_IN_MS;
    if (age < COMPONENT_FADE_IN_MS + COMPONENT_HOLD_MS) return 1;
    const t2 = age - COMPONENT_FADE_IN_MS - COMPONENT_HOLD_MS;
    if (t2 < COMPONENT_FADE_OUT_MS) return 1 - t2 / COMPONENT_FADE_OUT_MS;
    return -1;
  }

  // Sized so a full success term reads clearly at normal viewing size,
  // not just under zoom.
  function drawComponentShape(type, label) {
    ctx.lineWidth = 1.6;
    if (type === "capacitor") {
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-9, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, -15); ctx.lineTo(-9, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -15); ctx.lineTo(9, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(30, 0); ctx.stroke();
    } else if (type === "inductor") {
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.lineTo(-26, 0);
      for (let i = 0; i < 4; i++) ctx.arc(-26 + 13 + i * 13, 0, 6.5, Math.PI, 0, false);
      ctx.lineTo(34, 0);
      ctx.stroke();
    } else if (type === "microchip") {
      ctx.beginPath(); ctx.moveTo(-42, 0); ctx.lineTo(-34, 0); ctx.stroke();
      ctx.strokeRect(-34, -19, 68, 38);
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(42, 0); ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 13, -19); ctx.lineTo(i * 13, -26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * 13, 19); ctx.lineTo(i * 13, 26); ctx.stroke();
      }
    } else if (type === "diode") {
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-11, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(-11, 11); ctx.lineTo(11, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(11, -13); ctx.lineTo(11, 13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(30, 0); ctx.stroke();
    }
    if (label) {
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, type === "microchip" ? 0 : 34);
    }
  }

  function drawComponents(now) {
    for (let i = components.length - 1; i >= 0; i--) {
      const c = components[i];
      const age = now - c.litAt;
      if (age < 0) continue;
      const alpha = componentAlpha(age);
      if (alpha < 0) { components.splice(i, 1); continue; }
      const [r, g, b] = c.color;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      drawComponentShape(c.type, c.label);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------
  function drawSparks(now) {
    for (const s of sparks) {
      if (now < s.startAt || !s.pos || !s.dir) continue;
      const [r, g, b] = SPARK_COLORS[s.colorIdx];

      // Trail first, glowing and fading, behind the leading dash.
      if (s.trail.length > 1) {
        ctx.lineWidth = TRAIL_WIDTH;
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        for (let i = 1; i < s.trail.length; i++) {
          const age = now - s.trail[i].t;
          if (age >= TRAIL_MS) continue;
          const alpha = (1 - age / TRAIL_MS) * 0.55;
          ctx.shadowBlur = 5 * (1 - age / TRAIL_MS);
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
          ctx.lineTo(s.trail[i].x, s.trail[i].y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // Leading dash: crisp, flat, no glow.
      const half = DASH_LEN / 2;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = SPARK_WIDTH;
      ctx.beginPath();
      ctx.moveTo(s.pos.x - s.dir.dx * half, s.pos.y - s.dir.dy * half);
      ctx.lineTo(s.pos.x + s.dir.dx * half, s.pos.y + s.dir.dy * half);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------
  // Spark travel
  // ---------------------------------------------------------------------
  function spawnAnswer(fromPoint, now) {
    if (sparks.length >= MAX_ACTIVE) return;
    const x0 = Math.max(4, Math.min(W - 4, fromPoint.x));
    const y0 = Math.max(4, Math.min(H - 4, fromPoint.y));
    const biasIdx = (Math.random() * 4) | 0;
    const pathInfo = pathWithLengths(generateWalk(x0, y0, biasIdx));
    sparks.push({
      pathInfo,
      startAt: now,
      colorIdx: (Math.random() * SPARK_COLORS.length) | 0,
      kind: "up",
      pos: null,
      dir: null,
      trail: []
    });
    maybeSpawnComponent(pathInfo, now);
  }

  function updateSparks(now) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (now < s.startAt) continue;
      const dist = SPARK_SPEED * (now - s.startAt);
      const segs = s.pathInfo.segs;
      if (dist >= s.pathInfo.total || segs.length === 0) {
        if (s.kind === "down") {
          spawnAnswer(segs.length ? segs[segs.length - 1].b : s.pathInfo.segs[0].a, now);
        }
        sparks.splice(i, 1);
        continue;
      }
      let seg = segs[segs.length - 1];
      for (const sg of segs) {
        if (dist <= sg.start + sg.len) { seg = sg; break; }
      }
      const localDist = dist - seg.start;
      s.pos = { x: seg.a.x + seg.dx * localDist, y: seg.a.y + seg.dy * localDist };
      s.dir = { dx: seg.dx, dy: seg.dy };

      s.trail.push({ x: s.pos.x, y: s.pos.y, t: now });
      while (s.trail.length > 1 && now - s.trail[0].t > TRAIL_MS) s.trail.shift();
    }
  }

  // ---------------------------------------------------------------------
  // Scroll-triggered spawning: one random path per throttled tick,
  // radiating outward from the shield in a random direction, one spark
  // per color fired along it at staggered moments. Also lights up the
  // shield itself.
  // ---------------------------------------------------------------------
  function onScroll() {
    const now = performance.now();

    shieldTarget = 1;
    shieldRateMs = SHIELD_FADE_IN_MS;
    if (shieldRestTimer) clearTimeout(shieldRestTimer);
    shieldRestTimer = setTimeout(() => {
      shieldTarget = 0;
      shieldRateMs = SHIELD_FADE_OUT_MS;
    }, SHIELD_REST_DELAY_MS);

    if (now - lastSpawnTime < SPAWN_THROTTLE_MS) return;
    lastSpawnTime = now;

    const biasIdx = (Math.random() * 4) | 0;
    const jitter = 18;
    const x0 = shieldX + (Math.random() - 0.5) * jitter;
    const y0 = shieldY + (Math.random() - 0.5) * jitter;
    const pathInfo = pathWithLengths(generateWalk(x0, y0, biasIdx));
    for (let c = 0; c < SPARK_COLORS.length; c++) {
      if (sparks.length >= MAX_ACTIVE) break;
      const startAt = now + c * SPAWN_STAGGER_MS + Math.random() * SPAWN_STAGGER_MS * 0.6;
      sparks.push({ pathInfo, startAt, colorIdx: c, kind: "down", pos: null, dir: null, trail: [] });
    }
    maybeSpawnComponent(pathInfo, now);
  }
  if (!reduceMotion) {
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ---------------------------------------------------------------------
  // The shield: invisible at rest, fading into view while scrolling and
  // quickly back out once scrolling stops.
  // ---------------------------------------------------------------------
  function drawShield(now, dt) {
    if (!reduceMotion) {
      shieldAlpha += (shieldTarget - shieldAlpha) * clamp01(dt / shieldRateMs);
    }
    const alpha = shieldAlpha * SHIELD_MAX_ALPHA;
    const size = Math.min(W, H) * 0.16;

    if (alpha > 0.02) {
      const glow = ctx.createRadialGradient(shieldX, shieldY, 0, shieldX, shieldY, size * 1.3);
      glow.addColorStop(0, `rgba(255,255,255,${(0.55 * alpha).toFixed(3)})`);
      glow.addColorStop(0.5, `rgba(120,180,255,${(0.28 * alpha).toFixed(3)})`);
      glow.addColorStop(1, "rgba(120,180,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, size * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (alpha > 0.02 && shieldImg.complete && shieldImg.naturalWidth > 0) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(shieldImg, shieldX - size / 2, shieldY - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------
  function frame(now) {
    const dt = lastFrameTime != null ? now - lastFrameTime : 16;
    lastFrameTime = now;
    ctx.clearRect(0, 0, W, H);
    updateSparks(now);
    drawComponents(now);
    drawSparks(now);
    drawShield(now, dt);
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
