import { z } from 'zod';

export const NodeInfoSchema = z.object({
  version: z.literal('2.1'),
  software: z.object({
    name: z.string(),
    version: z.string(),
  }),
  protocols: z.array(z.string()),
  usage: z.object({
    users: z.object({
      total: z.number(),
      activeMonth: z.number(),
    }),
    localPosts: z.number(),
  }),
  openRegistrations: z.boolean(),
});

export type NodeInfoDocument = z.infer<typeof NodeInfoSchema>;

export interface NodeInfoWellKnown {
  links: Array<{
    rel: string;
    href: string;
  }>;
}

export class NodeInfoHandler {
  private userCount = 0;
  private activeMonthCount = 0;
  private localPostCount = 0;

  setStats(stats: { users?: number; activeMonth?: number; localPosts?: number }): void {
    if (stats.users !== undefined) this.userCount = stats.users;
    if (stats.activeMonth !== undefined) this.activeMonthCount = stats.activeMonth;
    if (stats.localPosts !== undefined) this.localPostCount = stats.localPosts;
  }

  getWellKnown(domain: string): NodeInfoWellKnown {
    return {
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: `https://${domain}/nodeinfo/2.1`,
        },
      ],
    };
  }

  getNodeInfo(): NodeInfoDocument {
    return {
      version: '2.1',
      software: {
        name: 'quant',
        version: '1.0.0',
      },
      protocols: ['activitypub'],
      usage: {
        users: {
          total: this.userCount,
          activeMonth: this.activeMonthCount,
        },
        localPosts: this.localPostCount,
      },
      openRegistrations: true,
    };
  }
}
