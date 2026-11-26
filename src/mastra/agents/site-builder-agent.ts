import { Agent } from '@mastra/core/agent';
import { aiModel } from '../../../lib/ai/config';
// Relative, not `@/lib/...` — see the path-alias note in lib/ai/config.ts.
import { siteBuilderInstructions } from '../../../lib/site/ai-guide';

/**
 * Designs pages, headers and footers for an academy's public site, as HTML +
 * CSS with `{{ variables }}`.
 *
 * Its instructions are not written here. The standing contract is generated in
 * lib/site/ai-guide.ts, and what differs by kind of page — which variables
 * exist, which forms the platform runs there — is generated per request from
 * the same catalogues the sanitizer and the page runtime read
 * (lib/site/variables.ts, lib/site/site-api.ts). So the prompt cannot fall out
 * of step with what a site page is actually allowed to contain.
 */
export const siteBuilderAgent = new Agent({
  id: 'site-builder-agent',
  name: 'Site Builder Agent',
  instructions: siteBuilderInstructions(),
  // One model for every AI feature; see lib/ai/config.ts.
  model: aiModel(),
});
