import { describe, it, expect, vi } from 'vitest';
import { SearchQueryService } from '../services/search-query.service';

describe('SearchQueryService raw-SQL isFlagged selection (AC-9)', () => {
  it('includes "isFlagged" in the raw SQL select query', async () => {
    let capturedSql = '';
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string, ..._params: any[]) => {
        if (sql.includes('SELECT COUNT(*)')) {
          return [{ total: 1 }];
        }
        capturedSql = sql;
        return [
          {
            id: 'e1',
            userId: 'u1',
            isStarred: false,
            isFlagged: true,
            receivedAt: new Date(),
          },
        ];
      }),
    } as any;

    const service = new SearchQueryService(prisma);
    const result = await service.search('u1', 'test query terms');

    expect(capturedSql).toContain('"isFlagged"');
    expect(capturedSql).toContain('"isStarred"');
    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).isFlagged).toBe(true);
  });
});
