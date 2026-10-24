export interface DuplicateGroup {
  hash: string;
  files: Array<{ id: string; name: string; size: number }>;
}

export interface FindDuplicatesResult {
  groups: DuplicateGroup[];
}

interface DuplicateFileRow {
  id: string;
  name: string;
  size: number;
  contentHash: string | null;
}

export interface DuplicatePrismaClient {
  file: {
    findMany(args: Record<string, unknown>): Promise<DuplicateFileRow[]>;
  };
}

export class AIDuplicateService {
  constructor(private readonly prisma: DuplicatePrismaClient) {}

  // NOTE: duplicate detection is exact stored-content-hash grouping only.
  // The former perceptual-hash path (computeHash/compareTwoFiles) was dead
  // code — no production caller ever computed or compared perceptual hashes
  // — so it was deleted rather than advertised by the scan UI. Files with
  // no stored contentHash are skipped; near-duplicates are not detected.

  async findDuplicates(userId: string): Promise<FindDuplicatesResult> {
    const files = await this.prisma.file.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, size: true, contentHash: true },
    });
    const groupsByHash = new Map<string, Array<{ id: string; name: string; size: number }>>();
    for (const file of files) {
      if (!file.contentHash) continue;
      groupsByHash.set(file.contentHash, [
        ...(groupsByHash.get(file.contentHash) ?? []),
        { id: file.id, name: file.name, size: file.size },
      ]);
    }
    return {
      groups: [...groupsByHash.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([hash, group]) => ({ hash, files: group })),
    };
  }

}
