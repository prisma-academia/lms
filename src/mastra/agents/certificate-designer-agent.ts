import { Agent } from '@mastra/core/agent';
import { aiModel } from '../../../lib/ai/config';
// Relative, not `@/lib/...` — see the path-alias note in lib/ai/config.ts.
import { certificateDesignerInstructions } from '../../../lib/certificates/ai-guide';

/**
 * Designs printable certificates as HTML + CSS.
 *
 * Its instructions are not written here. They are generated from the
 * certificate variable catalog (lib/certificates/variables.ts) and the page
 * contract in lib/certificates/ai-guide.ts, so the prompt cannot fall out of
 * step with what a certificate is actually allowed to contain.
 */
export const certificateDesignerAgent = new Agent({
  id: 'certificate-designer-agent',
  name: 'Certificate Designer Agent',
  instructions: certificateDesignerInstructions(),
  // One model for every AI feature; see lib/ai/config.ts.
  model: aiModel(),
});
