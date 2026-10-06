// ============================================================================
// QuantAI — QuantyArtifactsService: saved artifacts + media library (Muse S6 parity)
// Prisma-backed, user-scoped. No fabricated rows: empty DB -> empty list.
// ============================================================================

export type ArtifactKind = 'artifact' | 'media';
export type ArtifactSort = 'modified' | 'opened' | 'name';

export interface QuantyArtifactRecord {
  id: string;
  userId: string;
  title: string;
  kind: string;
  type: string | null;
  language: string | null;
  code: string | null;
  markdown: string | null;
  previewHtml: string | null;
  contentRef: string | null;
  systemFile: boolean;
  createdAt: Date;
  updatedAt: Date;
  openedAt: Date | null;
}

export interface QuantyArtifactsPrismaClient {
  quantyArtifact: {
    create: (args: { data: Record<string, unknown> }) => Promise<QuantyArtifactRecord>;
    findMany: (args: Record<string, unknown>) => Promise<QuantyArtifactRecord[]>;
    findFirst: (args: Record<string, unknown>) => Promise<QuantyArtifactRecord | null>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<QuantyArtifactRecord>;
    delete: (args: { where: Record<string, unknown> }) => Promise<QuantyArtifactRecord>;
  };
}

export interface ListArtifactsOptions {
  tab?: ArtifactKind;
  sort?: ArtifactSort;
  search?: string;
  page?: number;
  pageSize?: number;
  systemOnly?: boolean;
}

export interface CreateArtifactInput {
  title: string;
  kind?: ArtifactKind;
  type?: string;
  language?: string;
  code?: string;
  markdown?: string;
  previewHtml?: string;
  contentRef?: string;
  systemFile?: boolean;
}

const VALID_KINDS: ArtifactKind[] = ['artifact', 'media'];

export function resolveArtifactSort(sort?: string): { field: 'updatedAt' | 'openedAt' | 'title'; order: 'asc' | 'desc' } {
  switch (sort) {
    case 'opened':
      return { field: 'openedAt', order: 'desc' };
    case 'name':
      return { field: 'title', order: 'asc' };
    case 'modified':
    default:
      return { field: 'updatedAt', order: 'desc' };
  }
}

export class QuantyArtifactsService {
  constructor(private readonly prisma: QuantyArtifactsPrismaClient) {}

  async listArtifacts(
    userId: string,
    options: ListArtifactsOptions = {},
  ): Promise<{ items: QuantyArtifactRecord[]; total: number }> {
    const { tab, sort = 'modified', search, page = 1, pageSize = 50, systemOnly = false } = options;
    const kind = tab && VALID_KINDS.includes(tab) ? tab : undefined;

    const where: Record<string, unknown> = { userId };
    if (kind) where.kind = kind;
    if (systemOnly) {
      where.systemFile = true;
    }
    if (search && search.trim()) {
      where.title = { contains: search.trim(), mode: 'insensitive' };
    }

    const { field, order } = resolveArtifactSort(sort);
    const orderBy: Record<string, unknown> =
      field === 'title' ? { title: order } : { [field]: order };
    // Stable secondary order so ties don't shuffle rows between pages.
    const orderByList = [orderBy, { id: 'asc' }];

    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.prisma.quantyArtifact.findMany({ where, orderBy: orderByList, take, skip }),
      this.prisma.quantyArtifact.count({ where }),
    ]);
    return { items, total };
  }

  async getArtifact(userId: string, id: string): Promise<QuantyArtifactRecord | null> {
    return this.prisma.quantyArtifact.findFirst({ where: { id, userId } });
  }

  async createArtifact(
    userId: string,
    input: CreateArtifactInput,
  ): Promise<QuantyArtifactRecord> {
    const kind: ArtifactKind = input.kind && VALID_KINDS.includes(input.kind) ? input.kind : 'artifact';
    return this.prisma.quantyArtifact.create({
      data: {
        userId,
        title: input.title.trim(),
        kind,
        type: input.type ?? null,
        language: input.language ?? null,
        code: input.code ?? null,
        markdown: input.markdown ?? null,
        previewHtml: input.previewHtml ?? null,
        contentRef: input.contentRef ?? null,
        systemFile: input.systemFile ?? false,
      },
    });
  }

  async touchOpened(userId: string, id: string): Promise<QuantyArtifactRecord | null> {
    const existing = await this.prisma.quantyArtifact.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return this.prisma.quantyArtifact.update({
      where: { id },
      data: { openedAt: new Date() },
    });
  }

  async deleteArtifact(userId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.quantyArtifact.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.prisma.quantyArtifact.delete({ where: { id } });
    return true;
  }
}
