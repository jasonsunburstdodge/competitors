(() => {
  "use strict";

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
