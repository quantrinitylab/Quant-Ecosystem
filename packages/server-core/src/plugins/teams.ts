import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { OrgService, SeatService, SharedWorkspaceService, TeamAgentService } from '@quant/teams';

// Cross-cutting multi-actor authz context (Category A). Wired ONCE in
// `createApp()` after `identity-permissions` so the team/seat/workspace context
// sits on top of the RBAC substrate (design "Sequencing": teams after
// identity-permissions). In-memory services → no external resource to release,
// so (like `organizations`/`audit`) no `onClose` is required.

declare module 'fastify' {
  interface FastifyInstance {
    /** Team/organization context from `@quant/teams`. */
    teams: {
      orgs: OrgService;
      seats: SeatService;
      workspaces: SharedWorkspaceService;
      agents: TeamAgentService;
    };
  }
}

async function teamsPlugin(fastify: FastifyInstance) {
  fastify.decorate('teams', {
    orgs: new OrgService(),
    seats: new SeatService(),
    workspaces: new SharedWorkspaceService(),
    agents: new TeamAgentService(),
  });
}

export default fp(teamsPlugin, {
  name: 'teams',
  dependencies: ['identity-permissions'],
});
