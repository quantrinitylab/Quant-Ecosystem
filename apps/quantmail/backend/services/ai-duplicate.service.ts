export interface DuplicateGroup {
  hash: string;
  files: Array<{ id: string; name: string; size: number }>;
}

export interface FindDuplicatesResult {
  groups: DuplicateGroup[];
}

export interface CompareResult {
  similarity: number;
  isLikelyDuplicate: boolean;
}

export const PERCEPTUAL_MIN_BYTES = 64;

type Db = any;

export class AIDuplicateService {
  constructor(private readonly prisma: Db) {}

  computeHash(content: Buffer): string {
    const blockCount = 64;
    const blockSize = Math.max(1, Math.floor(content.length / blockCount));
    const blockAverages: number[] = [];
    for (let index = 0; index < blockCount; index += 1) {
      const start = index * blockSize;
      const end = Math.min(start + blockSize, content.length);
      let sum = 0;
      let count = 0;
      for (let cursor = start; cursor < end; cursor += 1) {
        sum += content[cursor] ?? 0;
        count += 1;
      }
      blockAverages.push(count ? sum / count : 0);
    }
    const average = blockAverages.reduce((sum, value) => sum + value, 0) / blockCount;
    const bytes: number[] = [];
    for (let byteIndex = 0; byteIndex < 8; byteIndex += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        if ((blockAverages[byteIndex * 8 + bit] ?? 0) >= average) byte |= 1 << (7 - bit);
      }
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString('hex');
  }

  async findDuplicates(userId: string): Promise<FindDuplicatesResult> {
    const files = (await this.prisma.file.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, size: true, contentHash: true },
    })) as Array<{ id: string; name: string; size: number; contentHash: string }>;
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

  compareTwoFiles(contentA: Buffer, contentB: Buffer): CompareResult {
    if (contentA.length < PERCEPTUAL_MIN_BYTES || contentB.length < PERCEPTUAL_MIN_BYTES) {
      return { similarity: 0, isLikelyDuplicate: false };
    }
    const distance = this.hammingDistance(this.computeHash(contentA), this.computeHash(contentB));
    return { similarity: 1 - distance / 64, isLikelyDuplicate: distance < 5 };
  }

  private hammingDistance(hashA: string, hashB: string): number {
    const left = Buffer.from(hashA, 'hex');
    const right = Buffer.from(hashB, 'hex');
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      let xor = (left[index] ?? 0) ^ (right[index] ?? 0);
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    return distance;
  }
}
