(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Free Software Needs Assessment
  //
  // A transparent, rules-based questionnaire. Every answer adds a fixed,
  // documented weight to one or more of six opportunity categories (see
  // CATEGORY_WEIGHTS below). There is no hidden scoring, no AI model, and
  // no fake precision — the result is a direct, readable function of the
  // choices the visitor made.
  //
  // Flow: problem -> friction (+impact) -> environment (+connectivity)
  //       -> growth (+timeline) -> open question -> results -> optional
  //       expert-review handoff.
  // ---------------------------------------------------------------------

  const root = document.getElementById("assess-app");
  if (!root) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // -----------------------------------------------------------------
  // Analytics: a thin, documented integration point. Pushes to
  // window.dataLayer when present (GTM/GA4), and always dispatches a
  // DOM CustomEvent so any other listener can hook in later. No PII is
  // ever included in event params.
  // -----------------------------------------------------------------
  function trackEvent(name, params) {
    const detail = Object.assign({ event: name }, params || {});
    try {
      if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
    } catch (e) { /* analytics must never break the assessment */ }
    document.dispatchEvent(new CustomEvent("silverxis:analytics", { detail }));
  }

  // -----------------------------------------------------------------
  // Category metadata + real, existing SilverXis service pages.
  // Three categories currently share two dedicated sub-pages because
  // that's the actual site structure today (no page is invented here).
  // -----------------------------------------------------------------
  const CATEGORIES = {
    customApps: {
      label: "Custom Application Development",
      href: "../custom-applications/index.html",
      blurb: "Build or reshape a custom application around the way your business actually works."
    },
    integration: {
      label: "Systems Integration & APIs",
      href: "../systems-integration/index.html",
      blurb: "Connect the platforms you already run so information and work move without manual handoffs."
    },
    modernization: {
      label: "Application Modernization",
      href: "../systems-integration/index.html",
      blurb: "Extend or update what you already have instead of an unnecessary full rebuild."
    },
    scalable: {
      label: "Scalable Software & Cloud Solutions",
      href: "../scalable-software/index.html",
      blurb: "Give your architecture room to support more users, locations, and transactions."
    },
    data: {
      label: "Data & Analytics",
      href: "../scalable-software/index.html",
      blurb: "Make the information you already have easier to connect, access, and act on."
    },
    ai: {
      label: "AI & Automation",
      href: "../scalable-software/index.html",
      blurb: "Automate repetitive work and introduce AI where the systems and data are ready to support it."
    }
  };

  // -----------------------------------------------------------------
  // Step definitions. Each multi-select option carries the category
  // weights it contributes. "Not sure" style options intentionally
  // carry no weight — they are a valid, honest answer.
  // -----------------------------------------------------------------
  const STEP_STAGE = {
    problem: "Problem", friction: "Friction", impact: "Friction",
    environment: "Technology", connectivity: "Technology",
    growth: "Growth", timeline: "Growth", openProblem: "Assessment"
  };
  const STAGES = ["Problem", "Friction", "Technology", "Growth", "Assessment"];
  const STAGE_SHORT = { Problem: "1", Friction: "2", Technology: "3", Growth: "4", Assessment: "5" };

  const PROBLEM_OPTIONS = [
    ["Reduce manual work", { customApps: 2, ai: 1 }],
    ["Replace spreadsheets or workarounds", { customApps: 2, data: 1 }],
    ["Connect systems that don't communicate", { integration: 3 }],
    ["Modernize outdated software", { modernization: 3 }],
    ["Build a new application or platform", { customApps: 3 }],
    ["Support business growth", { scalable: 3 }],
    ["Make better use of our data", { data: 3 }],
    ["Introduce AI or automation", { ai: 3 }],
    ["Improve a customer experience", { customApps: 2 }],
    ["Improve an employee experience", { customApps: 2 }],
    ["Not sure yet", {}]
  ];

  const FRICTION_OPTIONS = [
    ["Too much manual data entry", { customApps: 2, ai: 1 }],
    ["Information lives in different systems", { integration: 3 }],
    ["Employees repeat the same work", { ai: 2, customApps: 1 }],
    ["Existing software doesn't fit our processes", { customApps: 3 }],
    ["Current software is difficult to use", { customApps: 2 }],
    ["Reporting requires too much manual work", { data: 3 }],
    ["Systems can't support new requirements", { scalable: 2, modernization: 1 }],
    ["Legacy technology is difficult to maintain", { modernization: 3 }],
    ["We have an idea existing software can't support", { customApps: 3 }],
    ["We're growing beyond our current technology", { scalable: 3 }],
    ["Other", {}]
  ];
  const FRICTION_LIMIT = 3;

  const IMPACT_OPTIONS = ["Minor Inconvenience", "Slowing Us Down", "Significant Business Problem", "Limiting Growth"];

  const ENV_OPTIONS = [
    ["Existing business applications", { customApps: 1 }],
    ["CRM", { integration: 2 }],
    ["ERP", { integration: 2 }],
    ["Databases", { data: 1, integration: 1 }],
    ["Cloud platforms", { scalable: 1 }],
    ["Legacy systems", { modernization: 3 }],
    ["Customer-facing systems", { customApps: 1 }],
    ["Mobile applications", { customApps: 1 }],
    ["APIs or third-party platforms", { integration: 2 }],
    ["We're not sure", {}]
  ];

  const CONNECTIVITY_OPTIONS = [
    ["Well Connected", { integration: 0 }],
    ["Somewhat Connected", { integration: 1 }],
    ["Mostly Disconnected", { integration: 3 }],
    ["Not Sure", {}]
  ];

  const GROWTH_OPTIONS = [
    ["More customers", { scalable: 2 }],
    ["More employees", { scalable: 1 }],
    ["More locations", { scalable: 2 }],
    ["More transactions", { scalable: 2 }],
    ["More data", { data: 2 }],
    ["New products or services", { customApps: 2 }],
    ["New integrations", { integration: 2 }],
    ["Automation", { ai: 3 }],
    ["AI or Machine Learning", { ai: 3 }],
    ["We're not sure yet", {}]
  ];

  const TIMELINE_OPTIONS = ["Now", "Within 3 Months", "3–6 Months", "6–12 Months", "Just Exploring"];

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  const STEP_ORDER = ["start", "problem", "friction", "impact", "environment", "connectivity", "growth", "timeline", "openProblem", "results"];
  let stepIndex = 0;
  let started = false;
  let completed = false;

  const state = {
    problem: [],
    friction: [],
    frictionOther: "",
    impact: null,
    environment: [],
    connectivity: null,
    growth: [],
    timeline: null,
    openProblem: ""
  };

  // -----------------------------------------------------------------
  // Rules engine
  // -----------------------------------------------------------------
  function addWeights(target, weights) {
    Object.keys(weights || {}).forEach((k) => { target[k] = (target[k] || 0) + weights[k]; });
  }

  function computeWeights() {
    const w = { customApps: 0, integration: 0, modernization: 0, scalable: 0, data: 0, ai: 0 };
    PROBLEM_OPTIONS.forEach(([label, weights]) => { if (state.problem.includes(label)) addWeights(w, weights); });
    FRICTION_OPTIONS.forEach(([label, weights]) => { if (state.friction.includes(label)) addWeights(w, weights); });
    ENV_OPTIONS.forEach(([label, weights]) => { if (state.environment.includes(label)) addWeights(w, weights); });
    GROWTH_OPTIONS.forEach(([label, weights]) => { if (state.growth.includes(label)) addWeights(w, weights); });
    const conn = CONNECTIVITY_OPTIONS.find(([label]) => label === state.connectivity);
    if (conn) addWeights(w, conn[1]);
    return w;
  }

  function computeFlags(w) {
    const legacyFlag = state.environment.includes("Legacy systems") ||
      state.friction.includes("Legacy technology is difficult to maintain") ||
      state.problem.includes("Modernize outdated software");
    const disconnected = state.connectivity === "Mostly Disconnected";
    const dataFragmented = state.friction.includes("Information lives in different systems") ||
      state.friction.includes("Reporting requires too much manual work");
    return {
      legacyFlag,
      disconnected,
      dataFragmented,
      needsFoundation: legacyFlag || disconnected || dataFragmented
    };
  }

  // Foundation priority order used both for the AI override and for
  // deterministic tie-breaking of equal weights elsewhere.
  const FOUNDATION_ORDER = ["integration", "data", "modernization", "scalable"];
  const CATEGORY_ORDER = ["customApps", "integration", "modernization", "scalable", "data", "ai"];

  function rankCategories(w) {
    return CATEGORY_ORDER
      .map((key) => ({ key, weight: w[key] || 0 }))
      .sort((a, b) => b.weight - a.weight || CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key));
  }

  function buildResult() {
    const w = computeWeights();
    const flags = computeFlags(w);
    const ranked = rankCategories(w);
    const topKey = ranked[0].weight > 0 ? ranked[0].key : null;

    let recommendations;
    let aiFoundationOverride = false;

    if (topKey === "ai" && flags.needsFoundation) {
      aiFoundationOverride = true;
      const foundationRanked = FOUNDATION_ORDER
        .map((key) => ({ key, weight: w[key] || 0 }))
        .sort((a, b) => b.weight - a.weight || FOUNDATION_ORDER.indexOf(a.key) - FOUNDATION_ORDER.indexOf(b.key));
      const primaryFoundation = foundationRanked[0].weight > 0 ? foundationRanked[0].key : "integration";
      const rest = ranked.filter((r) => r.key !== "ai" && r.key !== primaryFoundation && r.weight > 0).slice(0, 1);
      recommendations = [
        { key: primaryFoundation, flag: null },
        { key: "ai", flag: "AI & Automation Opportunity — Foundation May Be Needed" }
      ].concat(rest.map((r) => ({ key: r.key, flag: null }))).slice(0, 3);
    } else {
      recommendations = ranked.filter((r) => r.weight > 0).slice(0, 3).map((r) => ({ key: r.key, flag: null }));
    }

    if (recommendations.length === 0) {
      recommendations = [{ key: "customApps", flag: null }];
    }

    // Opportunity profile: five plain-language dimensions, each a
    // transparent function of the same weights above. Thresholds are
    // fixed and documented here — no hidden scoring.
    function levelFor(value) {
      if (value <= 0) return "Strong";
      if (value <= 2) return "Moderate Opportunity";
      if (value <= 5) return "High Opportunity";
      return "Foundation Needed";
    }
    const connectivityBoost = flags.disconnected ? 3 : state.connectivity === "Somewhat Connected" ? 1 : 0;
    const profile = [
      { label: "Process Efficiency", value: w.customApps, level: levelFor(w.customApps) },
      { label: "System Connectivity", value: w.integration + connectivityBoost, level: levelFor(w.integration + connectivityBoost) },
      { label: "Scalability", value: w.scalable, level: levelFor(w.scalable) },
      { label: "Data Readiness", value: w.data, level: levelFor(w.data) },
      {
        label: "AI & Automation Readiness",
        value: w.ai,
        level: aiFoundationOverride ? "Foundation Needed" : levelFor(w.ai)
      }
    ];

    return { weights: w, flags, ranked, recommendations, profile, aiFoundationOverride };
  }

  function buildSummary(result) {
    const impactPhrase = state.impact ? state.impact.toLowerCase() : "an open question";
    const sentences = [];

    if (result.aiFoundationOverride) {
      const primary = CATEGORIES[result.recommendations[0].key].label;
      sentences.push(`Your answers point to real interest in AI or automation, but they also suggest ${result.flags.disconnected ? "disconnected systems" : result.flags.legacyFlag ? "aging technology" : "fragmented information"} may limit how much value that investment could create today.`);
      sentences.push(`Strengthening ${primary} first tends to make automation and AI initiatives more reliable once they're introduced.`);
    } else if (result.recommendations.length) {
      const primaryKey = result.recommendations[0].key;
      const primary = CATEGORIES[primaryKey].label;
      if (primaryKey === "customApps") {
        sentences.push("Your answers suggest the biggest opportunity is software that fits how your team actually works, rather than more workarounds layered on top of what's there.");
      } else if (primaryKey === "integration") {
        sentences.push("Your answers suggest information is getting stuck between systems that don't talk to each other, creating manual work that a connected environment could remove.");
      } else if (primaryKey === "modernization") {
        sentences.push("Your answers suggest aging technology may be limiting what your team can do, and that modernizing what you already have could unlock more than a full rebuild would.");
      } else if (primaryKey === "scalable") {
        sentences.push("Your answers suggest growth is starting to outpace your current technology, and building more room to scale could remove a real ceiling.");
      } else if (primaryKey === "data") {
        sentences.push("Your answers suggest useful information exists but is hard to access or report on, and a more connected data foundation could change that.");
      } else {
        sentences.push("Your answers suggest repetitive work is a real drag on the team, and automation could return meaningful time once it's pointed at the right process.");
      }
      sentences.push(`This lines up with what you told us: it's currently ${impactPhrase}.`);
    } else {
      sentences.push("Your answers don't point strongly toward one specific area yet, which often means it's still early. A short conversation can help narrow down where the real opportunity is.");
    }
    return sentences.join(" ");
  }

  // -----------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------
  const pathwaysEl = document.querySelector(".assess-pathways");
  const progressEl = document.querySelector(".assess-progress");
  const contentEl = root.querySelector("#assess-step-content");

  function renderProgress() {
    const stage = STEP_STAGE[STEP_ORDER[stepIndex]];
    progressEl.hidden = !started || completed;
    progressEl.innerHTML = STAGES.map((s) => {
      const idx = STAGES.indexOf(s);
      const curIdx = STAGES.indexOf(stage);
      const cls = s === stage ? "is-active" : idx < curIdx ? "is-done" : "";
      return `<li class="${cls}" data-short="${STAGE_SHORT[s]}">${s}</li>`;
    }).join("");
  }

  function updatePathways() {
    if (!pathwaysEl) return;
    const w = computeWeights();
    const active = {
      customApps: w.customApps > 0, integration: w.integration > 0, modernization: w.modernization > 0,
      scalable: w.scalable > 0, data: w.data > 0, ai: w.ai > 0
    };
    pathwaysEl.querySelectorAll(".assess-pathway").forEach((el) => {
      const key = el.getAttribute("data-key");
      el.classList.toggle("is-active", !!active[key]);
    });
  }

  function optionsListHTML(name, options, selected, opts) {
    opts = opts || {};
    return `<ul class="assess-options${opts.grid ? " assess-options--grid" : ""}">` +
      options.map(([label]) => {
        const checked = selected.includes(label) ? "checked" : "";
        return `<li class="assess-option"><label><input type="checkbox" name="${name}" value="${escapeAttr(label)}" ${checked}><span>${escapeHtml(label)}</span></label></li>`;
      }).join("") + "</ul>";
  }

  function bigChoiceHTML(name, options, selected) {
    return `<div class="assess-impact-grid" role="group">` +
      options.map((label) => `<button type="button" class="assess-impact-btn" data-name="${name}" data-value="${escapeAttr(label)}" aria-pressed="${selected === label}">${escapeHtml(label)}</button>`).join("") +
      `</div>`;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  function goTo(index, opts) {
    opts = opts || {};
    const completedStep = STEP_ORDER[stepIndex];
    stepIndex = index;
    render();
    if (!opts.silent) {
      trackEvent("assessment_step_completed", { step: completedStep });
    }
    if (!reduceMotion) window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  function render() {
    const step = STEP_ORDER[stepIndex];
    renderProgress();
    updatePathways();

    if (step === "start") return renderStart();
    if (step === "problem") return renderMultiStep({
      step, question: "What are you trying to improve?", subtext: "Select everything that applies.",
      options: PROBLEM_OPTIONS, field: "problem"
    });
    if (step === "friction") return renderFrictionStep();
    if (step === "impact") return renderImpactStep();
    if (step === "environment") return renderMultiStep({
      step, question: "What does your technology need to work with?", subtext: "Select anything that's part of your current environment.",
      options: ENV_OPTIONS, field: "environment"
    });
    if (step === "connectivity") return renderConnectivityStep();
    if (step === "growth") return renderMultiStep({
      step, question: "What does your technology need to support next?", subtext: "Select everything that could become important as your business grows.",
      options: GROWTH_OPTIONS, field: "growth"
    });
    if (step === "timeline") return renderTimelineStep();
    if (step === "openProblem") return renderOpenProblemStep();
    if (step === "results") return renderResults();
  }

  function renderStart() {
    // The intro/H1/CTA/microcopy for this step already live as static,
    // always-crawlable markup in the page hero above the app mount
    // point; its "Start My Assessment" button calls window.__assessStart
    // directly, so there's nothing additional to render here.
    contentEl.innerHTML = "";
  }

  function renderNav(opts) {
    opts = opts || {};
    return `
      <div class="assess-nav">
        <button type="button" class="assess-btn-back" ${stepIndex <= 1 ? "disabled" : ""} data-action="back">&larr; Back</button>
        <button type="${opts.submit ? "submit" : "button"}" class="assess-btn-continue" data-action="continue">${opts.label || "Continue →"}</button>
      </div>
    `;
  }

  function attachNav(container, onContinue) {
    container.querySelector('[data-action="back"]').addEventListener("click", () => {
      if (stepIndex > 1) goTo(stepIndex - 1, { silent: true });
    });
    const continueBtn = container.querySelector('[data-action="continue"]');
    if (continueBtn.type !== "submit") {
      continueBtn.addEventListener("click", onContinue);
    }
  }

  function renderMultiStep(cfg) {
    contentEl.innerHTML = `
      <form class="assess-card" data-step="${cfg.step}">
        <h2 class="assess-question">${cfg.question}</h2>
        <p class="assess-subtext">${cfg.subtext}</p>
        ${optionsListHTML(cfg.field, cfg.options, state[cfg.field])}
        <p class="assess-error" hidden>Please select at least one option (or "Not sure").</p>
        ${renderNav()}
      </form>
    `;
    const form = contentEl.querySelector("form");
    form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const list = state[cfg.field];
        const i = list.indexOf(cb.value);
        if (cb.checked && i === -1) list.push(cb.value);
        if (!cb.checked && i !== -1) list.splice(i, 1);
        updatePathways();
      });
    });
    attachNav(form, () => {
      if (state[cfg.field].length === 0) {
        form.querySelector(".assess-error").hidden = false;
        return;
      }
      goTo(stepIndex + 1);
    });
  }

  function renderFrictionStep() {
    contentEl.innerHTML = `
      <form class="assess-card" data-step="friction">
        <h2 class="assess-question">Where is technology creating the most friction today?</h2>
        <p class="assess-subtext">Choose up to ${FRICTION_LIMIT} problems having the greatest impact.</p>
        ${optionsListHTML("friction", FRICTION_OPTIONS, state.friction)}
        <div class="assess-other-field" ${state.friction.includes("Other") ? "" : "hidden"}>
          <input type="text" name="frictionOther" maxlength="200" placeholder="Briefly describe it (optional)" value="${escapeAttr(state.frictionOther)}">
        </div>
        <p class="assess-error" hidden>Choose at least one option, up to ${FRICTION_LIMIT}.</p>
        ${renderNav()}
      </form>
    `;
    const form = contentEl.querySelector("form");
    const otherField = form.querySelector(".assess-other-field");
    const otherInput = form.querySelector('input[name="frictionOther"]');
    otherInput.addEventListener("input", () => { state.frictionOther = otherInput.value; });

    form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked && state.friction.length >= FRICTION_LIMIT && !state.friction.includes(cb.value)) {
          cb.checked = false;
          return;
        }
        const i = state.friction.indexOf(cb.value);
        if (cb.checked && i === -1) state.friction.push(cb.value);
        if (!cb.checked && i !== -1) state.friction.splice(i, 1);
        otherField.hidden = !state.friction.includes("Other");
        updatePathways();
      });
    });
    attachNav(form, () => {
      if (state.friction.length === 0) {
        form.querySelector(".assess-error").hidden = false;
        return;
      }
      goTo(stepIndex + 1);
    });
  }

  function renderImpactStep() {
    contentEl.innerHTML = `
      <div class="assess-card" data-step="impact">
        <h2 class="assess-question">How much is this affecting the business?</h2>
        <p class="assess-subtext">Choose the option that fits best.</p>
        ${bigChoiceHTML("impact", IMPACT_OPTIONS, state.impact)}
        <p class="assess-error" hidden>Please choose one option.</p>
        ${renderNav()}
      </div>
    `;
    const container = contentEl.querySelector('[data-step="impact"]');
    container.querySelectorAll(".assess-impact-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.impact = btn.getAttribute("data-value");
        container.querySelectorAll(".assess-impact-btn").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      });
    });
    attachNav(container, () => {
      if (!state.impact) { container.querySelector(".assess-error").hidden = false; return; }
      goTo(stepIndex + 1);
    });
  }

  function renderConnectivityStep() {
    contentEl.innerHTML = `
      <div class="assess-card" data-step="connectivity">
        <h2 class="assess-question">How connected is your technology today?</h2>
        <p class="assess-subtext">Choose the option that fits best.</p>
        ${bigChoiceHTML("connectivity", CONNECTIVITY_OPTIONS.map((o) => o[0]), state.connectivity)}
        <p class="assess-error" hidden>Please choose one option.</p>
        ${renderNav()}
      </div>
    `;
    const container = contentEl.querySelector('[data-step="connectivity"]');
    container.querySelectorAll(".assess-impact-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.connectivity = btn.getAttribute("data-value");
        container.querySelectorAll(".assess-impact-btn").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        updatePathways();
      });
    });
    attachNav(container, () => {
      if (!state.connectivity) { container.querySelector(".assess-error").hidden = false; return; }
      goTo(stepIndex + 1);
    });
  }

  function renderTimelineStep() {
    contentEl.innerHTML = `
      <div class="assess-card" data-step="timeline">
        <h2 class="assess-question">When would you like to make progress?</h2>
        <p class="assess-subtext">This just gives us context &mdash; it isn't a commitment.</p>
        ${bigChoiceHTML("timeline", TIMELINE_OPTIONS, state.timeline)}
        <p class="assess-error" hidden>Please choose one option.</p>
        ${renderNav()}
      </div>
    `;
    const container = contentEl.querySelector('[data-step="timeline"]');
    container.querySelectorAll(".assess-impact-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.timeline = btn.getAttribute("data-value");
        container.querySelectorAll(".assess-impact-btn").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      });
    });
    attachNav(container, () => {
      if (!state.timeline) { container.querySelector(".assess-error").hidden = false; return; }
      goTo(stepIndex + 1);
    });
  }

  function renderOpenProblemStep() {
    contentEl.innerHTML = `
      <form class="assess-card" data-step="openProblem">
        <h2 class="assess-question">If you could fix one technology problem tomorrow, what would it be?</h2>
        <p class="assess-subtext">Optional. Tell us in your own words.</p>
        <textarea class="assess-textarea" name="openProblem" maxlength="600" placeholder="Type your answer here...">${escapeHtml(state.openProblem)}</textarea>
        ${renderNav({ label: "See My Assessment →" })}
      </form>
    `;
    const form = contentEl.querySelector("form");
    form.querySelector("textarea").addEventListener("input", (e) => { state.openProblem = e.target.value; });
    attachNav(form, () => {
      completed = true;
      trackEvent("assessment_completed", {});
      goTo(stepIndex + 1);
    });
  }

  function renderResults() {
    const result = buildResult();
    window.__assessResult = result;
    const summary = buildSummary(result);

    const profileHTML = result.profile.map((p) => {
      const filled = { "Strong": 1, "Moderate Opportunity": 2, "High Opportunity": 3, "Foundation Needed": 4 }[p.level];
      const segs = [1, 2, 3, 4].map((n) => `<span class="assess-profile-seg${n <= filled ? " is-filled" : ""}"></span>`).join("");
      return `
        <div class="assess-profile-row">
          <span class="assess-profile-label">${p.label}</span>
          <span class="assess-profile-bar">${segs}</span>
          <span class="assess-profile-level">${p.level}</span>
        </div>
      `;
    }).join("");

    const recHTML = result.recommendations.map((rec, i) => {
      const cat = CATEGORIES[rec.key];
      return `
        <div class="assess-rec">
          <span class="assess-rec-num">${i + 1}</span>
          <div class="assess-rec-body">
            <h4>${cat.label}</h4>
            ${rec.flag ? `<span class="assess-rec-flag">${rec.flag}</span><br>` : ""}
            <p>${cat.blurb}</p>
            <a class="hub-link" data-rec-key="${rec.key}" href="${cat.href}">Explore ${cat.label} &rarr;</a>
          </div>
        </div>
      `;
    }).join("");

    contentEl.innerHTML = `
      <div class="assess-card">
        <h2 class="assess-results-heading">Your Technology Opportunity Assessment</h2>
        <p class="assess-results-intro">Based on your answers, these are the areas where technology may have the greatest opportunity to remove friction, support growth, or create new capabilities. This is a starting point, not a definitive technical diagnosis.</p>

        <div class="assess-profile">${profileHTML}</div>

        <div class="assess-summary-block">
          <h3>What We're Seeing</h3>
          <p>${summary}</p>
        </div>

        <div class="assess-recommendations">
          <h3>Where We'd Start</h3>
          ${recHTML}
        </div>

        <button type="button" class="assess-restart" data-action="restart">Start over &rarr;</button>
      </div>

      <div class="assess-expert-section" id="assess-expert">
        <h2>Want Us to Take a Deeper Look?</h2>
        <p class="assess-expert-quote">&ldquo;An automated assessment can identify the opportunity. An expert can help determine what it will take to solve it.&rdquo;</p>
        <p class="assess-expert-copy">Have a SilverXis technology expert review your assessment and help identify the best next step.</p>
        <form class="assess-expert-form" id="assess-expert-form">
          <div class="assess-field-row">
            <label class="assess-field">Name*<input type="text" name="name" autocomplete="name" required></label>
            <label class="assess-field">Company*<input type="text" name="company" autocomplete="organization" required></label>
          </div>
          <div class="assess-field-row">
            <label class="assess-field">Business Email*<input type="email" name="email" autocomplete="email" required></label>
            <label class="assess-field">Phone (Optional)<input type="tel" name="phone" autocomplete="tel"></label>
          </div>
          <div class="cta-group">
            <button type="submit" class="cta">Have an Expert Review My Assessment &rarr;</button>
          </div>
        </form>
      </div>
    `;

    trackEvent("recommendation_viewed", {
      primary_opportunity: result.recommendations[0] && CATEGORIES[result.recommendations[0].key].label,
      secondary_opportunity: result.recommendations[1] && CATEGORIES[result.recommendations[1].key].label,
      timeline: state.timeline,
      business_impact: state.impact
    });

    contentEl.querySelector('[data-action="restart"]').addEventListener("click", resetAssessment);

    contentEl.querySelectorAll("[data-rec-key]").forEach((a) => {
      a.addEventListener("click", () => {
        trackEvent("service_link_clicked", { category: CATEGORIES[a.getAttribute("data-rec-key")].label });
      });
    });

    let expertStarted = false;
    const expertForm = contentEl.querySelector("#assess-expert-form");
    expertForm.addEventListener("focusin", () => {
      if (!expertStarted) { expertStarted = true; trackEvent("expert_review_started", {}); }
    });
    expertForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(expertForm);
      const contact = { name: fd.get("name"), company: fd.get("company"), email: fd.get("email"), phone: fd.get("phone") || "" };
      const lead = buildLeadRecord(contact, result);
      submitLead(lead);
      trackEvent("expert_review_submitted", {
        primary_opportunity: result.recommendations[0] && CATEGORIES[result.recommendations[0].key].label,
        timeline: state.timeline
      });
      contentEl.querySelector(".assess-expert-form").outerHTML =
        `<p class="assess-expert-submitted">Thank you — a SilverXis technology expert will review your assessment and follow up shortly.</p>`;
    });
  }

  // -----------------------------------------------------------------
  // Lead record + sales-ready summary. No CRM is hard-coded here; this
  // builds a clean, structured object and hands it to submitLead(),
  // which is the one integration point to wire up once a real
  // endpoint (form handler, webhook, CRM API) exists for this site.
  // -----------------------------------------------------------------
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
      if (params.get(k)) utm[k] = params.get(k);
    });
    return utm;
  }

  function buildLeadRecord(contact, result) {
    const primary = result.recommendations[0] ? CATEGORIES[result.recommendations[0].key].label : null;
    const secondary = result.recommendations[1] ? CATEGORIES[result.recommendations[1].key].label : null;
    const salesSummaryLines = [
      `Primary Opportunity: ${primary || "Not enough answers yet"}`,
      secondary ? `Secondary Opportunity: ${secondary}` : null,
      `Business Impact: ${state.impact || "Not specified"}`,
      `Timeline: ${state.timeline || "Not specified"}`,
      state.openProblem ? `Primary Problem: "${state.openProblem}"` : null
    ].filter(Boolean);

    return {
      contact,
      assessment: {
        businessProblems: state.problem.slice(),
        frictionPoints: state.friction.slice(),
        frictionOther: state.frictionOther,
        businessImpact: state.impact,
        currentTechEnvironment: state.environment.slice(),
        connectivityLevel: state.connectivity,
        futureRequirements: state.growth.slice(),
        timeline: state.timeline,
        openEndedProblem: state.openProblem
      },
      opportunityProfile: result.profile,
      topRecommendations: result.recommendations.map((r) => CATEGORIES[r.key].label),
      salesSummary: salesSummaryLines.join("\n"),
      meta: {
        submittedAt: new Date().toISOString(),
        referringPage: document.referrer || null,
        pageUrl: window.location.href,
        utm: getUTMParams()
      }
    };
  }

  function submitLead(lead) {
    // Placeholder only: no backend/CRM/marketing-automation endpoint is
    // wired up for this project yet (matching the pattern in
    // audit-form.js). Once one exists, replace this function's body
    // with the actual POST/webhook call — `lead` is already a complete,
    // structured record (contact + full assessment + sales summary)
    // ready to send as-is.
    console.info("[SilverXis assessment] lead record ready to send:", lead);
  }

  // -----------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------
  function resetAssessment() {
    state.problem = []; state.friction = []; state.frictionOther = ""; state.impact = null;
    state.environment = []; state.connectivity = null; state.growth = []; state.timeline = null;
    state.openProblem = "";
    completed = false;
    goTo(0, { silent: true });
  }

  function startAssessment() {
    if (started) return;
    started = true;
    trackEvent("assessment_started", {});
    goTo(1);
  }
  window.__assessStart = startAssessment;

  let abandonFired = false;
  window.addEventListener("pagehide", () => {
    if (started && !completed && !abandonFired) {
      abandonFired = true;
      trackEvent("assessment_abandoned", { step: STEP_ORDER[stepIndex] });
    }
  });

  goTo(0, { silent: true });
})();
