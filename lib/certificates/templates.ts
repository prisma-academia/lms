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
