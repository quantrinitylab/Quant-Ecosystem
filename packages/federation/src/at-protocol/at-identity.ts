import { z } from 'zod';

export const ATProfileSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  banner: z.string().optional(),
  createdAt: z.string(),
});

export type ATProfile = z.infer<typeof ATProfileSchema>;

export interface DIDDocument {
  id: string;
  alsoKnownAs: string[];
  verificationMethod: { id: string; type: string; publicKeyMultibase: string }[];
  service: { id: string; type: string; serviceEndpoint: string }[];
}

export class ATIdentityService {
  private dids: Map<string, DIDDocument> = new Map();
  private profiles: Map<string, ATProfile> = new Map();
  private handleToDid: Map<string, string> = new Map();

  createDID(handle: string): DIDDocument {
    const did = `did:plc:${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const doc: DIDDocument = {
      id: did,
      alsoKnownAs: [`at://${handle}`],
      verificationMethod: [
        {
          id: `${did}#atproto`,
          type: 'Multikey',
          publicKeyMultibase: `z${crypto.randomUUID().replace(/-/g, '')}`,
        },
      ],
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: `https://pds.example.com`,
        },
      ],
    };

    this.dids.set(did, doc);
    this.handleToDid.set(handle, did);

    const profile: ATProfile = {
      did,
      handle,
      createdAt: new Date().toISOString(),
    };
    this.profiles.set(did, profile);

    return doc;
  }

  resolveDID(did: string): DIDDocument | null {
    return this.dids.get(did) ?? null;
  }

  rotateKeys(did: string): DIDDocument | null {
    const doc = this.dids.get(did);
    if (!doc) return null;

    doc.verificationMethod = [
      {
        id: `${did}#atproto`,
        type: 'Multikey',
        publicKeyMultibase: `z${crypto.randomUUID().replace(/-/g, '')}`,
      },
    ];

    return doc;
  }

  getProfile(did: string): ATProfile | null {
    return this.profiles.get(did) ?? null;
  }

  updateProfile(
    did: string,
    profile: Partial<Omit<ATProfile, 'did' | 'createdAt'>>,
  ): ATProfile | null {
    const existing = this.profiles.get(did);
    if (!existing) return null;

    const updated: ATProfile = {
      ...existing,
      ...profile,
      did: existing.did,
      createdAt: existing.createdAt,
    };
    this.profiles.set(did, updated);
    return updated;
  }
}
