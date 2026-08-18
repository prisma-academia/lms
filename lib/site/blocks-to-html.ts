import { escapeHtml } from "@/lib/site/template";
import { BASE_STYLES } from "@/lib/site/html-sections";
import type { SiteBlock } from "@/lib/site/blocks";

/**
 * One-way converter from the retired block CMS to HTML source.
 *
 * Used only by `scripts/migrate-site-blocks-to-html.ts`. It exists so the switch
 * to an HTML builder does not throw away pages tenants already published — an
 * admin should log in after the upgrade and find their page intact and now
 * editable, rather than blank with an apology.
 *
 * The output deliberately favours the author's ability to edit it afterwards
 * over pixel-matching the old React components. It emits the same `.sb-*`
 * markup the starter templates and snippets use, so a converted page and a
 * newly-created page look and read the same in the editor.
 *
 * Text that came from block fields is HTML-escaped. HTML that came from
 * `html`/`richText` blocks is passed through verbatim — it was already stored as
 * markup and is sanitized on read and on write like everything else.
 *
 * Delete this module, and `lib/site/blocks.ts` with it, once every environment
 * has been migrated.
 */

function esc(value: string | null | undefined): string {
  return escapeHtml((value ?? "").toString());
}

function ctaButtons(
  ctas: { label: string; href: string; variant?: string }[]
): string {
  if (ctas.length === 0) return "";
  const buttons = ctas
    .map(
      (c) =>
        `      <a class="sb-btn${c.variant === "primary" ? " sb-btn-primary" : ""}" href="${esc(c.href)}">${esc(c.label)}</a>`
    )
    .join("\n");
  return `    <div class="sb-actions" style="justify-content: center;">\n${buttons}\n    </div>`;
}

function blockToHtml(block: SiteBlock): string {
  switch (block.type) {
    case "hero":
      return `<section class="sb-section" style="border-top: 0;">
  <div class="sb-wrap sb-center">
${block.showLogo ? `    {{#if tenant.logoUrl}}<img src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}" style="height: 4rem; margin: 0 auto 1rem;">{{/if}}\n` : ""}${block.showLocation ? `    <p class="sb-eyebrow">{{ tenant.location }}</p>\n` : ""}    <h1 class="sb-h1">${block.headline ? esc(block.headline) : "{{ tenant.name }}"}</h1>
${block.subcopy ? `    <p class="sb-lead" style="margin: 0 auto;">${esc(block.subcopy)}</p>\n` : ""}${ctaButtons(block.ctas)}
  </div>
</section>`;

    case "about":
      return `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2">${esc(block.title ?? "About us")}</h2>
${block.body ? `    <p class="sb-lead">${esc(block.body)}</p>\n` : ""}${
        block.showContact
          ? `    <p class="sb-muted">
      {{#if tenant.email}}<a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a><br>{{/if}}
      {{#if tenant.phone}}<a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a><br>{{/if}}
      {{#if tenant.address}}{{ tenant.address }}{{/if}}
    </p>\n`
          : ""
      }  </div>
</section>`;

    case "benefits": {
      const cards = block.items
        .map(
          (i) =>
            `      <div class="sb-card">
        <h3>${esc(i.title)}</h3>
        <p class="sb-muted">${esc(i.body)}</p>
      </div>`
        )
        .join("\n");
      return `<section class="sb-section">
  <div class="sb-wrap">
    <h2 class="sb-h2 sb-center">${esc(block.title ?? "Why learn with us")}</h2>
    <div class="sb-grid">
${cards}
    </div>
  </div>
</section>`;
    }

    case "courses":
      return `<section class="sb-section" id="courses">
  <div class="sb-wrap">
    <h2 class="sb-h2">${esc(block.title ?? "Courses")}</h2>
    <div class="sb-grid">
      {{#each courses}}
        <article class="sb-card">
          {{#if this.thumbnailUrl}}<img src="{{ this.thumbnailUrl }}" alt="{{ this.title }}">{{/if}}
          <h3>{{ this.title }}</h3>
          <p class="sb-muted">{{ this.description }}</p>
          <p><strong>{{ this.price }}</strong> &middot; {{ this.lessonCount }} lessons</p>
          <a class="sb-btn" href="{{ this.url }}">View course</a>
        </article>
      {{/each}}
    </div>
  </div>
</section>`;

    case "steps": {
      const items = block.items
        .map((i) => `      <li><strong>${esc(i.title)}</strong> ${esc(i.body)}</li>`)
        .join("\n");
      return `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2 sb-center">${esc(block.title ?? "How it works")}</h2>
    <ol>
${items}
    </ol>
${
  block.ctaLabel && block.ctaHref
    ? `    <div class="sb-actions" style="justify-content: center;">
      <a class="sb-btn sb-btn-primary" href="${esc(block.ctaHref)}">${esc(block.ctaLabel)}</a>
    </div>\n`
    : ""
}  </div>
</section>`;
    }

    case "faq": {
      const items = block.items
        .map(
          (i) =>
            `    <details><summary>${esc(i.question)}</summary>
      <p>${esc(i.answer)}</p></details>`
        )
        .join("\n");
      return `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2">${esc(block.title ?? "Frequently asked questions")}</h2>
${items}
  </div>
</section>`;
    }

    case "cta":
      return `<section class="sb-section sb-center">
  <div class="sb-narrow">
    <h2 class="sb-h2">${esc(block.headline)}</h2>
${block.subcopy ? `    <p class="sb-lead" style="margin: 0 auto;">${esc(block.subcopy)}</p>\n` : ""}${ctaButtons(block.ctas)}
  </div>
</section>`;

    case "image":
      // The old block stored an S3 key and resolved it at render time. There is
      // no key-resolving variable in the template language, so the migration
      // leaves the key visible in a comment rather than silently dropping the
      // image and letting the author think it was never there.
      return `<section class="sb-section">
  <div class="sb-narrow sb-center">
    {{! migrated image block — original S3 key: ${esc(block.imageKey)} }}
    <img src="/api/media/${esc(block.imageKey)}" alt="${esc(block.alt ?? "")}" style="max-width: 100%; border-radius: 14px;">
${block.caption ? `    <p class="sb-muted">${esc(block.caption)}</p>\n` : ""}  </div>
</section>`;

    case "richText":
    case "html":
      // Already markup. Passed through as written — sanitized on read like the
      // block renderer did, so this changes nothing about its safety.
      return `<section class="sb-section">
  <div class="sb-narrow">
${block.html}
  </div>
</section>`;
  }
}

/** Convert a page's blocks into a standalone HTML document. */
export function blocksToHtml(blocks: SiteBlock[]): string {
  if (blocks.length === 0) return "";
  return [BASE_STYLES, ...blocks.map(blockToHtml)].join("\n\n") + "\n";
}
