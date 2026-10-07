import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { OrgService, MemberService, createOrgContextPlugin } from '@quant/organizations';

declare module 'fastify' {
  interface FastifyInstance {
    org: {
      service: OrgService;
      members: MemberService;
    };
  }
}

async function organizationsPlugin(fastify: FastifyInstance) {
  const orgService = new OrgService();
  const memberService = new MemberService();

  fastify.decorate('org', {
    service: orgService,
    members: memberService,
  });

  // Register the org context middleware with shared service instances
  await fastify.register(createOrgContextPlugin, { orgService, memberService });
}

export default fp(organizationsPlugin, {
  name: 'organizations',
});
