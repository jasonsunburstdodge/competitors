(() => {
  "use strict";

  const PHONE_DISPLAY = "(817) 393-9001";
  const PHONE_TEL = "tel:+18173939001";

  let overlay, modal, lastTrigger;

  function fieldsHTML() {
    return `
      <div class="audit-field-row">
        <label class="audit-field">First Name*<input type="text" name="firstName" autocomplete="given-name" required></label>
        <label class="audit-field">Last Name*<input type="text" name="lastName" autocomplete="family-name" required></label>
      </div>
      <div class="audit-field-row">
        <label class="audit-field">Email*<input type="email" name="email" autocomplete="email" required></label>
        <label class="audit-field">Phone*<input type="tel" name="phone" autocomplete="tel" required></label>
      </div>
      <label class="audit-field audit-field-full">Website Address*<input type="text" name="website" autocomplete="url" placeholder="yourbusiness.com" required></label>
      <label class="audit-field audit-field-full">Additional Information<textarea name="notes" maxlength="5000" rows="5" placeholder="Anything else we should know? (optional)"></textarea></label>
      <div class="audit-char-count"><span class="audit-char-count-num">0</span> / 5,000</div>
    `;
  }

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "audit-modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title"></div>`;
    document.body.appendChild(overlay);
    modal = overlay.querySelector(".audit-modal");

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  function render(kind, title, prefillNotes) {
    const callNow = kind === "contact"
      ? `<a class="audit-call-now" href="${PHONE_TEL}">Prefer to talk now? Call ${PHONE_DISPLAY} &rarr;</a>`
      : "";
    const scheduleButton = kind === "contact"
      ? `<button type="button" class="cta audit-schedule">Schedule a Consultation &rarr;</button>`
      : "";

    modal.innerHTML = `
      <button type="button" class="audit-modal-close" aria-label="Close">&times;</button>
      <h2 id="audit-modal-title" class="audit-modal-title">${title}</h2>
      <p class="audit-modal-sub">Tell us a bit about your business and we'll get back to you within 24 hours.</p>
      ${callNow}
      <form class="audit-modal-form">
        ${fieldsHTML()}
        <div class="audit-actions">
          <button type="submit" class="cta audit-submit">Submit Request &rarr;</button>
          ${scheduleButton}
        </div>
      </form>
    `;

    const form = modal.querySelector("form");
    const notes = modal.querySelector("textarea[name=notes]");
    const count = modal.querySelector(".audit-char-count-num");

    if (prefillNotes) {
      notes.value = prefillNotes;
      count.textContent = notes.value.length;
    }

    modal.querySelector(".audit-modal-close").addEventListener("click", close);
    notes.addEventListener("input", () => {
      count.textContent = notes.value.length;
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // Placeholder only: no backend is wired up yet, so this just closes
      // the form. Once a form backend (e.g. Formspree) is configured, this
      // is where the submission gets sent, an auto-reply thanks the
      // submitter, and the data forwards to info@silverxis.com.
      close();
      form.reset();
      count.textContent = "0";
    });

    const scheduleEl = modal.querySelector(".audit-schedule");
    if (scheduleEl) {
      scheduleEl.addEventListener("click", () => {
        // Placeholder only, same behavior as submit for now. Once a
        // calendar connection (e.g. Calendly) is wired up, this opens
        // real scheduling instead of just closing the form.
        close();
        form.reset();
        count.textContent = "0";
      });
    }
  }

  function open(kind, title, trigger, prefillNotes) {
    if (!overlay) buildOverlay();
    lastTrigger = trigger || null;
    render(kind, title, prefillNotes);
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    const firstField = modal.querySelector("input");
    if (firstField) firstField.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
  }

  document.addEventListener("click", (e) => {
    const auditTrigger = e.target.closest("[data-audit-type]");
    if (auditTrigger) {
      e.preventDefault();
      open("audit", auditTrigger.getAttribute("data-audit-type"), auditTrigger);
      return;
    }
    const contactTrigger = e.target.closest("[data-contact-trigger]");
    if (contactTrigger) {
      e.preventDefault();
      open("contact", "Contact SilverXis", contactTrigger);
    }
  });

  // Public hook so other widgets (the Ask SilverXis chatbot) can hand a
  // question off to a human via this same contact form.
  window.SilverXisContact = {
    openWithMessage(message) {
      open("contact", "Contact SilverXis", null, message);
    }
  };
})();
