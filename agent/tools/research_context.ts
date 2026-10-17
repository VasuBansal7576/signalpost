import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { service } from '../../src/service.ts';

export default defineTool({
  description: 'Read the assigned company identity, research fields and current usage before investigating.',
  inputSchema: z.object({}),
  execute: (_input,ctx) => service().context(service().store.jobForSession(ctx.session.id).id),
});
