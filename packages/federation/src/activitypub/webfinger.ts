import { z } from 'zod';

export const WebFingerResponseSchema = z.object({
  subject: z.string(),
  links: z.array(
    z.object({
      rel: z.string(),
      type: z.string().optional(),
      href: z.string().url(),
    }),
  ),
});

export type WebFingerResponse = z.infer<typeof WebFingerResponseSchema>;

export class WebFingerHandler {
  private actorExists?: (username: string) => boolean;

  constructor(actorExists?: (username: string) => boolean) {
    this.actorExists = actorExists;
  }

  handle(resource: string, domain: string): WebFingerResponse | undefined {
    const acctRegex = /^acct:([^@]+)@(.+)$/;
    const match = acctRegex.exec(resource);

    if (!match) {
      throw new Error(`Invalid resource format: ${resource}. Expected acct:user@domain`);
    }

    const username = match[1]!;
    const resourceDomain = match[2]!;

    if (resourceDomain !== domain) {
      throw new Error(
        `Domain mismatch: resource domain ${resourceDomain} does not match ${domain}`,
      );
    }

    if (this.actorExists && !this.actorExists(username)) {
      return undefined;
    }

    return {
      subject: resource,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: `https://${domain}/users/${username}`,
        },
      ],
    };
  }
}
