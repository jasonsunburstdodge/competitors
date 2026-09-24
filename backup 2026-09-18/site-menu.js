(() => {
  "use strict";

  // Every internal link is a full page navigation between static pages.
  // Without this, some browsers (mobile Safari especially) restore the
  // scroll position a page was left at last time it was open, instead of
  // starting at the top, whether that page is reached by clicking a link,
  // by going back/forward, or by the browser serving it from its
  // back/forward cache (which skips a normal load entirely, so a plain
  // load-time scrollTo alone can still miss it). Force every one of those
  // to the top unless the URL points at an in-page anchor
  // (e.g. index.html#contact), which should still scroll to that section.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  function resetScroll() {
    if (!window.location.hash) window.scrollTo(0, 0);
  }

  resetScroll();
  document.addEventListener("DOMContentLoaded", resetScroll);
  window.addEventListener("load", resetScroll);
  window.addEventListener("pageshow", resetScroll);
})();

(() => {
  "use strict";

  const toggle = document.querySelector(".site-menu-toggle");
  const panel = document.getElementById("site-menu-panel");
  if (!toggle || !panel) return;

  function open() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("click", onOutsideClick, true);
  }

  function close() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("click", onOutsideClick, true);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      close();
      toggle.focus();
    }
  }

  function onOutsideClick(e) {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) close();
  }

  function pulse() {
    toggle.classList.remove("pulse");
    // Restart the animation even if it's already mid-run from a rapid tap.
    void toggle.offsetWidth;
    toggle.classList.add("pulse");
  }
  toggle.addEventListener("animationend", () => toggle.classList.remove("pulse"));

  toggle.addEventListener("pointerdown", pulse);

  toggle.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
    if (typeof window.fireAllSynapses === "function") window.fireAllSynapses();
  });

  panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
})();
