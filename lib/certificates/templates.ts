/**
 * Starter markup for an HTML-mode certificate.
 *
 * A plain string rather than a component, for the same reason
 * `lib/site/html-sections.ts` is: the whole point of HTML mode is that the
 * author owns every element. A component would hand back exactly the fixed
 * layout they switched away from.
 *
 * The `<style>` block is lifted out and scoped by `sanitizeHtmlWithStyles`, so
 * these rules style the certificate and cannot reach the page chrome around it.
 * `@page` is the exception worth knowing about: it is a document-level at-rule
 * that no selector scoping applies to, which is fine here — a certificate is the
 * only thing anyone prints from that view, and `print-button.tsx` exists purely
 * to print it.
 */

export function classicCertificateHtml(): string {
  return `<style>
  /* Certificates print. Landscape A4 with no browser headers is the difference
     between a document someone frames and one they throw away. */
  @page { size: A4 landscape; margin: 12mm; }

  .cert {
    --cert-accent: {{ accentColor }};
    position: relative;
    aspect-ratio: 1.414 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 3.5rem;
    text-align: center;
    background: #fff;
    color: #1c1917;
    border: 6px solid var(--cert-accent);
    border-radius: 6px;
  }
  /* Inner hairline — the detail that reads as "printed", not "web page". */
  .cert::after {
    content: "";
    position: absolute;
    inset: 10px;
    border: 1px solid var(--cert-accent);
    border-radius: 3px;
    opacity: 0.45;
    pointer-events: none;
  }
  .cert-logo { height: 3rem; margin-bottom: 0.5rem; }
  .cert-title {
    font-size: clamp(1.5rem, 3.5vw, 2.25rem);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cert-accent);
    margin: 0;
  }
  .cert-subtitle { font-size: 0.875rem; color: #57534e; margin: 0; }
  .cert-name {
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.1;
    margin: 0.25rem 0;
  }
  .cert-body { max-width: 34rem; font-size: 0.95rem; line-height: 1.7; color: #44403c; margin: 0; }
  .cert-sign {
    display: flex;
    gap: 4rem;
    justify-content: center;
    width: 100%;
    margin-top: 1.75rem;
  }
  .cert-sign div { flex: 0 1 14rem; }
  .cert-rule { border-top: 1px solid #a8a29e; padding-top: 0.4rem; }
  .cert-sign span {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #78716c;
  }
  .cert-serial {
    margin-top: 1.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #78716c;
  }
</style>

<div class="cert">
  {{#if tenant.logoUrl}}
    <img class="cert-logo" src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}">
  {{/if}}

  <h1 class="cert-title">Certificate of Completion</h1>
  <p class="cert-subtitle">This is proudly presented to</p>

  <p class="cert-name">{{ clientName }}</p>

  <p class="cert-body">
    for successfully completing
    <strong>{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</strong>
    on {{ date }}.
  </p>

  <div class="cert-sign">
    <div class="cert-rule"><span>Date &middot; {{ date }}</span></div>
    <div class="cert-rule"><span>{{ tenant.name }}</span></div>
  </div>

  <p class="cert-serial">Certificate no. {{ serial }}</p>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* More designs                                                                */
/* -------------------------------------------------------------------------- */

/*
 * What every design below has in common, and why.
 *
 *  - Sizes are in `cqw` — hundredths of the certificate's own width — never in
 *    rem or vw. A certificate is shown as a thumbnail, in an editor pane, on a
 *    learner's screen and on a printed sheet; sized this way it is the same
 *    picture at every one of those widths, so text can never outgrow the page
 *    at a size nobody happened to test.
 *  - `.cert` is the container the cqw units measure, so it carries no padding
 *    or border of its own (an element cannot be sized by itself). Everything
 *    visible sits on a child.
 *  - Margins, sizes and fonts are set explicitly on every element. The
 *    certificate is rendered inside pages with different base styles; nothing
 *    here may depend on a browser default.
 *  - `print-color-adjust: exact`, or the bands and seals vanish on paper —
 *    browsers drop backgrounds when printing unless told not to.
 *  - The accent colour is the tenant's choice and can be pale, so it is used
 *    raw only for rules and fills. Anything that carries text, or is text, uses
 *    `--cert-deep`: the accent mixed toward ink, by enough that even a light
 *    yellow accent leaves text at 4:1 or better against its background.
 *  - Only system fonts. The sanitizer removes `@import`, and a web font that
 *    has not loaded when the print dialog opens prints as a fallback anyway.
 *  - No images except the tenant's logo, and no SVG: every ornament is a
 *    border, a gradient or a rotated box, so a design never depends on which
 *    SVG elements the sanitizer happens to allow.
 */

/** Ornamental and warm: an engraved band, an italic name, a starred seal. */
export function heritageCertificateHtml(): string {
  return `<style>
  @page { size: A4 landscape; margin: 12mm; }

  .cert {
    --cert-accent: {{ accentColor }};
    --cert-deep: color-mix(in srgb, var(--cert-accent) 50%, #1c1917);
    --cert-ink: #231f1a;
    --cert-soft: #6b6359;
    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1.414 / 1;
    overflow: hidden;
    background: #fff;
    color: var(--cert-ink);
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cert * { box-sizing: border-box; margin: 0; padding: 0; }

  /* Fine diagonal hatching: reads as engraved rather than drawn. */
  .cert-band {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--cert-accent) 30%, #fff) 0 0.2cqw,
      #fff 0.2cqw 0.6cqw
    );
  }
  .cert-panel {
    position: absolute;
    inset: 2.4cqw;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.2cqw;
    padding: 4cqw 8cqw 3.2cqw;
    text-align: center;
    background: #fff;
    border: 0.3cqw solid var(--cert-deep);
  }
  .cert-panel::after {
    content: "";
    position: absolute;
    inset: 0.8cqw;
    border: 0.1cqw solid var(--cert-deep);
    pointer-events: none;
  }
  /* A lozenge on each corner of the inner rule. */
  .cert-corner {
    position: absolute;
    z-index: 1;
    width: 1.5cqw;
    height: 1.5cqw;
    background: #fff;
    border: 0.16cqw solid var(--cert-deep);
    transform: rotate(45deg);
  }
  .cert-corner-tl { top: 0.05cqw; left: 0.05cqw; }
  .cert-corner-tr { top: 0.05cqw; right: 0.05cqw; }
  .cert-corner-bl { bottom: 0.05cqw; left: 0.05cqw; }
  .cert-corner-br { bottom: 0.05cqw; right: 0.05cqw; }

  .cert-logo { display: block; height: 5.2cqw; width: auto; max-width: 22cqw; object-fit: contain; }
  .cert-org { font-size: 1.7cqw; letter-spacing: 0.08em; color: var(--cert-soft); }
  .cert-title {
    font-size: 2.5cqw;
    font-weight: 400;
    line-height: 1.2;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--cert-deep);
  }
  .cert-flourish { display: flex; align-items: center; gap: 1cqw; width: 30cqw; }
  .cert-flourish span { flex: 1; height: 0.1cqw; background: var(--cert-deep); }
  .cert-flourish i { width: 0.85cqw; height: 0.85cqw; background: var(--cert-deep); transform: rotate(45deg); }
  .cert-lead { font-size: 1.5cqw; font-style: italic; color: var(--cert-soft); }
  .cert-name {
    max-width: 70cqw;
    font-size: 6.2cqw;
    font-style: italic;
    font-weight: 400;
    line-height: 1.05;
    text-wrap: balance;
  }
  .cert-body { max-width: 56cqw; font-size: 1.65cqw; line-height: 1.6; color: #3f3a34; text-wrap: balance; }
  .cert-body strong { font-weight: 700; color: var(--cert-ink); }

  .cert-foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 4cqw;
    width: 100%;
    margin-top: 0.6cqw;
  }
  .cert-field { display: flex; flex-direction: column; gap: 0.5cqw; }
  .cert-value { font-size: 1.6cqw; line-height: 1.25; }
  .cert-label {
    padding-top: 0.55cqw;
    border-top: 0.1cqw solid #a8a29e;
    font-size: 1cqw;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--cert-soft);
  }
  /* An eight-point seal: two squares, one turned 45 degrees, under a disc. */
  .cert-seal { position: relative; width: 8.6cqw; height: 8.6cqw; }
  .cert-seal::before,
  .cert-seal::after {
    content: "";
    position: absolute;
    inset: 1.1cqw;
    background: var(--cert-deep);
  }
  .cert-seal::after { transform: rotate(45deg); }
  .cert-seal span {
    position: absolute;
    z-index: 1;
    inset: 1.5cqw;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 0.12cqw solid #fff;
    background: var(--cert-deep);
    color: #fff;
    font-size: 2.6cqw;
    line-height: 1;
  }
  .cert-serial { font-size: 1cqw; letter-spacing: 0.14em; color: var(--cert-soft); }
</style>

<div class="cert">
  <div class="cert-band" aria-hidden="true"></div>
  <div class="cert-panel">
    <span class="cert-corner cert-corner-tl" aria-hidden="true"></span>
    <span class="cert-corner cert-corner-tr" aria-hidden="true"></span>
    <span class="cert-corner cert-corner-bl" aria-hidden="true"></span>
    <span class="cert-corner cert-corner-br" aria-hidden="true"></span>

    {{#if tenant.logoUrl}}
      <img class="cert-logo" src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}">
    {{else}}
      <p class="cert-org">{{ tenant.name }}</p>
    {{/if}}

    <h1 class="cert-title">Certificate of Completion</h1>
    <div class="cert-flourish" aria-hidden="true"><span></span><i></i><span></span></div>
    <p class="cert-lead">This certificate is proudly presented to</p>

    <p class="cert-name">{{ clientName }}</p>

    <p class="cert-body">
      in recognition of the successful completion of
      <strong>{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</strong>
    </p>

    <div class="cert-foot">
      <div class="cert-field">
        <span class="cert-value">{{ date }}</span>
        <span class="cert-label">Date awarded</span>
      </div>
      <div class="cert-seal" aria-hidden="true"><span>★</span></div>
      <div class="cert-field">
        <span class="cert-value">{{ tenant.name }}</span>
        <span class="cert-label">Issued by</span>
      </div>
    </div>

    <p class="cert-serial">Certificate no. {{ serial }}</p>
  </div>
</div>`;
}

/** Quiet and modern: left-aligned, one very large name, almost no ornament. */
export function studioCertificateHtml(): string {
  return `<style>
  @page { size: A4 landscape; margin: 12mm; }

  .cert {
    --cert-accent: {{ accentColor }};
    --cert-deep: color-mix(in srgb, var(--cert-accent) 45%, #111827);
    --cert-ink: #111827;
    --cert-soft: #5b6472;
    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1.414 / 1;
    overflow: hidden;
    background: #fff;
    color: var(--cert-ink);
    font-family: "Avenir Next", Avenir, "Century Gothic", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cert * { box-sizing: border-box; margin: 0; padding: 0; }

  /* The only two marks on the page: a spine, and one ring leaving the corner. */
  .cert-spine { position: absolute; inset: 0 auto 0 0; width: 1.1cqw; background: var(--cert-accent); }
  .cert-ring {
    position: absolute;
    top: -19cqw;
    right: -15cqw;
    width: 46cqw;
    height: 46cqw;
    border-radius: 50%;
    border: 0.28cqw solid color-mix(in srgb, var(--cert-accent) 32%, #fff);
  }

  .cert-sheet {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: 5.6cqw 7cqw 4.8cqw 9cqw;
  }
  .cert-top { display: flex; align-items: center; gap: 1.4cqw; min-height: 4.6cqw; }
  .cert-logo { display: block; height: 4.6cqw; width: auto; max-width: 20cqw; object-fit: contain; }
  .cert-org { font-size: 1.6cqw; font-weight: 600; }

  .cert-main { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 1.5cqw; }
  .cert-title { font-size: 1.75cqw; font-weight: 600; line-height: 1.2; color: var(--cert-deep); }
  .cert-name {
    max-width: 72cqw;
    font-size: 7.4cqw;
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }
  .cert-body { max-width: 54cqw; font-size: 1.9cqw; line-height: 1.5; color: var(--cert-soft); }
  .cert-body strong { font-weight: 600; color: var(--cert-ink); }

  .cert-facts {
    display: grid;
    grid-template-columns: 1fr 1fr 1.3fr;
    gap: 4cqw;
    padding-top: 1.6cqw;
    border-top: 0.12cqw solid #d4d4d8;
  }
  .cert-fact { display: flex; flex-direction: column; gap: 0.5cqw; }
  .cert-label { font-size: 1.1cqw; color: var(--cert-soft); }
  .cert-value { font-size: 1.5cqw; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; }
  /* Left empty on purpose: room for a signature in ink. */
  .cert-signature { height: 2.1cqw; border-bottom: 0.12cqw solid var(--cert-ink); }
</style>

<div class="cert">
  <div class="cert-ring" aria-hidden="true"></div>
  <div class="cert-spine" aria-hidden="true"></div>

  <div class="cert-sheet">
    <div class="cert-top">
      {{#if tenant.logoUrl}}
        <img class="cert-logo" src="{{ tenant.logoUrl }}" alt="">
      {{/if}}
      <p class="cert-org">{{ tenant.name }}</p>
    </div>

    <div class="cert-main">
      <h1 class="cert-title">Certificate of completion</h1>
      <p class="cert-name">{{ clientName }}</p>
      <p class="cert-body">
        has completed
        <strong>{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</strong>.
      </p>
    </div>

    <div class="cert-facts">
      <div class="cert-fact">
        <span class="cert-label">Awarded on</span>
        <span class="cert-value">{{ date }}</span>
      </div>
      <div class="cert-fact">
        <span class="cert-label">Certificate number</span>
        <span class="cert-value">{{ serial }}</span>
      </div>
      <div class="cert-fact">
        <span class="cert-label">Authorised signature</span>
        <span class="cert-signature"></span>
      </div>
    </div>
  </div>
</div>`;
}

/** Confident: a full-height band in the brand colour, the name set large beside it. */
export function bannerCertificateHtml(): string {
  return `<style>
  @page { size: A4 landscape; margin: 12mm; }

  .cert {
    --cert-accent: {{ accentColor }};
    /* The band carries white text, so it is the accent pulled well toward ink:
       still the brand's hue, but dark enough to read on whatever was chosen. */
    --cert-deep: color-mix(in srgb, var(--cert-accent) 48%, #0b1220);
    --cert-ink: #0f172a;
    --cert-soft: #55607a;
    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1.414 / 1;
    overflow: hidden;
    background: #fff;
    color: var(--cert-ink);
    font-family: "Gill Sans", "Gill Sans MT", Optima, Candara, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cert * { box-sizing: border-box; margin: 0; padding: 0; }

  .cert-band {
    position: absolute;
    inset: 0 auto 0 0;
    width: 31cqw;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 5cqw 3.6cqw 4.6cqw;
    overflow: hidden;
    background: var(--cert-deep);
    color: #fff;
  }
  /* The one loud thing: the word itself, running up the band. */
  .cert-word {
    position: absolute;
    right: -1.6cqw;
    bottom: 2.4cqw;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 11cqw;
    font-weight: 700;
    line-height: 0.8;
    letter-spacing: -0.02em;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.13);
  }
  /* A white tile, so a logo of any colour stays visible on the band. */
  .cert-mark {
    position: relative;
    align-self: flex-start;
    padding: 1cqw 1.2cqw;
    border-radius: 0.7cqw;
    background: #fff;
  }
  .cert-logo { display: block; height: 4.2cqw; width: auto; max-width: 18cqw; object-fit: contain; }
  .cert-org { position: relative; font-size: 2cqw; font-weight: 600; line-height: 1.2; }
  .cert-facts { position: relative; display: flex; flex-direction: column; gap: 1.4cqw; }
  .cert-fact { display: flex; flex-direction: column; gap: 0.3cqw; }
  .cert-fact-label { font-size: 1.05cqw; color: rgba(255, 255, 255, 0.86); }
  .cert-fact-value { font-size: 1.45cqw; font-weight: 600; font-variant-numeric: tabular-nums; }

  .cert-main {
    position: absolute;
    inset: 0 0 0 31cqw;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.5cqw;
    padding: 5cqw 7cqw 4.6cqw 6cqw;
  }
  .cert-title { font-size: 1.9cqw; font-weight: 600; line-height: 1.2; color: var(--cert-deep); }
  .cert-lead { font-size: 1.5cqw; color: var(--cert-soft); }
  .cert-name { font-size: 6cqw; font-weight: 700; line-height: 1.04; letter-spacing: -0.01em; text-wrap: balance; }
  .cert-bar { width: 8cqw; height: 0.55cqw; background: var(--cert-accent); }
  .cert-body { max-width: 48cqw; font-size: 1.75cqw; line-height: 1.55; color: #334155; }
  .cert-body strong { font-weight: 600; color: var(--cert-ink); }
  .cert-sign { display: flex; gap: 4cqw; margin-top: 3.4cqw; }
  .cert-sign-field { flex: 1; display: flex; flex-direction: column; gap: 0.5cqw; }
  .cert-sign-value { min-height: 2cqw; font-size: 1.5cqw; font-weight: 600; line-height: 1.3; }
  .cert-sign-label { padding-top: 0.5cqw; border-top: 0.12cqw solid #94a3b8; font-size: 1.05cqw; color: var(--cert-soft); }
</style>

<div class="cert">
  <div class="cert-band">
    <span class="cert-word" aria-hidden="true">Certificate</span>

    {{#if tenant.logoUrl}}
      <div class="cert-mark"><img class="cert-logo" src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}"></div>
    {{else}}
      <p class="cert-org">{{ tenant.name }}</p>
    {{/if}}

    <div class="cert-facts">
      <div class="cert-fact">
        <span class="cert-fact-label">Awarded on</span>
        <span class="cert-fact-value">{{ date }}</span>
      </div>
      <div class="cert-fact">
        <span class="cert-fact-label">Certificate number</span>
        <span class="cert-fact-value">{{ serial }}</span>
      </div>
    </div>
  </div>

  <div class="cert-main">
    <h1 class="cert-title">Certificate of achievement</h1>
    <p class="cert-lead">Awarded to</p>
    <p class="cert-name">{{ clientName }}</p>
    <div class="cert-bar" aria-hidden="true"></div>
    <p class="cert-body">
      for successfully completing
      <strong>{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</strong>.
    </p>

    <div class="cert-sign">
      <div class="cert-sign-field">
        <span class="cert-sign-value"></span>
        <span class="cert-sign-label">Authorised signature</span>
      </div>
      <div class="cert-sign-field">
        <span class="cert-sign-value">{{ tenant.name }}</span>
        <span class="cert-sign-label">Issued by</span>
      </div>
    </div>
  </div>
</div>`;
}

/** Austere and formal: the institution first, a full sentence of award, room to sign. */
export function scholarCertificateHtml(): string {
  return `<style>
  @page { size: A4 landscape; margin: 12mm; }

  .cert {
    --cert-accent: {{ accentColor }};
    --cert-deep: color-mix(in srgb, var(--cert-accent) 50%, #18181b);
    --cert-ink: #18181b;
    --cert-soft: #57534e;
    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1.414 / 1;
    overflow: hidden;
    background: #fff;
    color: var(--cert-ink);
    font-family: Baskerville, "Baskerville Old Face", "Libre Baskerville", "Times New Roman", Times, serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cert * { box-sizing: border-box; margin: 0; padding: 0; }

  /* A plain double rule in ink. The colour is saved for the masthead. */
  .cert-frame { position: absolute; inset: 2cqw; border: 0.28cqw solid var(--cert-ink); }
  .cert-frame::after {
    content: "";
    position: absolute;
    inset: 0.5cqw;
    border: 0.08cqw solid var(--cert-ink);
  }

  .cert-sheet {
    position: absolute;
    inset: 2cqw;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4cqw 9cqw 3cqw;
    text-align: center;
  }
  .cert-logo { display: block; height: 4.6cqw; width: auto; max-width: 20cqw; margin-bottom: 1.1cqw; object-fit: contain; }
  /* The institution's name is the headline, as on a degree. */
  .cert-org {
    font-family: "Trajan Pro", "Perpetua Titling MT", Copperplate, "Copperplate Gothic Light", Baskerville, "Times New Roman", serif;
    font-size: 2.7cqw;
    font-weight: 400;
    line-height: 1.2;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    text-wrap: balance;
    color: var(--cert-deep);
  }
  .cert-rules {
    width: 100%;
    height: 0.75cqw;
    margin-top: 1.5cqw;
    border-top: 0.24cqw solid var(--cert-deep);
    border-bottom: 0.08cqw solid var(--cert-deep);
  }

  .cert-text { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1cqw; }
  .cert-title { font-size: 2.1cqw; font-weight: 400; font-style: italic; line-height: 1.2; }
  .cert-line { font-size: 1.6cqw; line-height: 1.5; color: var(--cert-soft); }
  .cert-name {
    max-width: 70cqw;
    font-size: 5cqw;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-wrap: balance;
  }
  .cert-course { max-width: 60cqw; font-size: 2.3cqw; font-weight: 700; line-height: 1.25; text-wrap: balance; }

  .cert-foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 5cqw;
    width: 100%;
  }
  .cert-sign { display: flex; flex-direction: column; gap: 0.5cqw; }
  .cert-sign-value { min-height: 2.2cqw; font-size: 1.5cqw; line-height: 1.3; }
  .cert-sign-label {
    padding-top: 0.5cqw;
    border-top: 0.1cqw solid var(--cert-ink);
    font-size: 1.05cqw;
    font-style: italic;
    color: var(--cert-soft);
  }
  /* A plain medal: two rings and a lozenge. */
  .cert-medal {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 7.2cqw;
    height: 7.2cqw;
    border-radius: 50%;
    border: 0.28cqw solid var(--cert-deep);
  }
  .cert-medal::before {
    content: "";
    position: absolute;
    inset: 0.5cqw;
    border-radius: 50%;
    border: 0.08cqw solid var(--cert-deep);
  }
  .cert-medal i { width: 1.9cqw; height: 1.9cqw; background: var(--cert-deep); transform: rotate(45deg); }
  .cert-serial { margin-top: 1.3cqw; font-size: 1cqw; letter-spacing: 0.12em; color: var(--cert-soft); }
</style>

<div class="cert">
  <div class="cert-frame" aria-hidden="true"></div>

  <div class="cert-sheet">
    {{#if tenant.logoUrl}}
      <img class="cert-logo" src="{{ tenant.logoUrl }}" alt="">
    {{/if}}
    <p class="cert-org">{{ tenant.name }}</p>
    <div class="cert-rules" aria-hidden="true"></div>

    <div class="cert-text">
      <h1 class="cert-title">Certificate of Completion</h1>
      <p class="cert-line">This is to certify that</p>
      <p class="cert-name">{{ clientName }}</p>
      <p class="cert-line">has fulfilled all the requirements of</p>
      <p class="cert-course">{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</p>
      <p class="cert-line">and is awarded this certificate on {{ date }}.</p>
    </div>

    <div class="cert-foot">
      <div class="cert-sign">
        <span class="cert-sign-value"></span>
        <span class="cert-sign-label">Authorised signature</span>
      </div>
      <div class="cert-medal" aria-hidden="true"><i></i></div>
      <div class="cert-sign">
        <span class="cert-sign-value">{{ date }}</span>
        <span class="cert-sign-label">Date of award</span>
      </div>
    </div>

    <p class="cert-serial">Certificate no. {{ serial }}</p>
  </div>
</div>`;
}

export type CertificateTemplate = {
  /** Stable id. Never shown; safe to use in a CSS scope or a URL. */
  id: string;
  name: string;
  /** One line for the gallery: what kind of certificate this suits. */
  description: string;
  html: () => string;
};

/**
 * Every built-in design, in the order the gallery shows them. `classic` stays
 * first: it is what "switch to HTML" has always seeded.
 */
export const CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "A centred layout inside a coloured border. Suits almost anything.",
    html: classicCertificateHtml,
  },
  {
    id: "heritage",
    name: "Heritage",
    description: "An engraved border, an italic name and a seal. For awards with a sense of occasion.",
    html: heritageCertificateHtml,
  },
  {
    id: "studio",
    name: "Studio",
    description: "Left-aligned and spare, with the name set very large. For modern, professional courses.",
    html: studioCertificateHtml,
  },
  {
    id: "banner",
    name: "Banner",
    description: "A full-height band in your accent colour. Bold, and unmistakably yours.",
    html: bannerCertificateHtml,
  },
  {
    id: "scholar",
    name: "Scholar",
    description: "Your organisation's name as the masthead and a formal sentence of award, with room to sign.",
    html: scholarCertificateHtml,
  },
];
