(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // SilverXis kinetic background. Full-viewport, homepage-only, replaces
  // the previous canvas background entirely. Everything visible here is
  // built by this file into #kinetic-bg — index.html owns no words or
  // cards of its own; the real hero and page content are untouched
  // underneath.
  //
  // Motion:
  //   - Giant word (BUILD/SCALE/GROW) cross-fades on its own loop.
  //   - Cards + the shield logo orbit continuously (never button-driven);
  //     each card swaps to its next content set once per lap, timed to
  //     happen while it's smallest/least visible near the top of the
  //     orbit so the swap is never seen.
  //   - Position is a plain ellipse; scale is a smooth trig curve of the
  //     same angle so size and position stay perfectly in sync: smallest
  //     at the top of the orbit, half-max at the sides, full size at the
  //     bottom — giving the ring a "tilted circle" depth illusion.
  //   - Cards/logo/card outlines sit translucent at rest; a scroll or
  //     click snaps them to full brightness, which then decays back to
  //     translucent at the same speed.
  //
  // Under prefers-reduced-motion, the ring holds still at fixed positions
  // and the word doesn't cycle — nothing here moves without the visitor's
  // own input.
  // ---------------------------------------------------------------------

  const root = document.getElementById("kinetic-bg");
  if (!root) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------------------------------------------------------------
  // Scale curve: A + B*cos(theta) + C*cos(2*theta), solved so it passes
  // exactly through the three requested checkpoints — smallest at the
  // top of the orbit (theta=0), half of max at the sides (theta=90/270,
  // by construction of the cos(2*theta) term), full size at the bottom
  // (theta=180) — while staying smooth (pure trig) everywhere between.
  // ---------------------------------------------------------------------
  const SCALE_MIN = 0.16;
  const SCALE_SIDE = 0.5;
  const SCALE_MAX = 1.0;
  const SCALE_B = (SCALE_MIN - SCALE_MAX) / 2;
  const SCALE_A = (SCALE_MIN + SCALE_MAX) / 4 + SCALE_SIDE / 2;
  const SCALE_C = SCALE_A - SCALE_SIDE;
  function scaleAt(theta) {
    return SCALE_A + SCALE_B * Math.cos(theta) + SCALE_C * Math.cos(2 * theta);
  }

  const WORDS = ["BUILD", "SCALE", "GROW"];
  const CONTENT = [
    { kicker: "Build", title: "CUSTOM SOFTWARE", desc: "Applications engineered around how the business runs." },
    { kicker: "Connect", title: "IT STAFFING", desc: "Vetted talent, matched to the work that needs it." },
    { kicker: "Find", title: "DIGITAL MARKETING", desc: "Visibility that turns into qualified demand." },
    { kicker: "Automate", title: "AI & AUTOMATION", desc: "Removing friction from the paths that repeat." },
    { kicker: "Scale", title: "CLOUD & DATA", desc: "Infrastructure that grows with demand, not against it." },
    { kicker: "Grow", title: "GROWTH SYSTEMS", desc: "Technology, people, and marketing moving together." }
  ];
  const CARD_COUNT = 6;

  // ---------------------------------------------------------------------
  // Build static DOM (words, orbit shell, logo, cards). All of it lives
  // inside #kinetic-bg, which the page already marks aria-hidden.
  // ---------------------------------------------------------------------
  const wordsEl = document.createElement("div");
  wordsEl.className = "kb-words";
  const wordEls = WORDS.map((w, i) => {
    const span = document.createElement("span");
    span.className = "kb-word" + (i === 0 ? " is-active" : "");
    span.textContent = w;
    wordsEl.appendChild(span);
    return span;
  });

  const auraEl = document.createElement("div");
  auraEl.className = "kb-aurora-field";
  auraEl.innerHTML = '<div class="kb-aurora a"></div><div class="kb-aurora b"></div>';

  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = document.createElementNS(SVG_NS, "svg");
  svgEl.setAttribute("class", "kb-svg");
  const trackEllipse = document.createElementNS(SVG_NS, "ellipse");
  trackEllipse.setAttribute("class", "kb-track");
  svgEl.appendChild(trackEllipse);
  const spokes = [];

  const orbitEl = document.createElement("div");
  orbitEl.className = "kb-orbit";

  // Core rings: three purely-CSS-animated circular/elliptical lines around
  // the logo, each carrying a glowing dot that travels the ring for free
  // as it spins — no per-frame JS needed for these.
  const coreRingsEl = document.createElement("div");
  coreRingsEl.className = "kb-core-rings";
  ["r1", "r2", "r3"].forEach((cls) => {
    const ring = document.createElement("div");
    ring.className = "kb-core-ring " + cls;
    coreRingsEl.appendChild(ring);
  });
  orbitEl.appendChild(coreRingsEl);

  const logoWrap = document.createElement("div");
  logoWrap.className = "kb-logo-wrap";
  const logoImg = document.createElement("img");
  logoImg.src = "assets/silverxis-shield.png";
  logoImg.alt = "";
  logoWrap.appendChild(logoImg);
  orbitEl.appendChild(logoWrap);

  const cards = [];
  for (let i = 0; i < CARD_COUNT; i++) {
    const el = document.createElement("div");
    el.className = "kb-card";
    const inner = document.createElement("div");
    inner.className = "kb-card-inner";
    const kicker = document.createElement("span");
    kicker.className = "kb-card-kicker";
    const title = document.createElement("span");
    title.className = "kb-card-title";
    const desc = document.createElement("span");
    desc.className = "kb-card-desc";
    inner.appendChild(kicker);
    inner.appendChild(title);
    inner.appendChild(desc);
    el.appendChild(inner);
    orbitEl.appendChild(el);
    cards.push({
      el, kicker, title, desc,
      angle: (Math.PI * 2 * i) / CARD_COUNT,
      contentIndex: i % CONTENT.length,
      wrapped: false
    });

    const spoke = document.createElementNS(SVG_NS, "line");
    spoke.setAttribute("class", "kb-spoke");
    svgEl.appendChild(spoke);
    spokes.push(spoke);
  }

  // "Electrons": small glowing points that trace the same orbit track at
  // their own faster, independent speed — pure atmosphere, not tied to
  // card content or the interaction brightness toggle.
  const ELECTRON_COUNT = 4;
  const electrons = [];
  for (let i = 0; i < ELECTRON_COUNT; i++) {
    const el = document.createElement("div");
    el.className = "kb-electron";
    orbitEl.appendChild(el);
    electrons.push({ el, angle: (Math.PI * 2 * i) / ELECTRON_COUNT });
  }

  root.appendChild(auraEl);
  root.appendChild(svgEl);
  root.appendChild(wordsEl);
  root.appendChild(orbitEl);

  function applyCardContent(card) {
    const c = CONTENT[card.contentIndex];
    card.kicker.textContent = c.kicker;
    card.title.textContent = c.title;
    card.desc.textContent = c.desc;
  }
  cards.forEach(applyCardContent);

  // ---------------------------------------------------------------------
  // Layout: recomputed on resize. The ellipse's top sits at ~25% of the
  // viewport height and its bottom at ~75%, so "closest to the top
  // quarter" / "closest to the bottom quarter" are literally the two
  // ends of the vertical travel, with the sides landing at mid-height.
  // ---------------------------------------------------------------------
  let W = 0, H = 0, centerX = 0, centerY = 0, radiusX = 0, radiusY = 0;
  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    centerX = W / 2;
    centerY = H / 2;
    radiusX = W * 0.46;
    radiusY = H * 0.25;
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.setAttribute("width", W);
    svgEl.setAttribute("height", H);
    trackEllipse.setAttribute("cx", centerX);
    trackEllipse.setAttribute("cy", centerY);
    trackEllipse.setAttribute("rx", radiusX);
    trackEllipse.setAttribute("ry", radiusY);
  }
  window.addEventListener("resize", measure, { passive: true });
  measure();

  // ---------------------------------------------------------------------
  // Word cycle: independent ambient loop, gated off entirely for reduced
  // motion (it just holds on the first word).
  // ---------------------------------------------------------------------
  if (!reduceMotion) {
    let wordIdx = 0;
    setInterval(() => {
      wordEls[wordIdx].classList.remove("is-active");
      wordIdx = (wordIdx + 1) % wordEls.length;
      wordEls[wordIdx].classList.add("is-active");
    }, 6400);
  }

  // ---------------------------------------------------------------------
  // Interaction brightness: a click snaps to full brightness; a scroll
  // only nudges it slightly brighter. Both decay back to the translucent
  // resting level just as quickly. --kb-fade drives card-inner/logo/
  // card-outline opacity together, so they all fade in and out in
  // lockstep.
  // ---------------------------------------------------------------------
  const FADE_REST = 0.12;
  const FADE_SCROLL = 0.45;
  const FADE_IN_MS = 320;
  const FADE_OUT_MS = 320;
  let fade = FADE_REST;
  let fadeTarget = FADE_REST;
  let fadeRateMs = FADE_OUT_MS;
  let lastFrameTime = null;

  function triggerBright(target) {
    fadeTarget = target;
    fadeRateMs = FADE_IN_MS;
  }
  let restTimer = null;
  function scheduleRest() {
    if (restTimer) clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      fadeTarget = FADE_REST;
      fadeRateMs = FADE_OUT_MS;
    }, 90);
  }
  function onActivity(target) {
    triggerBright(target);
    scheduleRest();
  }
  if (!reduceMotion) {
    window.addEventListener("scroll", () => onActivity(FADE_SCROLL), { passive: true });
    window.addEventListener("click", () => onActivity(1), { passive: true });
  }

  // ---------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------
  const ANGULAR_SPEED = (Math.PI * 2) / 208000; // one full lap ~208s (eighth of original speed)

  function frame(now) {
    const dt = lastFrameTime != null ? now - lastFrameTime : 16;
    lastFrameTime = now;

    if (!reduceMotion) {
      fade += (fadeTarget - fade) * clamp01(dt / fadeRateMs);
      root.style.setProperty("--kb-fade", fade.toFixed(3));
    }

    cards.forEach((card, i) => {
      if (!reduceMotion) card.angle += ANGULAR_SPEED * dt;
      const theta = card.angle % (Math.PI * 2);
      const normalized = theta < 0 ? theta + Math.PI * 2 : theta;

      // Swap content once per lap, timed to the moment the card is
      // smallest (near the top) so the change is effectively invisible.
      const nearTop = normalized < 0.18 || normalized > Math.PI * 2 - 0.18;
      if (nearTop && !card.wrapped) {
        card.contentIndex = (card.contentIndex + 1) % CONTENT.length;
        applyCardContent(card);
        card.wrapped = true;
      } else if (!nearTop) {
        card.wrapped = false;
      }

      const s = scaleAt(normalized);
      const x = centerX + Math.sin(normalized) * radiusX;
      const y = centerY - Math.cos(normalized) * radiusY;
      card.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      card.el.style.zIndex = String(Math.round(s * 100));

      const spoke = spokes[i];
      spoke.setAttribute("x1", centerX);
      spoke.setAttribute("y1", centerY);
      spoke.setAttribute("x2", x);
      spoke.setAttribute("y2", y);
      spoke.setAttribute("stroke-opacity", (0.12 + 0.4 * fade).toFixed(3));
    });

    electrons.forEach((e) => {
      if (!reduceMotion) e.angle += ANGULAR_SPEED * 5.2 * dt;
      const theta = e.angle % (Math.PI * 2);
      const normalized = theta < 0 ? theta + Math.PI * 2 : theta;
      const s = 0.55 + 0.45 * scaleAt(normalized);
      const x = centerX + Math.sin(normalized) * radiusX;
      const y = centerY - Math.cos(normalized) * radiusY;
      e.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
    });

    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    // Static ring at fixed evenly-spaced positions, one render, no loop.
    // Electrons are pure ambient motion with no static meaning, so they're
    // hidden entirely under reduced motion (see the CSS); spokes stay,
    // since they show real structure (logo-to-card links) at rest.
    function layoutStatic() {
      cards.forEach((card, i) => {
        const theta = card.angle;
        const s = scaleAt(theta);
        const x = centerX + Math.sin(theta) * radiusX;
        const y = centerY - Math.cos(theta) * radiusY;
        card.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        card.el.style.zIndex = String(Math.round(s * 100));

        const spoke = spokes[i];
        spoke.setAttribute("x1", centerX);
        spoke.setAttribute("y1", centerY);
        spoke.setAttribute("x2", x);
        spoke.setAttribute("y2", y);
        spoke.setAttribute("stroke-opacity", "0.16");
      });
    }
    layoutStatic();
    root.style.setProperty("--kb-fade", "0.3");
    window.addEventListener("resize", () => {
      measure();
      layoutStatic();
    });
  } else {
    requestAnimationFrame(frame);
  }
})();
