export interface Filter {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  category: string;
}

const AVAILABLE_FILTERS: Filter[] = [
  {
    id: 'filter-clarendon',
    name: 'Clarendon',
    description: 'Brightens, highlights, and intensifies shadows',
    previewUrl: '/filters/clarendon.png',
    category: 'classic',
  },
  {
    id: 'filter-gingham',
    name: 'Gingham',
    description: 'Vintage-inspired with a soft, washed-out look',
    previewUrl: '/filters/gingham.png',
    category: 'classic',
  },
  {
    id: 'filter-moon',
    name: 'Moon',
    description: 'Black and white with enhanced shadows',
    previewUrl: '/filters/moon.png',
    category: 'monochrome',
  },
  {
    id: 'filter-lark',
    name: 'Lark',
    description: 'Brightens and intensifies colors with desaturated darks',
    previewUrl: '/filters/lark.png',
    category: 'bright',
  },
  {
    id: 'filter-reyes',
    name: 'Reyes',
    description: 'Dusty, vintage feel with reduced saturation',
    previewUrl: '/filters/reyes.png',
    category: 'vintage',
  },
  {
    id: 'filter-juno',
    name: 'Juno',
    description: 'Slightly intensifies warm tones and cool highlights',
    previewUrl: '/filters/juno.png',
    category: 'warm',
  },
];

export interface ApplyFilterResult {
  photoId: string;
  filterId: string;
  appliedAt: Date;
}

export class FilterService {
  private appliedFilters: ApplyFilterResult[] = [];

  async listFilters(): Promise<Filter[]> {
    return AVAILABLE_FILTERS;
  }

  async getFilter(filterId: string): Promise<Filter | null> {
    return AVAILABLE_FILTERS.find((f) => f.id === filterId) ?? null;
  }

  async applyFilter(photoId: string, filterId: string): Promise<ApplyFilterResult> {
    const filter = AVAILABLE_FILTERS.find((f) => f.id === filterId);
    if (!filter) {
      throw new Error('Filter not found');
    }

    const result: ApplyFilterResult = {
      photoId,
      filterId,
      appliedAt: new Date(),
    };

    this.appliedFilters.push(result);
    return result;
  }

  async getFilterPreview(filterId: string): Promise<{ filterId: string; previewUrl: string }> {
    const filter = AVAILABLE_FILTERS.find((f) => f.id === filterId);
    if (!filter) {
      throw new Error('Filter not found');
    }

    return { filterId: filter.id, previewUrl: filter.previewUrl };
  }
}
