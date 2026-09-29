import { describe, it, expect, beforeEach } from 'vitest';
import { FilterService } from '../services/filter.service';

describe('FilterService', () => {
  let service: FilterService;

  beforeEach(() => {
    service = new FilterService();
  });

  describe('listFilters', () => {
    it('returns all available filters', async () => {
      const filters = await service.listFilters();

      expect(filters.length).toBeGreaterThan(0);
      expect(filters[0]).toHaveProperty('id');
      expect(filters[0]).toHaveProperty('name');
      expect(filters[0]).toHaveProperty('previewUrl');
    });
  });

  describe('applyFilter', () => {
    it('applies a filter to a photo', async () => {
      const result = await service.applyFilter('photo-1', 'filter-clarendon');

      expect(result.photoId).toBe('photo-1');
      expect(result.filterId).toBe('filter-clarendon');
      expect(result.appliedAt).toBeInstanceOf(Date);
    });

    it('throws for non-existent filter', async () => {
      await expect(service.applyFilter('photo-1', 'filter-invalid')).rejects.toThrow(
        'Filter not found',
      );
    });
  });

  describe('getFilterPreview', () => {
    it('returns preview URL for a filter', async () => {
      const result = await service.getFilterPreview('filter-clarendon');

      expect(result.filterId).toBe('filter-clarendon');
      expect(result.previewUrl).toBe('/filters/clarendon.png');
    });

    it('throws for non-existent filter', async () => {
      await expect(service.getFilterPreview('filter-nonexistent')).rejects.toThrow(
        'Filter not found',
      );
    });
  });
});
