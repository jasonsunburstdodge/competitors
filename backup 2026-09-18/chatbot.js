(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Knowledge base: simple keyword matching over the site's own service
  // content. This is not a live AI model, it's a small local FAQ matcher -
  // anything it can't confidently match falls through to the human handoff
  // flow below.
  // ---------------------------------------------------------------------
  const TOPICS = [
    {
      keywords: ["seo", "search engine optimization", "google ranking", "rank on google", "organic traffic"],
      answer: "SEO is the foundation: technical health, on-page optimization, content built around real customer questions, entity signals, and authority. It's also what AEO and GEO build on, so getting it right helps you rank on Google and get cited by AI platforms."
    },
    {
      keywords: ["aeo", "answer engine", "featured snippet", "ai overview"],
      answer: "AEO (Answer Engine Optimization) is about winning the direct answer, a featured snippet, an AI Overview, or a voice response, instead of just a ranked link someone has to click through to. It's optimizing for the answer itself."
    },
    {
      keywords: ["geo", "generative engine", "chatgpt", "perplexity", "ai search", "ai visibility", "cited by ai"],
      answer: "GEO (Generative Engine Optimization) builds the entity clarity, topical authority, and citation signals that make ChatGPT, Gemini, or Perplexity name and recommend your business when someone asks a question you can answer."
    },
    {
      keywords: ["local search", "google business profile", "gbp", "reviews", "citations", "near me", "maps", "local seo"],
      answer: "Local search covers your Google Business Profile, reviews, citations, and the local relevance signals that get you found on Maps, in the local pack, and in AI local recommendations, wherever your customers actually are."
    },
    {
      keywords: ["visibility audit", "free audit", "audit my"],
      answer: "A Visibility Audit evaluates Google, local search, AI search, technical SEO, content, brand consistency, messaging, and conversion, so you can see exactly where your business is invisible. Want me to start one for you?"
    },
    {
      keywords: ["website", "web design", "web development", "site design", "new site", "redesign my site"],
      answer: "Every site we build starts with fast, mobile-first performance, clean semantic markup, and technical SEO built in from day one, then layers in brand identity, messaging, and conversion-focused UX on top."
    },
    {
      keywords: ["brand", "branding", "logo", "visual identity", "brand identity"],
      answer: "Brand Identity work builds a consistent visual presence across your website, social, campaigns, and everywhere else customers encounter you, so every impression builds recognition instead of starting over."
    },
    {
      keywords: ["ux", "ui", "user experience", "usability", "navigation"],
      answer: "UX/UI Design is about clear visual hierarchy, intuitive navigation, and purposeful interactions, so once you've got someone's attention, the experience keeps them moving instead of creating friction."
    },
    {
      keywords: ["design review"],
      answer: "A Design Review looks at whether your current site, brand, and digital presence actually reflect the value you deliver. Want me to start one for you?"
    },
    {
      keywords: ["messaging", "positioning", "differentiation", "value proposition", "brand voice", "what makes us different"],
      answer: "Messaging and Positioning defines what makes you different, why that difference matters, and what customers gain by choosing you, then turns that into clear messaging across your site, campaigns, and every place customers encounter your brand."
    },
    {
      keywords: ["content strategy", "content marketing", "blog", "what to write"],
      answer: "Content Strategy determines what to say, where to say it, and why, so every page and piece of content earns visibility, answers a real question, or moves someone closer to a decision."
    },
    {
      keywords: ["conversion", "cta", "call to action", "conversion rate", "funnel"],
      answer: "Conversion Strategy connects your messaging to the calls to action, offers, forms, and follow-up that turn attention into an actual inquiry, not just traffic."
    },
    {
      keywords: ["price", "pricing", "cost", "how much", "budget", "fee", "rates"],
      answer: "Pricing depends on scope, since every engagement is built around your specific gaps. The fastest way to get real numbers is a quick Visibility or Design Audit, or just talk to us directly. Want me to help set that up?"
    },
    {
      keywords: ["how long", "timeline", "when will i see results", "how fast"],
      answer: "Technical fixes and Google Business Profile improvements can show measurable movement within weeks. Competitive rankings, AI Overview appearances, and brand/design work typically build over two to six months, since they depend on authority and consistency that accumulate over time."
    },
    {
      keywords: ["dallas", "fort worth", "dfw", "service area", "where are you based", "where are you located", "location"],
      answer: "SilverXis is based in Dallas, Texas at 100 East Royal Lane, Suite #224, Irving, and serves businesses across the Dallas-Fort Worth metro."
    },
    {
      keywords: ["who are you", "what is silverxis", "about silverxis", "what does silverxis do"],
      answer: "SilverXis is a Dallas digital marketing studio combining search visibility (SEO/AEO/GEO), web and brand design, and messaging and conversion strategy, built around one idea: help the right people find your business, understand its value, and choose it."
    },
    {
      keywords: ["contact", "phone number", "email address", "reach you", "call you", "talk to someone", "get in touch"],
      answer: "You can reach SilverXis at (817) 393-9001, info@silverxis.com, or 100 East Royal Lane, Suite #224, Irving, Texas 75039. Want me to open the contact form for you?"
    },
    {
      keywords: ["why should i choose", "why choose silverxis", "competitors", "other agencies"],
      answer: "Most agencies treat search, design, and messaging as separate line items. SilverXis connects all three around one outcome: the right customers finding you, understanding your value, and choosing you, not just more traffic."
    },
    {
      keywords: ["what do you do", "what services", "services do you offer", "what can you help with"],
      answer: "Three things, connected: Visibility (SEO, AEO, GEO, local search), Design (websites, brand identity, UX/UI), and Strategy (messaging, positioning, content, and conversion). Ask me about any of them."
    },
    {
      keywords: ["hi", "hello", "hey"],
      answer: "Hi! I'm the SilverXis assistant. Ask me about search visibility, design, messaging strategy, or anything else about what we do."
    },
    {
      keywords: ["thanks", "thank you", "appreciate it"],
      answer: "Happy to help! Anything else you'd like to know?"
    }
  ];

  const GREETING = "Hi, I'm the SilverXis assistant. Ask me about SEO/AI visibility, design, messaging strategy, or anything else about what we do.";
  const FALLBACK = "I don't have a confident answer for that. Would you like someone from SilverXis to get back to you with a better one?";

  function matchTopic(message) {
    const text = message.toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const topic of TOPICS) {
      let score = 0;
      for (const kw of topic.keywords) {
        if (kw.includes(" ")) {
          if (text.includes(kw)) score++;
        } else if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = topic;
      }
    }
    return bestScore > 0 ? best : null;
  }

  // ---------------------------------------------------------------------
  // Widget
  // ---------------------------------------------------------------------
  let btn, icon, panel, messagesEl, form, input;
  let open = false;
  let awaitingHandoff = false;
  let pendingQuestion = "";

  function getBadgeSrc() {
    const logoImg = document.querySelector("header .logo img");
    const raw = logoImg ? logoImg.getAttribute("src") || "" : "";
    if (raw) return raw.replace(/silverxis-logo\.png$/, "silverxis-badge.png");
    return "assets/silverxis-badge.png";
  }

  function addMessage(role, html) {
    const div = document.createElement("div");
    div.className = role === "user" ? "ask-msg ask-msg-user" : "ask-msg ask-msg-bot";
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addBotText(text) {
    addMessage("bot", `<p>${text}</p>`);
  }

  function addHandoffPrompt(question) {
    const div = addMessage("bot", `<p>${FALLBACK}</p>`);
    const actions = document.createElement("div");
    actions.className = "ask-msg-actions";
    actions.innerHTML = `<button type="button" data-handoff="yes">Yes</button><button type="button" data-handoff="no">No</button>`;
    div.appendChild(actions);
    awaitingHandoff = true;
    pendingQuestion = question;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function handleUserMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMessage("user", escapeHtml(trimmed));

    if (awaitingHandoff) {
      awaitingHandoff = false;
      addBotText("Got it, let me know what else I can help with.");
    }

    const topic = matchTopic(trimmed);
    if (topic) {
      addBotText(topic.answer);
    } else {
      addHandoffPrompt(trimmed);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildWidget() {
    const badgeSrc = getBadgeSrc();

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ask-silverxis-btn";
    btn.setAttribute("aria-label", "Ask SilverXis");
    btn.innerHTML = `
      <img class="ask-silverxis-icon" src="${badgeSrc}" alt="">
      <span class="ask-silverxis-label">Ask SilverXis</span>
    `;
    icon = btn.querySelector(".ask-silverxis-icon");
    document.body.appendChild(btn);

    panel = document.createElement("div");
    panel.className = "ask-silverxis-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Ask SilverXis chat");
    panel.innerHTML = `
      <div class="ask-silverxis-header">
        <img src="${badgeSrc}" alt="">
        <h2>Ask SilverXis</h2>
        <button type="button" class="ask-silverxis-close" aria-label="Close chat">&times;</button>
      </div>
      <div class="ask-silverxis-messages"></div>
      <form class="ask-silverxis-form">
        <input type="text" placeholder="Ask about SEO, design, messaging..." autocomplete="off">
        <button type="submit">Send &rarr;</button>
      </form>
    `;
    document.body.appendChild(panel);

    messagesEl = panel.querySelector(".ask-silverxis-messages");
    form = panel.querySelector(".ask-silverxis-form");
    input = form.querySelector("input");

    panel.querySelector(".ask-silverxis-close").addEventListener("click", closePanel);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value;
      input.value = "";
      handleUserMessage(text);
    });

    messagesEl.addEventListener("click", (e) => {
      const handoffBtn = e.target.closest("[data-handoff]");
      if (!handoffBtn) return;
      const choice = handoffBtn.getAttribute("data-handoff");
      handoffBtn.closest(".ask-msg-actions").remove();
      awaitingHandoff = false;
      if (choice === "yes") {
        addBotText("Sure, opening the contact form with your question included.");
        closePanel();
        if (window.SilverXisContact) {
          window.SilverXisContact.openWithMessage(pendingQuestion);
        }
      } else {
        addBotText("No problem. Closing this up, feel free to come back anytime.");
        setTimeout(closePanel, 900);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) closePanel();
    });

    document.addEventListener("click", (e) => {
      if (!open) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel();
    });

    btn.addEventListener("click", () => {
      if (open) closePanel();
      else openPanel();
    });
  }

  function openPanel() {
    if (!btn) buildWidget();
    open = true;
    panel.hidden = false;
    if (!messagesEl.children.length) addBotText(GREETING);
    input.focus();
  }

  function closePanel() {
    open = false;
    if (panel) panel.hidden = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
