import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OrgService } from './org-service';
import { MemberService } from './member-service';
import type { OrgContext } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    orgContext?: OrgContext | null;
  }
}

export interface OrgContextPluginOptions {
  orgService?: OrgService;
  memberService?: MemberService;
}

async function orgContextPlugin(fastify: FastifyInstance, options: OrgContextPluginOptions) {
  const orgService = options.orgService ?? new OrgService();
  const memberService = options.memberService ?? new MemberService();

  fastify.decorateRequest('orgContext', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const orgId = request.headers['x-organization-id'] as string | undefined;

    if (!orgId) {
      request.orgContext = null;
      return;
    }

    const org = orgService.getOrg(orgId);
    if (!org) {
      request.orgContext = null;
      return;
    }

    // Try to get member from auth context if available
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      request.orgContext = null;
      return;
    }

    const membership = memberService.getMembership(orgId, userId);
    if (!membership) {
      request.orgContext = null;
      return;
    }

    request.orgContext = {
      orgId: org.id,
      org,
      memberRole: membership.role,
    };
  });
}

export const createOrgContextPlugin = fp(orgContextPlugin, {
  name: 'org-context',
});
